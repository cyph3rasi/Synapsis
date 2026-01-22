/**
 * Account Import API
 * 
 * Imports an account from another Synapsis node using the export package.
 * Creates the user with the same DID and migrates all data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, users, posts, media, follows } from '@/db';
import { eq } from 'drizzle-orm';
import * as crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import { upsertHandleEntries } from '@/lib/federation/handles';

interface ImportManifest {
    version: string;
    did: string;
    handle: string;
    sourceNode: string;
    exportedAt: string;
    publicKey: string;
    privateKeyEncrypted: string;
    salt: string;
    iv: string;
    signature: string;
}

interface ImportProfile {
    displayName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    headerUrl: string | null;
}

interface ImportPost {
    id: string;
    content: string;
    createdAt: string;
    replyToApId: string | null;
    media: { filename: string; url: string; altText: string | null }[];
}

interface ImportFollowing {
    actorUrl: string;
    handle: string;
}

interface ImportPackage {
    manifest: ImportManifest;
    profile: ImportProfile;
    posts: ImportPost[];
    following: ImportFollowing[];
}

/**
 * Decrypt the private key using the user's password
 */
function decryptPrivateKey(encrypted: string, password: string, salt: string, iv: string): string {
    const saltBuffer = Buffer.from(salt, 'base64');
    const ivBuffer = Buffer.from(iv, 'base64');
    const encryptedBuffer = Buffer.from(encrypted, 'base64');

    // Separate auth tag (last 16 bytes) from encrypted data
    const authTag = encryptedBuffer.subarray(encryptedBuffer.length - 16);
    const encryptedData = encryptedBuffer.subarray(0, encryptedBuffer.length - 16);

    // Derive key from password
    const key = crypto.pbkdf2Sync(password, saltBuffer, 100000, 32, 'sha256');

    // Decrypt
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuffer);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
}

/**
 * Verify the manifest signature
 */
function verifyManifestSignature(manifest: ImportManifest): boolean {
    try {
        const { signature, ...manifestData } = manifest;
        const data = JSON.stringify(manifestData);

        const verify = crypto.createVerify('sha256');
        verify.update(data);

        return verify.verify(manifest.publicKey, signature, 'base64');
    } catch (error) {
        console.error('Signature verification failed:', error);
        return false;
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { exportData, password, newHandle, acceptedCompliance } = body as {
            exportData: ImportPackage;
            password: string;
            newHandle: string;
            acceptedCompliance: boolean;
        };

        // Validate required fields
        if (!exportData || !password || !newHandle) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        if (!acceptedCompliance) {
            return NextResponse.json({
                error: 'You must accept the content compliance agreement'
            }, { status: 400 });
        }

        const { manifest, profile, posts: importPosts, following } = exportData;

        // Validate manifest version
        if (manifest.version !== '1.0') {
            return NextResponse.json({ error: 'Unsupported export version' }, { status: 400 });
        }

        // Verify signature
        if (!verifyManifestSignature(manifest)) {
            return NextResponse.json({ error: 'Invalid export signature' }, { status: 400 });
        }

        // Decrypt private key to verify password is correct
        let privateKey: string;
        try {
            privateKey = decryptPrivateKey(
                manifest.privateKeyEncrypted,
                password,
                manifest.salt,
                manifest.iv
            );
        } catch (error) {
            return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
        }

        // Check if DID already exists on this node
        const existingDid = await db.query.users.findFirst({
            where: eq(users.did, manifest.did),
        });

        if (existingDid) {
            return NextResponse.json({
                error: 'This account has already been imported to this node'
            }, { status: 409 });
        }

        // Validate handle format
        const handleClean = newHandle.toLowerCase().replace(/^@/, '').trim();
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(handleClean)) {
            return NextResponse.json({
                error: 'Handle must be 3-20 characters, alphanumeric and underscores only'
            }, { status: 400 });
        }

        // Check if handle is available
        const existingHandle = await db.query.users.findFirst({
            where: eq(users.handle, handleClean),
        });

        if (existingHandle) {
            return NextResponse.json({
                error: 'Handle is already taken on this node',
                suggestedHandle: `${handleClean}_${Math.floor(Math.random() * 1000)}`,
            }, { status: 409 });
        }

        const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';
        const oldActorUrl = `https://${manifest.sourceNode}/users/${manifest.handle}`;
        const newActorUrl = `https://${nodeDomain}/users/${handleClean}`;

        // Create the user with the same DID
        const [newUser] = await db.insert(users).values({
            did: manifest.did,
            handle: handleClean,
            displayName: profile.displayName,
            bio: profile.bio,
            avatarUrl: profile.avatarUrl, // Note: URLs from old node might need re-uploading
            headerUrl: profile.headerUrl,
            publicKey: manifest.publicKey,
            privateKeyEncrypted: privateKey,
            movedFrom: oldActorUrl,
            migratedAt: new Date(),
            postsCount: importPosts.length,
        }).returning();

        // Import posts
        let importedPosts = 0;
        for (const post of importPosts) {
            try {
                const [newPost] = await db.insert(posts).values({
                    userId: newUser.id,
                    content: post.content,
                    createdAt: new Date(post.createdAt),
                    apId: `https://${nodeDomain}/posts/${uuid()}`,
                    apUrl: `https://${nodeDomain}/posts/${uuid()}`,
                }).returning();

                // Import media references (URLs point to old location for now)
                for (const mediaItem of post.media) {
                    await db.insert(media).values({
                        userId: newUser.id,
                        postId: newPost.id,
                        url: mediaItem.url, // Original URL - might need re-uploading
                        altText: mediaItem.altText,
                    });
                }

                importedPosts++;
            } catch (error) {
                console.error('Failed to import post:', error);
            }
        }

        // Update handle registry
        await upsertHandleEntries([{
            handle: handleClean,
            did: manifest.did,
            nodeDomain,
            updatedAt: new Date().toISOString(),
        }]);

        // Notify old node about the migration
        try {
            await notifyOldNode(manifest.sourceNode, manifest.handle, newActorUrl, manifest.did, privateKey);
        } catch (error) {
            console.error('Failed to notify old node:', error);
            // Don't fail the import if notification fails
        }

        return NextResponse.json({
            success: true,
            user: {
                id: newUser.id,
                did: newUser.did,
                handle: newUser.handle,
                displayName: newUser.displayName,
            },
            stats: {
                postsImported: importedPosts,
                followingToRestore: following.length,
            },
            message: 'Account imported successfully. Your followers on other Synapsis nodes will be automatically migrated.',
        });

    } catch (error) {
        console.error('Import error:', error);
        return NextResponse.json({ error: 'Import failed' }, { status: 500 });
    }
}

/**
 * Notify the old node that the account has moved
 */
async function notifyOldNode(
    sourceNode: string,
    oldHandle: string,
    newActorUrl: string,
    did: string,
    privateKey: string
): Promise<void> {
    const payload = {
        oldHandle,
        newActorUrl,
        did,
        movedAt: new Date().toISOString(),
    };

    // Sign the payload
    const sign = crypto.createSign('sha256');
    sign.update(JSON.stringify(payload));
    const signature = sign.sign(privateKey, 'base64');

    const response = await fetch(`https://${sourceNode}/api/account/moved`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            ...payload,
            signature,
        }),
    });

    if (!response.ok) {
        throw new Error(`Old node returned ${response.status}`);
    }
}
