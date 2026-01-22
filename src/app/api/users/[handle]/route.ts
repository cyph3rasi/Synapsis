import { NextResponse } from 'next/server';
import { db, users } from '@/db';
import { eq } from 'drizzle-orm';
import { userToActor } from '@/lib/activitypub/actor';
import { resolveRemoteUser } from '@/lib/activitypub/fetch';

type RouteContext = { params: Promise<{ handle: string }> };

const decodeEntities = (value: string) =>
    value
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

const sanitizeText = (value?: string | null) => {
    if (!value) return null;
    const withoutTags = value.replace(/<[^>]*>/g, ' ');
    const decoded = decodeEntities(withoutTags);
    return decoded.replace(/\s+/g, ' ').trim() || null;
};

export async function GET(request: Request, context: RouteContext) {
    try {
        const { handle } = await context.params;
        const cleanHandle = handle.toLowerCase().replace(/^@/, '');
        const [remoteHandle, remoteDomain] = cleanHandle.split('@');

        // Return mock user if no database
        if (!db) {
            return NextResponse.json({
                user: {
                    id: 'demo-user',
                    handle: cleanHandle,
                    displayName: cleanHandle,
                    bio: 'This is a demo profile.',
                    avatarUrl: null,
                    headerUrl: null,
                    followersCount: 0,
                    followingCount: 0,
                    postsCount: 0,
                    createdAt: new Date().toISOString(),
                }
            });
        }

        const user = await db.query.users.findFirst({
            where: eq(users.handle, cleanHandle),
        });

        if (!user) {
            if (remoteHandle && remoteDomain) {
                const remoteProfile = await resolveRemoteUser(remoteHandle, remoteDomain);
                if (remoteProfile) {
                    const displayName = sanitizeText(remoteProfile.name) || sanitizeText(remoteProfile.preferredUsername) || remoteHandle;
                    const iconUrl = typeof remoteProfile.icon === 'string' ? remoteProfile.icon : remoteProfile.icon?.url;
                    const headerUrl = typeof remoteProfile.image === 'string' ? remoteProfile.image : remoteProfile.image?.url;
                    const profileUrl = typeof remoteProfile.url === 'string' ? remoteProfile.url : remoteProfile.id;
                    return NextResponse.json({
                        user: {
                            id: remoteProfile.id || profileUrl || `remote:${cleanHandle}`,
                            handle: `${remoteProfile.preferredUsername || remoteHandle}@${remoteDomain}`,
                            displayName,
                            bio: sanitizeText(remoteProfile.summary),
                            avatarUrl: iconUrl ?? null,
                            headerUrl: headerUrl ?? null,
                            followersCount: 0,
                            followingCount: 0,
                            postsCount: 0,
                            website: profileUrl ?? null,
                            createdAt: new Date().toISOString(),
                            isRemote: true,
                            profileUrl: profileUrl ?? null,
                        }
                    });
                }
            }
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }
        if (user.isSuspended) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Check if ActivityPub request
        const accept = request.headers.get('accept') || '';
        if (accept.includes('application/activity+json') || accept.includes('application/ld+json')) {
            const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';
            const actor = userToActor(user, nodeDomain);
            return NextResponse.json(actor, {
                headers: {
                    'Content-Type': 'application/activity+json',
                },
            });
        }

        // Return user profile (without sensitive data)
        return NextResponse.json({
            user: {
                id: user.id,
                handle: user.handle,
                displayName: user.displayName,
                bio: user.bio,
                avatarUrl: user.avatarUrl,
                headerUrl: user.headerUrl,
                followersCount: user.followersCount,
                followingCount: user.followingCount,
                postsCount: user.postsCount,
                createdAt: user.createdAt,
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        return NextResponse.json({ error: 'Failed to get user' }, { status: 500 });
    }
}
