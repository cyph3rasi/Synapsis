import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, follows, users, notifications, remoteFollows } from '@/db';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';
import { resolveRemoteUser } from '@/lib/activitypub/fetch';
import { createFollowActivity, createUndoActivity } from '@/lib/activitypub/activities';
import { deliverActivity } from '@/lib/activitypub/outbox';
import { cacheRemoteUserPosts } from '@/lib/activitypub/cache';
import { isSwarmNode, deliverSwarmFollow, deliverSwarmUnfollow, cacheSwarmUserPosts } from '@/lib/swarm/interactions';

type RouteContext = { params: Promise<{ handle: string }> };

const parseRemoteHandle = (handle: string) => {
    const clean = handle.toLowerCase().replace(/^@/, '');
    const parts = clean.split('@').filter(Boolean);
    if (parts.length === 2) {
        return { handle: parts[0], domain: parts[1] };
    }
    return null;
};

// Strip HTML tags from a string (for Mastodon bios that come as HTML)
const stripHtml = (html: string | null | undefined): string | null => {
    if (!html) return null;
    return html.replace(/<[^>]*>/g, '').trim() || null;
};

// Check follow status
export async function GET(request: Request, context: RouteContext) {
    try {
        const currentUser = await requireAuth();
        const { handle } = await context.params;
        const cleanHandle = handle.toLowerCase().replace(/^@/, '');
        const remote = parseRemoteHandle(handle);

        if (currentUser.isSuspended || currentUser.isSilenced) {
            return NextResponse.json({ error: 'Account restricted' }, { status: 403 });
        }

        if (remote) {
            if (!db) {
                return NextResponse.json({ error: 'Database not available' }, { status: 503 });
            }
            const targetHandle = `${remote.handle}@${remote.domain}`;
            const existingRemoteFollow = await db.query.remoteFollows.findFirst({
                where: and(
                    eq(remoteFollows.followerId, currentUser.id),
                    eq(remoteFollows.targetHandle, targetHandle)
                ),
            });
            return NextResponse.json({ following: !!existingRemoteFollow, remote: true });
        }

        if (!db) {
            return NextResponse.json({ error: 'Database not available' }, { status: 503 });
        }

        const targetUser = await db.query.users.findFirst({
            where: eq(users.handle, cleanHandle),
        });

        if (!targetUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }
        if (targetUser.isSuspended) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        if (targetUser.id === currentUser.id) {
            return NextResponse.json({ following: false, self: true });
        }

        const existingFollow = await db.query.follows.findFirst({
            where: and(
                eq(follows.followerId, currentUser.id),
                eq(follows.followingId, targetUser.id)
            ),
        });

        return NextResponse.json({ following: !!existingFollow });
    } catch (error) {
        if (error instanceof Error && error.message === 'Authentication required') {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        console.error('Follow status error:', error);
        return NextResponse.json({ error: 'Failed to get follow status' }, { status: 500 });
    }
}

// Follow a user
export async function POST(request: Request, context: RouteContext) {
    try {
        const currentUser = await requireAuth();
        const { handle } = await context.params;
        const cleanHandle = handle.toLowerCase().replace(/^@/, '');
        const remote = parseRemoteHandle(handle);
        const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';

        if (currentUser.isSuspended || currentUser.isSilenced) {
            return NextResponse.json({ error: 'Account restricted' }, { status: 403 });
        }

        if (remote) {
            const targetHandle = `${remote.handle}@${remote.domain}`;
            
            // Check if already following
            const existingRemoteFollow = await db.query.remoteFollows.findFirst({
                where: and(
                    eq(remoteFollows.followerId, currentUser.id),
                    eq(remoteFollows.targetHandle, targetHandle)
                ),
            });
            if (existingRemoteFollow) {
                return NextResponse.json({ error: 'Already following' }, { status: 400 });
            }

            // SWARM-FIRST: Check if this is a Synapsis swarm node
            const isSwarm = await isSwarmNode(remote.domain);
            
            if (isSwarm) {
                // Use swarm protocol for Synapsis nodes
                const activityId = crypto.randomUUID();
                
                const result = await deliverSwarmFollow(remote.domain, {
                    targetHandle: remote.handle,
                    follow: {
                        followerHandle: currentUser.handle,
                        followerDisplayName: currentUser.displayName || currentUser.handle,
                        followerAvatarUrl: currentUser.avatarUrl || undefined,
                        followerBio: currentUser.bio || undefined,
                        followerNodeDomain: nodeDomain,
                        interactionId: activityId,
                        timestamp: new Date().toISOString(),
                    },
                });

                if (!result.success) {
                    console.warn(`[Swarm] Follow delivery failed, falling back to ActivityPub: ${result.error}`);
                    // Fall through to ActivityPub below
                } else {
                    // Swarm follow succeeded - store the follow locally
                    await db.insert(remoteFollows).values({
                        followerId: currentUser.id,
                        targetHandle,
                        targetActorUrl: `swarm://${remote.domain}/${remote.handle}`,
                        inboxUrl: `https://${remote.domain}/api/swarm/interactions/inbox`,
                        activityId,
                        displayName: null, // Will be fetched later
                        bio: null,
                        avatarUrl: null,
                    });

                    // Update the user's following count
                    await db.update(users)
                        .set({ followingCount: currentUser.followingCount + 1 })
                        .where(eq(users.id, currentUser.id));

                    // Cache the remote user's recent posts in the background
                    cacheSwarmUserPosts(remote.handle, remote.domain, targetHandle, 20)
                        .then(result => console.log(`[Swarm] Cached ${result.cached} posts for ${targetHandle}`))
                        .catch(err => console.error('[Swarm] Error caching remote posts:', err));

                    console.log(`[Swarm] Follow delivered to ${remote.domain} for @${remote.handle}`);
                    return NextResponse.json({ success: true, following: true, remote: true, swarm: true });
                }
            }

            // FALLBACK: Use ActivityPub for non-swarm nodes or if swarm failed
            const remoteProfile = await resolveRemoteUser(remote.handle, remote.domain);
            if (!remoteProfile) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 });
            }
            const targetInbox = remoteProfile.endpoints?.sharedInbox || remoteProfile.inbox;
            if (!targetInbox) {
                return NextResponse.json({ error: 'Remote inbox not available' }, { status: 400 });
            }

            const activityId = crypto.randomUUID();
            const followActivity = createFollowActivity(currentUser, remoteProfile.id, nodeDomain, activityId);
            const keyId = `https://${nodeDomain}/users/${currentUser.handle}#main-key`;
            const privateKey = currentUser.privateKeyEncrypted;
            if (!privateKey) {
                return NextResponse.json({ error: 'Missing signing key' }, { status: 500 });
            }
            const result = await deliverActivity(followActivity, targetInbox, privateKey, keyId);
            if (!result.success) {
                return NextResponse.json({ error: result.error || 'Failed to follow remote user' }, { status: 502 });
            }

            // Extract avatar URL from remote profile
            let avatarUrl: string | null = null;
            if (remoteProfile.icon) {
                if (typeof remoteProfile.icon === 'string') {
                    avatarUrl = remoteProfile.icon;
                } else if (typeof remoteProfile.icon === 'object' && remoteProfile.icon.url) {
                    avatarUrl = remoteProfile.icon.url;
                }
            }

            await db.insert(remoteFollows).values({
                followerId: currentUser.id,
                targetHandle,
                targetActorUrl: remoteProfile.id,
                inboxUrl: targetInbox,
                activityId,
                displayName: remoteProfile.name || null,
                bio: stripHtml(remoteProfile.summary),
                avatarUrl,
            });

            // Update the user's following count
            await db.update(users)
                .set({ followingCount: currentUser.followingCount + 1 })
                .where(eq(users.id, currentUser.id));

            // Cache the remote user's recent posts in the background
            const origin = new URL(request.url).origin;
            cacheRemoteUserPosts(remoteProfile, targetHandle, origin, 20)
                .then(result => console.log(`Cached ${result.cached} posts for ${targetHandle}`))
                .catch(err => console.error('Error caching remote posts:', err));

            return NextResponse.json({ success: true, following: true, remote: true });
        }

        if (!db) {
            return NextResponse.json({ error: 'Database not available' }, { status: 503 });
        }

        // Find target user
        const targetUser = await db.query.users.findFirst({
            where: eq(users.handle, cleanHandle),
        });

        if (!targetUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }
        if (targetUser.isSuspended) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Can't follow yourself
        if (targetUser.id === currentUser.id) {
            return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 });
        }

        // Check if already following
        const existingFollow = await db.query.follows.findFirst({
            where: and(
                eq(follows.followerId, currentUser.id),
                eq(follows.followingId, targetUser.id)
            ),
        });

        if (existingFollow) {
            return NextResponse.json({ error: 'Already following' }, { status: 400 });
        }

        // Create follow
        await db.insert(follows).values({
            followerId: currentUser.id,
            followingId: targetUser.id,
        });

        if (currentUser.id !== targetUser.id) {
            // Create notification with actor info stored directly
            await db.insert(notifications).values({
                userId: targetUser.id,
                actorId: currentUser.id,
                actorHandle: currentUser.handle,
                actorDisplayName: currentUser.displayName,
                actorAvatarUrl: currentUser.avatarUrl,
                actorNodeDomain: null, // Local user
                type: 'follow',
            });

            // Also notify bot owner if this is a bot being followed
            if (targetUser.isBot && targetUser.botOwnerId) {
                await db.insert(notifications).values({
                    userId: targetUser.botOwnerId,
                    actorId: currentUser.id,
                    actorHandle: currentUser.handle,
                    actorDisplayName: currentUser.displayName,
                    actorAvatarUrl: currentUser.avatarUrl,
                    actorNodeDomain: null,
                    type: 'follow',
                });
            }
        }

        // Update counts
        await db.update(users)
            .set({ followingCount: currentUser.followingCount + 1 })
            .where(eq(users.id, currentUser.id));

        await db.update(users)
            .set({ followersCount: targetUser.followersCount + 1 })
            .where(eq(users.id, targetUser.id));

        // TODO: Send ActivityPub Follow activity

        return NextResponse.json({ success: true, following: true });
    } catch (error) {
        if (error instanceof Error && error.message === 'Authentication required') {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        console.error('Follow error:', error);
        return NextResponse.json({ error: 'Failed to follow' }, { status: 500 });
    }
}

// Unfollow a user
export async function DELETE(request: Request, context: RouteContext) {
    try {
        const currentUser = await requireAuth();
        const { handle } = await context.params;
        const cleanHandle = handle.toLowerCase().replace(/^@/, '');
        const remote = parseRemoteHandle(handle);
        const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';

        if (remote) {
            if (!db) {
                return NextResponse.json({ error: 'Database not available' }, { status: 503 });
            }
            const targetHandle = `${remote.handle}@${remote.domain}`;
            const existingRemoteFollow = await db.query.remoteFollows.findFirst({
                where: and(
                    eq(remoteFollows.followerId, currentUser.id),
                    eq(remoteFollows.targetHandle, targetHandle)
                ),
            });
            if (!existingRemoteFollow) {
                return NextResponse.json({ error: 'Not following' }, { status: 400 });
            }

            // SWARM-FIRST: Check if this is a swarm follow (swarm:// actor URL)
            const isSwarmFollow = existingRemoteFollow.targetActorUrl.startsWith('swarm://');
            
            if (isSwarmFollow) {
                // Use swarm protocol for unfollow
                const result = await deliverSwarmUnfollow(remote.domain, {
                    targetHandle: remote.handle,
                    unfollow: {
                        followerHandle: currentUser.handle,
                        followerNodeDomain: nodeDomain,
                        interactionId: crypto.randomUUID(),
                        timestamp: new Date().toISOString(),
                    },
                });

                if (!result.success) {
                    console.warn(`[Swarm] Unfollow delivery failed: ${result.error}`);
                    // Continue anyway - remove local record
                }

                // Remove the follow record
                await db.delete(remoteFollows).where(eq(remoteFollows.id, existingRemoteFollow.id));

                // Update the user's following count
                await db.update(users)
                    .set({ followingCount: Math.max(0, currentUser.followingCount - 1) })
                    .where(eq(users.id, currentUser.id));

                console.log(`[Swarm] Unfollow delivered to ${remote.domain}`);
                return NextResponse.json({ success: true, following: false, remote: true, swarm: true });
            }

            // FALLBACK: Use ActivityPub for non-swarm follows
            const originalFollow = createFollowActivity(
                currentUser,
                existingRemoteFollow.targetActorUrl,
                nodeDomain,
                existingRemoteFollow.activityId
            );
            const undoActivity = createUndoActivity(currentUser, originalFollow, nodeDomain, crypto.randomUUID());
            const keyId = `https://${nodeDomain}/users/${currentUser.handle}#main-key`;
            const privateKey = currentUser.privateKeyEncrypted;
            if (!privateKey) {
                return NextResponse.json({ error: 'Missing signing key' }, { status: 500 });
            }
            const result = await deliverActivity(undoActivity, existingRemoteFollow.inboxUrl, privateKey, keyId);
            if (!result.success) {
                return NextResponse.json({ error: result.error || 'Failed to unfollow remote user' }, { status: 502 });
            }
            await db.delete(remoteFollows).where(eq(remoteFollows.id, existingRemoteFollow.id));

            // Update the user's following count
            await db.update(users)
                .set({ followingCount: Math.max(0, currentUser.followingCount - 1) })
                .where(eq(users.id, currentUser.id));

            return NextResponse.json({ success: true, following: false, remote: true });
        }

        if (!db) {
            return NextResponse.json({ error: 'Database not available' }, { status: 503 });
        }

        // Find target user
        const targetUser = await db.query.users.findFirst({
            where: eq(users.handle, cleanHandle),
        });

        if (!targetUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }
        if (targetUser.isSuspended) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Find existing follow
        const existingFollow = await db.query.follows.findFirst({
            where: and(
                eq(follows.followerId, currentUser.id),
                eq(follows.followingId, targetUser.id)
            ),
        });

        if (!existingFollow) {
            return NextResponse.json({ error: 'Not following' }, { status: 400 });
        }

        // Remove follow
        await db.delete(follows).where(eq(follows.id, existingFollow.id));

        // Update counts
        await db.update(users)
            .set({ followingCount: Math.max(0, currentUser.followingCount - 1) })
            .where(eq(users.id, currentUser.id));

        await db.update(users)
            .set({ followersCount: Math.max(0, targetUser.followersCount - 1) })
            .where(eq(users.id, targetUser.id));

        // TODO: Send ActivityPub Undo Follow activity

        return NextResponse.json({ success: true, following: false });
    } catch (error) {
        if (error instanceof Error && error.message === 'Authentication required') {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        console.error('Unfollow error:', error);
        return NextResponse.json({ error: 'Failed to unfollow' }, { status: 500 });
    }
}
