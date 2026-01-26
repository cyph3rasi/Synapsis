import { NextResponse } from 'next/server';
import { db, posts, users, notifications } from '@/db';
import { requireAuth } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Extract domain from a swarm post ID (swarm:domain:postId)
 */
function extractSwarmDomain(apId: string | null): string | null {
    if (!apId?.startsWith('swarm:')) return null;
    const parts = apId.split(':');
    return parts.length >= 2 ? parts[1] : null;
}

/**
 * Check if a post is from a swarm node
 */
function isSwarmPost(apId: string | null): boolean {
    return apId?.startsWith('swarm:') ?? false;
}

/**
 * Extract the original post ID from a swarm apId
 */
function extractSwarmPostId(apId: string): string | null {
    const parts = apId.split(':');
    return parts.length >= 3 ? parts[2] : null;
}

// Repost a post
export async function POST(request: Request, context: RouteContext) {
    try {
        const user = await requireAuth();
        const { id: postId } = await context.params;
        const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';

        if (user.isSuspended || user.isSilenced) {
            return NextResponse.json({ error: 'Account restricted' }, { status: 403 });
        }

        // Check if post exists
        const originalPost = await db.query.posts.findFirst({
            where: eq(posts.id, postId),
        });

        if (!originalPost) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }
        if (originalPost.isRemoved) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }

        // Check if already reposted by this user
        const existingRepost = await db.query.posts.findFirst({
            where: and(
                eq(posts.userId, user.id),
                eq(posts.repostOfId, postId),
                eq(posts.isRemoved, false)
            ),
        });

        if (existingRepost) {
            return NextResponse.json({ error: 'Already reposted' }, { status: 400 });
        }

        // Create repost
        const repostId = crypto.randomUUID();
        const [repost] = await db.insert(posts).values({
            userId: user.id,
            content: '', // Reposts don't have their own content
            repostOfId: postId,
            apId: `https://${nodeDomain}/posts/${repostId}`,
            apUrl: `https://${nodeDomain}/posts/${repostId}`,
        }).returning();

        // Update original post's repost count
        await db.update(posts)
            .set({ repostsCount: originalPost.repostsCount + 1 })
            .where(eq(posts.id, postId));

        // Update user's post count
        await db.update(users)
            .set({ postsCount: user.postsCount + 1 })
            .where(eq(users.id, user.id));

        if (originalPost.userId !== user.id) {
            await db.insert(notifications).values({
                userId: originalPost.userId,
                actorId: user.id,
                postId,
                type: 'repost',
            });
        }

        // SWARM-FIRST: Deliver repost to swarm node
        if (isSwarmPost(originalPost.apId)) {
            const targetDomain = extractSwarmDomain(originalPost.apId);
            const originalPostIdOnRemote = extractSwarmPostId(originalPost.apId!);
            
            if (targetDomain && originalPostIdOnRemote) {
                (async () => {
                    try {
                        const { deliverSwarmRepost } = await import('@/lib/swarm/interactions');
                        
                        const result = await deliverSwarmRepost(targetDomain, {
                            postId: originalPostIdOnRemote,
                            repost: {
                                actorHandle: user.handle,
                                actorDisplayName: user.displayName || user.handle,
                                actorAvatarUrl: user.avatarUrl || undefined,
                                actorNodeDomain: nodeDomain,
                                repostId: repost.id,
                                interactionId: crypto.randomUUID(),
                                timestamp: new Date().toISOString(),
                            },
                        });
                        
                        if (result.success) {
                            console.log(`[Swarm] Repost delivered to ${targetDomain}`);
                        } else {
                            console.warn(`[Swarm] Repost delivery failed: ${result.error}`);
                        }
                    } catch (err) {
                        console.error('[Swarm] Error delivering repost:', err);
                    }
                })();
            }
        } else if (originalPost.apId) {
            // FALLBACK: Use ActivityPub for non-swarm posts
            (async () => {
                try {
                    const { createAnnounceActivity } = await import('@/lib/activitypub/activities');
                    const { getFollowerInboxes, deliverToFollowers } = await import('@/lib/activitypub/outbox');

                    // Send Announce to our followers
                    const followerInboxes = await getFollowerInboxes(user.id);
                    if (followerInboxes.length > 0) {
                        const announceActivity = createAnnounceActivity(
                            user,
                            originalPost.apId!,
                            nodeDomain,
                            repost.id
                        );

                        const privateKey = user.privateKeyEncrypted;
                        if (privateKey) {
                            const keyId = `https://${nodeDomain}/users/${user.handle}#main-key`;
                            const result = await deliverToFollowers(announceActivity, followerInboxes, privateKey, keyId);
                            console.log(`[Federation] Announce for ${originalPost.apId} delivered to ${result.delivered}/${followerInboxes.length} inboxes`);
                        }
                    }
                } catch (err) {
                    console.error('[Federation] Error federating repost:', err);
                }
            })();
        }

        return NextResponse.json({ success: true, repost, reposted: true });
    } catch (error) {
        if (error instanceof Error && error.message === 'Authentication required') {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        return NextResponse.json({ error: 'Failed to repost' }, { status: 500 });
    }
}

// Unrepost a post
export async function DELETE(request: Request, context: RouteContext) {
    try {
        const user = await requireAuth();
        const { id: postId } = await context.params;

        if (user.isSuspended || user.isSilenced) {
            return NextResponse.json({ error: 'Account restricted' }, { status: 403 });
        }

        // Check if original post exists
        const originalPost = await db.query.posts.findFirst({
            where: eq(posts.id, postId),
        });

        // Find the repost by this user
        const repost = await db.query.posts.findFirst({
            where: and(
                eq(posts.userId, user.id),
                eq(posts.repostOfId, postId),
                eq(posts.isRemoved, false)
            ),
        });

        if (!repost) {
            return NextResponse.json({ error: 'Not reposted' }, { status: 400 });
        }

        // Mark repost as removed
        await db.update(posts)
            .set({ isRemoved: true })
            .where(eq(posts.id, repost.id));

        // Update original post's repost count
        if (originalPost) {
            await db.update(posts)
                .set({ repostsCount: Math.max(0, originalPost.repostsCount - 1) })
                .where(eq(posts.id, postId));
        }

        // Update user's post count
        await db.update(users)
            .set({ postsCount: Math.max(0, user.postsCount - 1) })
            .where(eq(users.id, user.id));

        return NextResponse.json({ success: true, reposted: false });
    } catch (error) {
        if (error instanceof Error && error.message === 'Authentication required') {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        return NextResponse.json({ error: 'Failed to unrepost' }, { status: 500 });
    }
}
