/**
 * Account Export API
 * 
 * Generates a ZIP archive containing the user's complete account data
 * for migration to another Synapsis node.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, verifyPassword } from '@/lib/auth';
import { db, posts, media, follows, users } from '@/db';
import { eq } from 'drizzle-orm';
import * as crypto from 'crypto';

// We'll use a simple in-memory zip approach
// For production, consider using a streaming zip library

interface ExportManifest {
    version: string;
    did: string;
    handle: string;
    sourceNode: string;
    exportedAt: string;
    publicKey: string;
    privateKeyEncrypted: string; // Encrypted with user's password
    salt: string; // For key derivation
    iv: string; // For AES encryption
    signature: string; // Proof of ownership
}

interface ExportProfile {
    displayName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    headerUrl: string | null;
}

interface ExportPost {
    id: string;
    content: string;
    createdAt: string;
    replyToApId: string | null;
    media: { filename: string; url: string; altText: string | null }[];
}

interface ExportFollowing {
    actorUrl: string;
    handle: string;
}

/**
 * Encrypt the private key with user's password using AES-256-GCM
 */
function encryptPrivateKey(privateKey: string, password: string): { encrypted: string; salt: string; iv: string } {
    const salt = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);

    // Derive key from password
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

    // Encrypt
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(privateKey, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    // Combine encrypted data with auth tag
    const combined = Buffer.concat([Buffer.from(encrypted, 'base64'), authTag]).toString('base64');

    return {
        encrypted: combined,
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
    };
}

/**
 * Sign the manifest to prove ownership
 */
function signManifest(manifest: Omit<ExportManifest, 'signature'>, privateKey: string): string {
    const data = JSON.stringify(manifest);
    const sign = crypto.createSign('sha256');
    sign.update(data);
    return sign.sign(privateKey, 'base64');
}

export async function POST(req: NextRequest) {
    try {
        const user = await requireAuth();

        const body = await req.json();
        const { password } = body;

        if (!password) {
            return NextResponse.json({ error: 'Password required for export' }, { status: 400 });
        }

        // Verify password
        if (!user.passwordHash) {
            return NextResponse.json({ error: 'Account has no password set' }, { status: 400 });
        }

        const isValid = await verifyPassword(password, user.passwordHash);
        if (!isValid) {
            return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
        }

        // Check if account has already moved
        if (user.movedTo) {
            return NextResponse.json({ error: 'This account has already been migrated' }, { status: 400 });
        }

        const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';

        // Fetch user's posts
        const userPosts = await db.query.posts.findMany({
            where: eq(posts.userId, user.id),
            with: {
                media: true,
            },
            orderBy: (posts, { desc }) => [desc(posts.createdAt)],
        });

        // Fetch user's following list
        const userFollowing = await db.query.follows.findMany({
            where: eq(follows.followerId, user.id),
            with: {
                following: true,
            },
        });

        // Build export data
        const exportPosts: ExportPost[] = userPosts.map(post => ({
            id: post.id,
            content: post.content,
            createdAt: post.createdAt.toISOString(),
            replyToApId: post.replyToId ? `https://${nodeDomain}/posts/${post.replyToId}` : null,
            media: (post.media || []).map((m, idx) => ({
                filename: `${post.id}_${idx}${getExtension(m.url)}`,
                url: m.url,
                altText: m.altText,
            })),
        }));

        const exportFollowing: ExportFollowing[] = userFollowing.map(f => ({
            actorUrl: `https://${nodeDomain}/users/${f.following.handle}`,
            handle: f.following.handle,
        }));

        const profile: ExportProfile = {
            displayName: user.displayName,
            bio: user.bio,
            avatarUrl: user.avatarUrl,
            headerUrl: user.headerUrl,
        };

        // Encrypt private key
        const privateKey = user.privateKeyEncrypted || '';
        const { encrypted, salt, iv } = encryptPrivateKey(privateKey, password);

        // Build manifest (without signature first)
        const manifestData: Omit<ExportManifest, 'signature'> = {
            version: '1.0',
            did: user.did,
            handle: user.handle,
            sourceNode: nodeDomain,
            exportedAt: new Date().toISOString(),
            publicKey: user.publicKey,
            privateKeyEncrypted: encrypted,
            salt,
            iv,
        };

        // Sign the manifest
        const signature = signManifest(manifestData, privateKey);
        const manifest: ExportManifest = { ...manifestData, signature };

        // Build the export package as JSON (ZIP would require additional library)
        // For MVP, we'll use a JSON format that can be easily converted to ZIP later
        const exportPackage = {
            manifest,
            profile,
            posts: exportPosts,
            following: exportFollowing,
            // Media URLs are included in posts, client can download them separately
            // For full ZIP export, we'd need to fetch and bundle media files
        };

        return NextResponse.json({
            success: true,
            export: exportPackage,
            stats: {
                posts: exportPosts.length,
                following: exportFollowing.length,
                mediaFiles: exportPosts.reduce((sum, p) => sum + p.media.length, 0),
            },
        });

    } catch (error) {
        if (error instanceof Error && error.message === 'Authentication required') {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        console.error('Export error:', error);
        return NextResponse.json({ error: 'Export failed' }, { status: 500 });
    }
}

function getExtension(url: string): string {
    const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    return match ? `.${match[1]}` : '.bin';
}
