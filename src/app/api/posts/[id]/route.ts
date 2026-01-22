import { NextResponse } from 'next/server';
import { db, posts, users, media } from '@/db';
import { eq, desc, and } from 'drizzle-orm';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Fetch the main post
        const post = await db.query.posts.findFirst({
            where: eq(posts.id, id),
            with: {
                author: true,
                media: true,
                replyTo: {
                    with: { author: true },
                },
            },
        });

        if (!post) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }

        // Fetch replies to this post
        const replies = await db.query.posts.findMany({
            where: and(
                eq(posts.replyToId, id),
                eq(posts.isRemoved, false)
            ),
            with: {
                author: true,
                media: true,
            },
            orderBy: [desc(posts.createdAt)],
        });

        let mainPost = post;
        let replyPosts = replies;

        try {
            const { requireAuth } = await import('@/lib/auth');
            const { likes } = await import('@/db');
            const { inArray } = await import('drizzle-orm');

            const viewer = await requireAuth();
            const allPostIds = [post.id, ...replies.map(r => r.id)];

            if (allPostIds.length > 0) {
                const viewerLikes = await db.query.likes.findMany({
                    where: and(
                        eq(likes.userId, viewer.id),
                        inArray(likes.postId, allPostIds)
                    ),
                });
                const likedPostIds = new Set(viewerLikes.map(l => l.postId));

                const viewerReposts = await db.query.posts.findMany({
                    where: and(
                        eq(posts.userId, viewer.id),
                        inArray(posts.repostOfId, allPostIds)
                    ),
                });
                const repostedPostIds = new Set(viewerReposts.map(r => r.repostOfId));

                mainPost = {
                    ...post,
                    isLiked: likedPostIds.has(post.id),
                    isReposted: repostedPostIds.has(post.id),
                } as any;

                replyPosts = replies.map(r => ({
                    ...r,
                    isLiked: likedPostIds.has(r.id),
                    isReposted: repostedPostIds.has(r.id),
                })) as any;
            }
        } catch {
            // Not authenticated or other error, skip flags
        }

        return NextResponse.json({
            post: mainPost,
            replies: replyPosts,
        });
    } catch (error) {
        console.error('Get post detail error:', error);
        return NextResponse.json(
            { error: 'Failed to get post detail' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { requireAuth } = await import('@/lib/auth');
        const user = await requireAuth();
        const { id } = await params;

        const post = await db.query.posts.findFirst({
            where: eq(posts.id, id),
        });

        if (!post) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }

        if (post.userId !== user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // 1. If it's a reply, decrement parent's repliesCount
        if (post.replyToId) {
            const parentPost = await db.query.posts.findFirst({
                where: eq(posts.id, post.replyToId),
            });
            if (parentPost && parentPost.repliesCount > 0) {
                await db.update(posts)
                    .set({ repliesCount: parentPost.repliesCount - 1 })
                    .where(eq(posts.id, post.replyToId));
            }
        }

        // 2. Delete the post (cascades to media, likes, notifications)
        await db.delete(posts).where(eq(posts.id, id));

        // 3. Decrement user's postsCount
        if (user.postsCount > 0) {
            await db.update(users)
                .set({ postsCount: user.postsCount - 1 })
                .where(eq(users.id, user.id));
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete post error:', error);
        if (error instanceof Error && error.message === 'Authentication required') {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        return NextResponse.json(
            { error: 'Failed to delete post' },
            { status: 500 }
        );
    }
}
