import { NextResponse } from 'next/server';
import { db, posts, users, media, remotePosts } from '@/db';
import { eq, desc, and } from 'drizzle-orm';
import { fetchRemotePost } from '@/lib/activitypub/fetchRemotePost';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: rawId } = await params;
        // Decode URL-encoded characters (e.g., %3A -> :)
        const id = decodeURIComponent(rawId);

        const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';

        let mainPost: any = null;
        let replyPosts: any[] = [];

        // Handle swarm post IDs (format: swarm:domain:uuid)
        if (id.startsWith('swarm:')) {
            const parts = id.split(':');
            if (parts.length >= 3) {
                const originDomain = parts[1];
                const originalPostId = parts[2];
                
                // Fetch from origin node in real-time
                try {
                    const protocol = originDomain.includes('localhost') ? 'http' : 'https';
                    const res = await fetch(`${protocol}://${originDomain}/api/swarm/posts/${originalPostId}`, {
                        headers: { 'Accept': 'application/json' },
                        signal: AbortSignal.timeout(10000),
                    });
                    
                    if (res.ok) {
                        const data = await res.json();
                        
                        // Transform to match expected format
                        mainPost = {
                            id: id,
                            originalPostId: originalPostId,
                            content: data.post.content,
                            createdAt: data.post.createdAt,
                            likesCount: data.post.likesCount || 0,
                            repostsCount: data.post.repostsCount || 0,
                            repliesCount: data.post.repliesCount || 0,
                            isSwarm: true,
                            nodeDomain: originDomain,
                            author: {
                                id: `swarm:${originDomain}:${data.post.author.handle}`,
                                handle: data.post.author.handle,
                                displayName: data.post.author.displayName,
                                avatarUrl: data.post.author.avatarUrl,
                                isSwarm: true,
                                nodeDomain: originDomain,
                            },
                            media: data.post.media?.map((m: any, idx: number) => ({
                                id: `swarm:${originDomain}:${originalPostId}:media:${idx}`,
                                url: m.url,
                                altText: m.altText || null,
                            })) || [],
                            linkPreviewUrl: data.post.linkPreviewUrl,
                            linkPreviewTitle: data.post.linkPreviewTitle,
                            linkPreviewDescription: data.post.linkPreviewDescription,
                            linkPreviewImage: data.post.linkPreviewImage,
                        };
                        
                        // Transform replies
                        replyPosts = (data.replies || []).map((r: any) => ({
                            id: `swarm:${originDomain}:${r.id}`,
                            originalPostId: r.id,
                            content: r.content,
                            createdAt: r.createdAt,
                            likesCount: r.likesCount || 0,
                            repostsCount: r.repostsCount || 0,
                            repliesCount: r.repliesCount || 0,
                            isSwarm: true,
                            nodeDomain: originDomain,
                            author: {
                                id: `swarm:${originDomain}:${r.author.handle}`,
                                handle: r.author.handle,
                                displayName: r.author.displayName,
                                avatarUrl: r.author.avatarUrl,
                                isSwarm: true,
                                nodeDomain: originDomain,
                            },
                            media: r.media?.map((m: any, idx: number) => ({
                                id: `swarm:${originDomain}:${r.id}:media:${idx}`,
                                url: m.url,
                                altText: m.altText || null,
                            })) || [],
                        }));
                        
                        // Check if current user has liked this post
                        try {
                            const { requireAuth } = await import('@/lib/auth');
                            const viewer = await requireAuth();
                            
                            const likeCheckRes = await fetch(
                                `${protocol}://${originDomain}/api/swarm/posts/${originalPostId}/likes?checkHandle=${viewer.handle}&checkDomain=${nodeDomain}`,
                                { signal: AbortSignal.timeout(3000) }
                            );
                            
                            if (likeCheckRes.ok) {
                                const likeData = await likeCheckRes.json();
                                mainPost.isLiked = likeData.isLiked;
                            }
                        } catch {
                            // Not logged in or timeout
                        }
                        
                        return NextResponse.json({
                            post: mainPost,
                            replies: replyPosts,
                        });
                    }
                } catch (err) {
                    console.error(`[Swarm] Failed to fetch post from ${originDomain}:`, err);
                }
                
                return NextResponse.json({ error: 'Post not found' }, { status: 404 });
            }
        }

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
        const { bots } = await import('@/db');
        const user = await requireAuth();
        const { id } = await params;

        const post = await db.query.posts.findFirst({
            where: eq(posts.id, id),
            with: {
                bot: true,
            },
        });

        if (!post) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }

        // Allow deletion if user owns the post OR if user owns the bot that made the post
        const isPostOwner = post.userId === user.id;
        const isBotOwner = post.bot && post.bot.ownerId === user.id;
        
        if (!isPostOwner && !isBotOwner) {
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

        // 3. Decrement the post author's postsCount
        const postAuthor = await db.query.users.findFirst({
            where: eq(users.id, post.userId),
        });
        if (postAuthor && postAuthor.postsCount > 0) {
            await db.update(users)
                .set({ postsCount: postAuthor.postsCount - 1 })
                .where(eq(users.id, post.userId));
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
