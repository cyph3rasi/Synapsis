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
    const lastColonIndex = apId.lastIndexOf(':');
    if (lastColonIndex <= 6) return null;
    return apId.substring(6, lastColonIndex);
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
    if (!apId) return null;
    const lastColonIndex = apId.lastIndexOf(':');
    if (lastColonIndex === -1) return null;
    return apId.substring(lastColonIndex + 1);
}

// Repost a post
export async function POST(request: Request, context: RouteContext) {
    try {
        const user = await requireAuth();
        const { id: rawId } = await context.params;
        const postId = decodeURIComponent(rawId);
        const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';

        if (user.isSuspended || user.isSilenced) {
            return NextResponse.json({ error: 'Account restricted' }, { status: 403 });
        }

        // Handle swarm posts (format: swarm:domain:uuid)
        if (postId.startsWith('swarm:')) {
            const targetDomain = extractSwarmDomain(postId);
            const originalPostId = extractSwarmPostId(postId);

            if (!targetDomain || !originalPostId) {
                return NextResponse.json({ error: 'Invalid swarm post ID' }, { status: 400 });
            }

            // Deliver repost directly to the origin node
            const { deliverSwarmRepost } = await import('@/lib/swarm/interactions');

            const result = await deliverSwarmRepost(targetDomain, {
                postId: originalPostId,
                repost: {
                    actorHandle: user.handle,
                    actorDisplayName: user.displayName || user.handle,
                    actorAvatarUrl: user.avatarUrl || undefined,
                    actorNodeDomain: nodeDomain,
                    repostId: crypto.randomUUID(),
                    interactionId: crypto.randomUUID(),
                    timestamp: new Date().toISOString(),
                },
            });

            if (!result.success) {
                console.error(`[Swarm] Repost delivery failed: ${result.error}`);
                return NextResponse.json({ error: 'Failed to deliver repost to remote node' }, { status: 502 });
            }

            console.log(`[Swarm] Repost delivered to ${targetDomain} for post ${originalPostId}`);
            return NextResponse.json({ success: true, reposted: true });
        }

        // Local post - check if it exists
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
            // Create notification with actor info stored directly
            await db.insert(notifications).values({
                userId: originalPost.userId,
                actorId: user.id,
                actorHandle: user.handle,
                actorDisplayName: user.displayName,
                actorAvatarUrl: user.avatarUrl,
                actorNodeDomain: null, // Local user
                postId,
                postContent: originalPost.content?.slice(0, 200) || null,
                type: 'repost',
            });

            // Also notify bot owner if this is a bot's post
            const postAuthor = await db.query.users.findFirst({
                where: eq(users.id, originalPost.userId),
            });
            if (postAuthor?.isBot && postAuthor.botOwnerId) {
                await db.insert(notifications).values({
                    userId: postAuthor.botOwnerId,
                    actorId: user.id,
                    actorHandle: user.handle,
                    actorDisplayName: user.displayName,
                    actorAvatarUrl: user.avatarUrl,
                    actorNodeDomain: null,
                    postId,
                    postContent: originalPost.content?.slice(0, 200) || null,
                    type: 'repost',
                });
            }
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
            // Non-swarm posts with apId are legacy - no federation needed
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
        const { id: rawId } = await context.params;
        const postId = decodeURIComponent(rawId);
        const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';

        if (user.isSuspended || user.isSilenced) {
            return NextResponse.json({ error: 'Account restricted' }, { status: 403 });
        }

        // Handle swarm posts (format: swarm:domain:uuid)
        if (postId.startsWith('swarm:')) {
            const targetDomain = extractSwarmDomain(postId);
            const originalPostId = extractSwarmPostId(postId);

            if (!targetDomain || !originalPostId) {
                return NextResponse.json({ error: 'Invalid swarm post ID' }, { status: 400 });
            }

            // Deliver unrepost directly to the origin node
            const { deliverSwarmUnrepost } = await import('@/lib/swarm/interactions');

            const result = await deliverSwarmUnrepost(targetDomain, {
                postId: originalPostId,
                unrepost: {
                    actorHandle: user.handle,
                    actorNodeDomain: nodeDomain,
                    interactionId: crypto.randomUUID(),
                    timestamp: new Date().toISOString(),
                },
            });

            if (!result.success) {
                console.error(`[Swarm] Unrepost delivery failed: ${result.error}`);
                return NextResponse.json({ error: 'Failed to deliver unrepost to remote node' }, { status: 502 });
            }

            console.log(`[Swarm] Unrepost delivered to ${targetDomain} for post ${originalPostId}`);
            return NextResponse.json({ success: true, reposted: false });
        }

        // Local post - check if original post exists
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
