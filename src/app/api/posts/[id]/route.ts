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
                };

                replyPosts = replies.map(r => ({
                    ...r,
                    isLiked: likedPostIds.has(r.id),
                    isReposted: repostedPostIds.has(r.id),
                }));
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
