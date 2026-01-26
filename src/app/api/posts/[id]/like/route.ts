import { NextResponse } from 'next/server';
import { db, posts, likes, users, notifications } from '@/db';
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
 * Check if a post is from a swarm node (has swarm: prefix in apId)
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

// Like a post
export async function POST(request: Request, context: RouteContext) {
    try {
        const user = await requireAuth();
        const { id: postId } = await context.params;
        const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';

        if (user.isSuspended || user.isSilenced) {
            return NextResponse.json({ error: 'Account restricted' }, { status: 403 });
        }

        // Check if post exists
        const post = await db.query.posts.findFirst({
            where: eq(posts.id, postId),
        });

        if (!post) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }
        if (post.isRemoved) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }

        // Check if already liked
        const existingLike = await db.query.likes.findFirst({
            where: and(
                eq(likes.userId, user.id),
                eq(likes.postId, postId)
            ),
        });

        if (existingLike) {
            return NextResponse.json({ error: 'Already liked' }, { status: 400 });
        }

        // Create like
        await db.insert(likes).values({
            userId: user.id,
            postId,
        });

        // Update post's like count
        await db.update(posts)
            .set({ likesCount: post.likesCount + 1 })
            .where(eq(posts.id, postId));

        if (post.userId !== user.id) {
            // Create notification with actor info stored directly
            await db.insert(notifications).values({
                userId: post.userId,
                actorId: user.id,
                actorHandle: user.handle,
                actorDisplayName: user.displayName,
                actorAvatarUrl: user.avatarUrl,
                actorNodeDomain: null, // Local user
                postId,
                postContent: post.content?.slice(0, 200) || null,
                type: 'like',
            });

            // Also notify bot owner if this is a bot's post
            const postAuthor = await db.query.users.findFirst({
                where: eq(users.id, post.userId),
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
                    postContent: post.content?.slice(0, 200) || null,
                    type: 'like',
                });
            }
        }

        // SWARM-FIRST: Check if this is a swarm post and deliver directly
        if (isSwarmPost(post.apId)) {
            const targetDomain = extractSwarmDomain(post.apId);
            const originalPostId = extractSwarmPostId(post.apId!);
            
            if (targetDomain && originalPostId) {
                (async () => {
                    try {
                        const { deliverSwarmLike } = await import('@/lib/swarm/interactions');
                        
                        const result = await deliverSwarmLike(targetDomain, {
                            postId: originalPostId,
                            like: {
                                actorHandle: user.handle,
                                actorDisplayName: user.displayName || user.handle,
                                actorAvatarUrl: user.avatarUrl || undefined,
                                actorNodeDomain: nodeDomain,
                                interactionId: crypto.randomUUID(),
                                timestamp: new Date().toISOString(),
                            },
                        });
                        
                        if (result.success) {
                            console.log(`[Swarm] Like delivered to ${targetDomain} for post ${originalPostId}`);
                        } else {
                            console.warn(`[Swarm] Like delivery failed: ${result.error}`);
                            // Could fall back to ActivityPub here if needed
                        }
                    } catch (err) {
                        console.error('[Swarm] Error delivering like:', err);
                    }
                })();
            }
        } else if (post.apId) {
            // FALLBACK: Use ActivityPub for non-swarm posts
            (async () => {
                try {
                    const { createLikeActivity } = await import('@/lib/activitypub/activities');
                    const { deliverActivity } = await import('@/lib/activitypub/outbox');

                    // Get the post author's actor URL
                    const postWithAuthor = await db.query.posts.findFirst({
                        where: eq(posts.id, postId),
                        with: { author: true },
                    });

                    if (!postWithAuthor?.author) return;

                    const author = postWithAuthor.author as { handle: string };
                    console.log(`[Federation] Like activity for post ${post.apId} from @${user.handle}`);
                } catch (err) {
                    console.error('[Federation] Error federating like:', err);
                }
            })();
        }

        return NextResponse.json({ success: true, liked: true });
    } catch (error) {
        if (error instanceof Error && error.message === 'Authentication required') {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        return NextResponse.json({ error: 'Failed to like post' }, { status: 500 });
    }
}

// Unlike a post
export async function DELETE(request: Request, context: RouteContext) {
    try {
        const user = await requireAuth();
        const { id: postId } = await context.params;
        const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';

        if (user.isSuspended || user.isSilenced) {
            return NextResponse.json({ error: 'Account restricted' }, { status: 403 });
        }

        // Check if post exists
        const post = await db.query.posts.findFirst({
            where: eq(posts.id, postId),
        });

        if (!post) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }
        if (post.isRemoved) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }

        // Find the like
        const existingLike = await db.query.likes.findFirst({
            where: and(
                eq(likes.userId, user.id),
                eq(likes.postId, postId)
            ),
        });

        if (!existingLike) {
            return NextResponse.json({ error: 'Not liked' }, { status: 400 });
        }

        // Remove like
        await db.delete(likes).where(eq(likes.id, existingLike.id));

        // Update post's like count
        await db.update(posts)
            .set({ likesCount: Math.max(0, post.likesCount - 1) })
            .where(eq(posts.id, postId));

        // SWARM-FIRST: Deliver unlike to swarm node
        if (isSwarmPost(post.apId)) {
            const targetDomain = extractSwarmDomain(post.apId);
            const originalPostId = extractSwarmPostId(post.apId!);
            
            if (targetDomain && originalPostId) {
                (async () => {
                    try {
                        const { deliverSwarmUnlike } = await import('@/lib/swarm/interactions');
                        
                        const result = await deliverSwarmUnlike(targetDomain, {
                            postId: originalPostId,
                            unlike: {
                                actorHandle: user.handle,
                                actorNodeDomain: nodeDomain,
                                interactionId: crypto.randomUUID(),
                                timestamp: new Date().toISOString(),
                            },
                        });
                        
                        if (result.success) {
                            console.log(`[Swarm] Unlike delivered to ${targetDomain}`);
                        } else {
                            console.warn(`[Swarm] Unlike delivery failed: ${result.error}`);
                        }
                    } catch (err) {
                        console.error('[Swarm] Error delivering unlike:', err);
                    }
                })();
            }
        }

        return NextResponse.json({ success: true, liked: false });
    } catch (error) {
        if (error instanceof Error && error.message === 'Authentication required') {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        return NextResponse.json({ error: 'Failed to unlike post' }, { status: 500 });
    }
}
