import { NextResponse } from 'next/server';
import { db, posts, users, media, remotePosts } from '@/db';
import { eq, desc, and } from 'drizzle-orm';
import { fetchRemotePost } from '@/lib/activitypub/fetchRemotePost';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';

        let mainPost: any = null;
        let replyPosts: any[] = [];

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

        if (post) {
            mainPost = post;

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

            let allPostIds = [post.id, ...replies.map(r => r.id)];

            try {
                const { requireAuth } = await import('@/lib/auth');
                const { likes } = await import('@/db');
                const { inArray } = await import('drizzle-orm');

                const viewer = await requireAuth();
                allPostIds = [post.id, ...replies.map(r => r.id)];

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
                    })) as any[];
                }
            } catch {
            }
        } else {
            const cached = await db.query.remotePosts.findFirst({
                where: eq(remotePosts.apId, id),
            });

            if (cached) {
                mainPost = {
                    id: cached.id,
                    content: cached.content,
                    createdAt: cached.publishedAt.toISOString(),
                    likesCount: 0,
                    repostsCount: 0,
                    repliesCount: 0,
                    author: {
                        id: cached.authorHandle,
                        handle: cached.authorHandle,
                        displayName: cached.authorDisplayName || cached.authorHandle,
                        avatarUrl: cached.authorAvatarUrl,
                        bio: null,
                        isRemote: true,
                    },
                    media: cached.mediaJson ? JSON.parse(cached.mediaJson) : null,
                    linkPreviewUrl: cached.linkPreviewUrl,
                    linkPreviewTitle: cached.linkPreviewTitle,
                    linkPreviewDescription: cached.linkPreviewDescription,
                    linkPreviewImage: cached.linkPreviewImage,
                    isLiked: false,
                    isReposted: false,
                };
            } else {
                const postUrl = `https://${nodeDomain}/posts/${id}`;
                const result = await fetchRemotePost(postUrl, nodeDomain);

                if (result.post) {
                    mainPost = result.post;
                }
            }
        }

        if (!mainPost) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
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
