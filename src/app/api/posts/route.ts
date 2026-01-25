import { NextResponse } from 'next/server';
import { db, posts, users, media, follows, mutes, blocks, likes, remoteFollows, remotePosts } from '@/db';
import { requireAuth } from '@/lib/auth';
import { eq, desc, and, inArray, isNull, notInArray, or } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { z } from 'zod';

const POST_MAX_LENGTH = 600;
const CURATION_WINDOW_HOURS = 72;
const CURATION_SEED_MULTIPLIER = 5;
const CURATION_SEED_CAP = 200;

const buildWhere = (...conditions: Array<SQL | undefined>) => {
    const filtered = conditions.filter(Boolean) as SQL[];
    if (filtered.length === 0) return undefined;
    return and(...filtered);
};

const createPostSchema = z.object({
    content: z.string().min(1).max(POST_MAX_LENGTH),
    replyToId: z.string().uuid().optional(),
    mediaIds: z.array(z.string().uuid()).max(4).optional(),
    isNsfw: z.boolean().optional(),
    linkPreview: z.object({
        url: z.string().url(),
        title: z.string().optional(),
        description: z.string().optional(),
        image: z.string().url().optional().nullable(),
    }).optional().nullable(),
});

// Create a new post
export async function POST(request: Request) {
    try {
        const user = await requireAuth();
        const body = await request.json();
        const data = createPostSchema.parse(body);

        if (user.isSuspended || user.isSilenced) {
            return NextResponse.json({ error: 'Account restricted' }, { status: 403 });
        }

        const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';

        const [post] = await db.insert(posts).values({
            userId: user.id,
            content: data.content,
            replyToId: data.replyToId,
            isNsfw: data.isNsfw || user.isNsfw || false, // Inherit from account if account is NSFW
            apId: `https://${nodeDomain}/posts/${crypto.randomUUID()}`,
            apUrl: `https://${nodeDomain}/posts/${crypto.randomUUID()}`,
            linkPreviewUrl: data.linkPreview?.url,
            linkPreviewTitle: data.linkPreview?.title,
            linkPreviewDescription: data.linkPreview?.description,
            linkPreviewImage: data.linkPreview?.image,
        }).returning();

        let attachedMedia: typeof media.$inferSelect[] = [];
        if (data.mediaIds?.length) {
            await db.update(media)
                .set({ postId: post.id })
                .where(and(
                    inArray(media.id, data.mediaIds),
                    eq(media.userId, user.id),
                    isNull(media.postId),
                ));

            attachedMedia = await db.query.media.findMany({
                where: and(
                    inArray(media.id, data.mediaIds),
                    eq(media.userId, user.id),
                    eq(media.postId, post.id),
                ),
            });
        }

        // Update user's post count
        await db.update(users)
            .set({ postsCount: user.postsCount + 1 })
            .where(eq(users.id, user.id));

        // If this is a reply, update the parent's reply count
        if (data.replyToId) {
            const parentPost = await db.query.posts.findFirst({
                where: eq(posts.id, data.replyToId),
            });
            if (parentPost) {
                await db.update(posts)
                    .set({ repliesCount: parentPost.repliesCount + 1 })
                    .where(eq(posts.id, data.replyToId));
            }
        }

        // Federate the post to remote followers (non-blocking)
        (async () => {
            try {
                const { createCreateActivity } = await import('@/lib/activitypub/activities');
                const { getFollowerInboxes, deliverToFollowers } = await import('@/lib/activitypub/outbox');

                const followerInboxes = await getFollowerInboxes(user.id);
                if (followerInboxes.length === 0) {
                    return; // No remote followers to notify
                }

                const createActivity = createCreateActivity(post, user, nodeDomain);

                const privateKey = user.privateKeyEncrypted;
                if (!privateKey) {
                    console.error('[Federation] User has no private key for signing');
                    return;
                }

                const keyId = `https://${nodeDomain}/users/${user.handle}#main-key`;
                const result = await deliverToFollowers(createActivity, followerInboxes, privateKey, keyId);
                console.log(`[Federation] Post ${post.id} delivered to ${result.delivered}/${followerInboxes.length} inboxes (${result.failed} failed)`);
            } catch (err) {
                console.error('[Federation] Error federating post:', err);
            }
        })();


        return NextResponse.json({ success: true, post: { ...post, media: attachedMedia } });
    } catch (error) {
        console.error('Create post error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid input', details: error.issues },
                { status: 400 }
            );
        }

        if (error instanceof Error && error.message === 'Authentication required') {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        return NextResponse.json(
            { error: 'Failed to create post' },
            { status: 500 }
        );
    }
}

// Normalize content for deduplication (strip HTML entities, URLs, whitespace, category suffixes)
const normalizeForDedup = (content: string): string => {
    return content
        .replace(/Posted into [\w\s-]+/gi, '') // Remove "Posted into [Category]" patterns
        .replace(/&[a-z]+;/gi, '') // Remove HTML entities like &lsquo;
        .replace(/&#\d+;/g, '') // Remove numeric entities
        .replace(/https?:\/\/[^\s]+/gi, '') // Remove URLs
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .replace(/\s+/g, ' ') // Normalize whitespace
        .toLowerCase()
        .trim()
        .slice(0, 50); // Compare first 50 chars (article title)
};

// Helper to transform cached remote posts to match local post format
// Deduplicates by apId AND by similar content from same author
const transformRemotePosts = (remotePostsData: typeof remotePosts.$inferSelect[]) => {
    const seenApIds = new Set<string>();
    const seenContentKeys = new Set<string>(); // author+normalizedContent
    const uniquePosts: typeof remotePosts.$inferSelect[] = [];

    for (const rp of remotePostsData) {
        if (seenApIds.has(rp.apId)) continue;

        // Content-based dedup: same author + similar content = skip
        const contentKey = `${rp.authorHandle}:${normalizeForDedup(rp.content)}`;
        if (seenContentKeys.has(contentKey)) continue;

        seenApIds.add(rp.apId);
        seenContentKeys.add(contentKey);
        uniquePosts.push(rp);
    }

    return uniquePosts.map(rp => {
        const mediaData = rp.mediaJson ? JSON.parse(rp.mediaJson) : [];
        return {
            id: rp.id,
            content: rp.content,
            createdAt: rp.publishedAt,
            likesCount: 0,
            repostsCount: 0,
            repliesCount: 0,
            isRemote: true,
            apId: rp.apId,
            linkPreviewUrl: rp.linkPreviewUrl,
            linkPreviewTitle: rp.linkPreviewTitle,
            linkPreviewDescription: rp.linkPreviewDescription,
            linkPreviewImage: rp.linkPreviewImage,
            author: {
                id: rp.authorActorUrl,
                handle: rp.authorHandle,
                displayName: rp.authorDisplayName,
                avatarUrl: rp.authorAvatarUrl,
                isRemote: true,
            },
            media: mediaData.map((m: { url: string; altText?: string }, idx: number) => ({
                id: `${rp.id}-media-${idx}`,
                url: m.url,
                altText: m.altText || null,
            })),
            replyTo: null,
        };
    });
};

// Get timeline / feed
export async function GET(request: Request) {
    try {
        // Return empty posts if no database is connected (for UI testing)
        if (!db) {
            return NextResponse.json({ posts: [], nextCursor: null });
        }

        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type') || 'home'; // home, public, user, curated
        const userId = searchParams.get('userId');
        const cursor = searchParams.get('cursor');
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

        let feedPosts;
        const baseFilter = buildWhere(
            eq(posts.isRemoved, false)
        );

        if (type === 'local') {
            // Local node posts only - no fediverse content
            feedPosts = await db.query.posts.findMany({
                where: baseFilter,
                with: {
                    author: true,
                    bot: true,
                    media: true,
                    replyTo: {
                        with: { author: true },
                    },
                },
                orderBy: [desc(posts.createdAt)],
                limit,
            });
        } else if (type === 'public') {
            // Public timeline - all local posts + all cached remote posts
            const localPosts = await db.query.posts.findMany({
                where: baseFilter,
                with: {
                    author: true,
                    bot: true,
                    media: true,
                    replyTo: {
                        with: { author: true },
                    },
                },
                orderBy: [desc(posts.createdAt)],
                limit: limit * 2,
            });

            // Get all cached remote posts
            const remotePostsData = await db.query.remotePosts.findMany({
                orderBy: [desc(remotePosts.publishedAt)],
                limit: limit,
            });

            const transformedRemote = transformRemotePosts(remotePostsData);

            // Merge and sort by date
            feedPosts = [...localPosts, ...transformedRemote]
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, limit) as any;
        } else if (type === 'user' && userId) {
            // User's posts
            feedPosts = await db.query.posts.findMany({
                where: buildWhere(baseFilter, eq(posts.userId, userId)),
                with: {
                    author: true,
                    bot: true,
                    media: true,
                    replyTo: {
                        with: { author: true },
                    },
                },
                orderBy: [desc(posts.createdAt)],
                limit,
            });
        } else if (type === 'curated') {
            // Curated feed - swarm posts only (no fediverse)
            let viewer = null;
            try {
                const { getSession } = await import('@/lib/auth');
                const session = await getSession();
                viewer = session?.user || null;
            } catch {
                viewer = null;
            }

            // Fetch swarm posts
            const { fetchSwarmTimeline } = await import('@/lib/swarm/timeline');
            const swarmResult = await fetchSwarmTimeline(10, 30);
            
            // Transform swarm posts to match local post format
            const swarmPosts = swarmResult.posts.map(sp => ({
                id: `swarm:${sp.nodeDomain}:${sp.id}`,
                content: sp.content,
                createdAt: new Date(sp.createdAt),
                likesCount: sp.likeCount,
                repostsCount: sp.repostCount,
                repliesCount: sp.replyCount,
                isSwarm: true,
                nodeDomain: sp.nodeDomain,
                author: {
                    id: `swarm:${sp.nodeDomain}:${sp.author.handle}`,
                    handle: sp.author.handle,
                    displayName: sp.author.displayName,
                    avatarUrl: sp.author.avatarUrl,
                    isSwarm: true,
                    nodeDomain: sp.nodeDomain,
                },
                media: sp.mediaUrls?.map((url, idx) => ({
                    id: `swarm:${sp.nodeDomain}:${sp.id}:media:${idx}`,
                    url,
                    altText: null,
                })) || [],
                replyTo: null,
            }));

            let mutedIds = new Set<string>();
            let blockedIds = new Set<string>();

            if (viewer) {
                const muteRows = await db.select({ mutedUserId: mutes.mutedUserId })
                    .from(mutes)
                    .where(eq(mutes.userId, viewer.id));
                mutedIds = new Set(muteRows.map(row => row.mutedUserId));

                const blockRows = await db.select({ blockedUserId: blocks.blockedUserId })
                    .from(blocks)
                    .where(eq(blocks.userId, viewer.id));
                blockedIds = new Set(blockRows.map(row => row.blockedUserId));
            }

            const now = Date.now();
            const rankedPosts = swarmPosts
                .filter((post: any) => !mutedIds.has(post.author.id) && !blockedIds.has(post.author.id))
                .map((post: any) => {
                    const createdAt = new Date(post.createdAt).getTime();
                    const ageHours = Math.max(0, (now - createdAt) / 3600000);
                    const engagement = (post.likesCount || 0) + (post.repostsCount || 0) * 2 + (post.repliesCount || 0) * 0.5;
                    const engagementScore = Math.log1p(Math.max(0, engagement));
                    const recencyScore = Math.max(0, 1 - ageHours / CURATION_WINDOW_HOURS);

                    const score = engagementScore * 1.4 + recencyScore * 1.1;

                    const reasons: string[] = [];
                    reasons.push(`From ${post.nodeDomain}`);
                    if (engagement >= 5) {
                        reasons.push(`Popular: ${post.likesCount || 0} likes, ${post.repostsCount || 0} reposts`);
                    } else if ((post.repliesCount || 0) > 0) {
                        reasons.push(`Active conversation: ${post.repliesCount} replies`);
                    }
                    if (ageHours <= 6) {
                        reasons.push('Posted recently');
                    } else if (ageHours <= 24) {
                        reasons.push('Posted today');
                    }
                    if (reasons.length === 1) {
                        reasons.push('New post');
                    }

                    return {
                        ...post,
                        feedMeta: {
                            score: Number(score.toFixed(3)),
                            reasons,
                            engagement: {
                                likes: post.likesCount || 0,
                                reposts: post.repostsCount || 0,
                                replies: post.repliesCount || 0,
                            },
                        },
                    };
                })
                .sort((a: any, b: any) => {
                    if (b.feedMeta.score !== a.feedMeta.score) {
                        return b.feedMeta.score - a.feedMeta.score;
                    }
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                })
                .slice(0, limit);

            feedPosts = rankedPosts;
        } else {
            // Home timeline - need auth
            try {
                const user = await requireAuth();

                // Get IDs of users the current user follows
                const followRows = await db.select({ followingId: follows.followingId })
                    .from(follows)
                    .where(eq(follows.followerId, user.id));
                const followingIds = followRows.map(row => row.followingId);
                
                // Include own posts + posts from followed users
                const allowedUserIds = [user.id, ...followingIds];

                // Get local posts from people the user follows + their own posts
                const localPosts = await db.query.posts.findMany({
                    where: buildWhere(baseFilter, inArray(posts.userId, allowedUserIds)),
                    with: {
                        author: true,
                        bot: true,
                        media: true,
                        replyTo: {
                            with: { author: true },
                        },
                    },
                    orderBy: [desc(posts.createdAt)],
                    limit: limit * 2, // Get more to account for mixing with remote
                });

                // Get handles of remote users we follow
                const followedRemoteUsers = await db.query.remoteFollows.findMany({
                    where: eq(remoteFollows.followerId, user.id),
                });
                const followedRemoteHandles = followedRemoteUsers.map(f => f.targetHandle);

                // Get cached remote posts from followed users
                let remotePostsData: typeof remotePosts.$inferSelect[] = [];
                if (followedRemoteHandles.length > 0) {
                    remotePostsData = await db.query.remotePosts.findMany({
                        where: inArray(remotePosts.authorHandle, followedRemoteHandles),
                        orderBy: [desc(remotePosts.publishedAt)],
                        limit: limit,
                    });
                }

                // Transform remote posts to match local post format (with deduplication)
                const transformedRemotePosts = transformRemotePosts(remotePostsData);

                // Merge and sort by date
                const allPosts = [...localPosts, ...transformedRemotePosts]
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .slice(0, limit);

                feedPosts = allPosts as any;
            } catch {
                // Not authenticated, return public timeline
                feedPosts = await db.query.posts.findMany({
                    where: baseFilter,
                    with: {
                        author: true,
                        bot: true,
                        media: true,
                        replyTo: {
                            with: { author: true },
                        },
                    },
                    orderBy: [desc(posts.createdAt)],
                    limit,
                });
            }
        }

        // Populate isLiked and isReposted for authenticated users
        try {
            const { getSession } = await import('@/lib/auth');
            const session = await getSession();

            if (session?.user && feedPosts && feedPosts.length > 0) {
                const viewer = session.user;
                const postIds = feedPosts.map((p: { id: string }) => p.id).filter(Boolean);

                if (postIds.length > 0) {
                    const viewerLikes = await db.query.likes.findMany({
                        where: and(
                            eq(likes.userId, viewer.id),
                            inArray(likes.postId, postIds)
                        ),
                    });
                    const likedPostIds = new Set(viewerLikes.map(l => l.postId));

                    const viewerReposts = await db.query.posts.findMany({
                        where: and(
                            eq(posts.userId, viewer.id),
                            inArray(posts.repostOfId, postIds)
                        ),
                    });
                    const repostedPostIds = new Set(viewerReposts.map(r => r.repostOfId));

                    feedPosts = feedPosts.map((p: { id: string }) => ({
                        ...p,
                        isLiked: likedPostIds.has(p.id),
                        isReposted: repostedPostIds.has(p.id),
                    })) as any;
                }
            }
        } catch (error) {
            console.error('Error populating interaction flags:', error);
        }

        return NextResponse.json({
            posts: feedPosts || [],
            meta: type === 'curated' ? {
                algorithm: 'curated-v1',
                windowHours: CURATION_WINDOW_HOURS,
                seedLimit: Math.min(limit * CURATION_SEED_MULTIPLIER, CURATION_SEED_CAP),
                weights: {
                    engagement: 1.4,
                    recency: 1.1,
                    followBoost: 0.9,
                    selfBoost: 0.5,
                },
            } : undefined,
            nextCursor: (feedPosts?.length === limit) ? feedPosts[feedPosts.length - 1]?.id : null,
        });
    } catch (error) {
        console.error('Get feed error details:', error);
        return NextResponse.json(
            { error: 'Failed to get feed' },
            { status: 500 }
        );
    }
}
