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

const fetchCollectionCount = async (url?: string | null) => {
    if (!url) return 0;
    try {
        const res = await fetch(url, {
            headers: {
                'Accept': 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
            },
        });
        if (!res.ok) return 0;
        const data = await res.json();
        if (typeof data?.totalItems === 'number') return data.totalItems;
    } catch {
        return 0;
    }
    return 0;
};

/**
 * Fetch remote user profile via Swarm API (preferred for Synapsis nodes)
 */
const fetchSwarmProfile = async (handle: string, domain: string) => {
    try {
        const protocol = domain.includes('localhost') ? 'http' : 'https';
        const url = `${protocol}://${domain}/api/swarm/users/${handle}`;
        const res = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.profile) return null;
        return data;
    } catch {
        return null;
    }
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
                // Try Swarm API first (for Synapsis nodes)
                const swarmData = await fetchSwarmProfile(remoteHandle, remoteDomain);
                if (swarmData?.profile) {
                    const profile = swarmData.profile;
                    return NextResponse.json({
                        user: {
                            id: `swarm:${remoteDomain}:${profile.handle}`,
                            handle: `${profile.handle}@${remoteDomain}`,
                            displayName: profile.displayName,
                            bio: profile.bio || null,
                            avatarUrl: profile.avatarUrl || null,
                            headerUrl: profile.headerUrl || null,
                            followersCount: profile.followersCount,
                            followingCount: profile.followingCount,
                            postsCount: profile.postsCount,
                            website: profile.website || null,
                            createdAt: profile.createdAt,
                            isRemote: true,
                            isSwarm: true,
                            nodeDomain: remoteDomain,
                            isBot: profile.isBot || false,
                        }
                    });
                }

                // Fall back to ActivityPub for non-Synapsis nodes
                const remoteProfile = await resolveRemoteUser(remoteHandle, remoteDomain);
                if (remoteProfile) {
                    const displayName = sanitizeText(remoteProfile.name) || sanitizeText(remoteProfile.preferredUsername) || remoteHandle;
                    const iconUrl = typeof remoteProfile.icon === 'string' ? remoteProfile.icon : remoteProfile.icon?.url;
                    const headerUrl = typeof remoteProfile.image === 'string' ? remoteProfile.image : remoteProfile.image?.url;
                    const profileUrl = typeof remoteProfile.url === 'string' ? remoteProfile.url : remoteProfile.id;
                    const [followersCount, followingCount, postsCount] = await Promise.all([
                        fetchCollectionCount(remoteProfile.followers),
                        fetchCollectionCount(remoteProfile.following),
                        fetchCollectionCount(remoteProfile.outbox),
                    ]);
                    return NextResponse.json({
                        user: {
                            id: remoteProfile.id || profileUrl || `remote:${cleanHandle}`,
                            handle: `${remoteProfile.preferredUsername || remoteHandle}@${remoteDomain}`,
                            displayName,
                            bio: sanitizeText(remoteProfile.summary),
                            avatarUrl: iconUrl ?? null,
                            headerUrl: headerUrl ?? null,
                            followersCount,
                            followingCount,
                            postsCount,
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
        // Include bot info if this is a bot account
        const userResponse: Record<string, unknown> = {
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
            website: user.website,
            movedTo: user.movedTo,
            isBot: user.isBot,
        };
        
        // If this is a bot, include owner info
        if (user.isBot && user.botOwnerId) {
            const owner = await db.query.users.findFirst({
                where: eq(users.id, user.botOwnerId),
            });
            if (owner) {
                userResponse.botOwner = {
                    id: owner.id,
                    handle: owner.handle,
                    displayName: owner.displayName,
                    avatarUrl: owner.avatarUrl,
                };
            }
        }
        
        return NextResponse.json({ user: userResponse });
    } catch (error) {
        console.error('Get user error:', error);
        return NextResponse.json({ error: 'Failed to get user' }, { status: 500 });
    }
}
