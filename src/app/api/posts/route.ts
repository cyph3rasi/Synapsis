import { NextResponse } from 'next/server';
import { db, posts, users, media, follows, mutes, blocks } from '@/db';
import { requireAuth } from '@/lib/auth';
import { eq, desc, and, inArray, isNull, notInArray, or } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { z } from 'zod';

const POST_MAX_LENGTH = 400;
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
            apId: `https://${nodeDomain}/posts/${crypto.randomUUID()}`,
            apUrl: `https://${nodeDomain}/posts/${crypto.randomUUID()}`,
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

        // TODO: Federate the post to followers

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
        const moderatedUsers = await db.select({ id: users.id })
            .from(users)
            .where(or(eq(users.isSuspended, true), eq(users.isSilenced, true)));
        const moderatedIds = moderatedUsers.map((item) => item.id);
        const baseFilter = buildWhere(
            eq(posts.isRemoved, false),
            moderatedIds.length ? notInArray(posts.userId, moderatedIds) : undefined
        );

        if (type === 'public') {
            // Public timeline - all posts
            feedPosts = await db.query.posts.findMany({
                where: baseFilter,
                with: {
                    author: true,
                    media: true,
                    replyTo: {
                        with: { author: true },
                    },
                },
                orderBy: [desc(posts.createdAt)],
                limit,
            });
        } else if (type === 'user' && userId) {
            // User's posts
            feedPosts = await db.query.posts.findMany({
                where: buildWhere(baseFilter, eq(posts.userId, userId)),
                with: {
                    author: true,
                    media: true,
                    replyTo: {
                        with: { author: true },
                    },
                },
                orderBy: [desc(posts.createdAt)],
                limit,
            });
        } else if (type === 'curated') {
            let viewer = null;
            try {
                viewer = await requireAuth();
            } catch {
                viewer = null;
            }

            const seedLimit = Math.min(limit * CURATION_SEED_MULTIPLIER, CURATION_SEED_CAP);
            const seedPosts = await db.query.posts.findMany({
                where: baseFilter,
                with: {
                    author: true,
                    media: true,
                    replyTo: {
                        with: { author: true },
                    },
                },
                orderBy: [desc(posts.createdAt)],
                limit: seedLimit,
            });

            let followingIds = new Set<string>();
            let mutedIds = new Set<string>();
            let blockedIds = new Set<string>();

            if (viewer) {
                const followRows = await db.select({ followingId: follows.followingId })
                    .from(follows)
                    .where(eq(follows.followerId, viewer.id));
                followingIds = new Set(followRows.map(row => row.followingId));

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
            const rankedPosts = seedPosts
                .filter(post => !mutedIds.has(post.author.id) && !blockedIds.has(post.author.id))
                .map(post => {
                    const createdAt = new Date(post.createdAt).getTime();
                    const ageHours = Math.max(0, (now - createdAt) / 3600000);
                    const engagement = post.likesCount + post.repostsCount * 2 + post.repliesCount * 0.5;
                    const engagementScore = Math.log1p(Math.max(0, engagement));
                    const recencyScore = Math.max(0, 1 - ageHours / CURATION_WINDOW_HOURS);

                    const followBoost = viewer && followingIds.has(post.author.id) ? 0.9 : 0;
                    const selfBoost = viewer && post.author.id === viewer.id ? 0.5 : 0;

                    const score = engagementScore * 1.4 + recencyScore * 1.1 + followBoost + selfBoost;

                    const reasons: string[] = [];
                    if (followBoost > 0) {
                        reasons.push(`You follow @${post.author.handle}`);
                    }
                    if (engagement >= 5) {
                        reasons.push(`Popular: ${post.likesCount} likes, ${post.repostsCount} reposts`);
                    } else if (engagement > 0) {
                        reasons.push(`Active conversation: ${post.repliesCount} replies`);
                    }
                    if (ageHours <= 6) {
                        reasons.push('Posted recently');
                    } else if (ageHours <= 24) {
                        reasons.push('Posted today');
                    } else if (ageHours <= CURATION_WINDOW_HOURS) {
                        reasons.push('Recent');
                    }
                    if (reasons.length === 0) {
                        reasons.push('New post');
                    }

                    return {
                        ...post,
                        feedMeta: {
                            score: Number(score.toFixed(3)),
                            reasons,
                            engagement: {
                                likes: post.likesCount,
                                reposts: post.repostsCount,
                                replies: post.repliesCount,
                            },
                        },
                    };
                })
                .sort((a, b) => {
                    if (b.feedMeta.score !== a.feedMeta.score) {
                        return b.feedMeta.score - a.feedMeta.score;
                    }
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                })
                .slice(0, limit);

            return NextResponse.json({
                posts: rankedPosts,
                meta: {
                    algorithm: 'curated-v1',
                    windowHours: CURATION_WINDOW_HOURS,
                    seedLimit,
                    weights: {
                        engagement: 1.4,
                        recency: 1.1,
                        followBoost: 0.9,
                        selfBoost: 0.5,
                    },
                },
                nextCursor: rankedPosts.length === limit ? rankedPosts[rankedPosts.length - 1]?.id : null,
            });
        } else {
            // Home timeline - need auth
            try {
                const user = await requireAuth();

                // Get posts from people the user follows + their own posts
                // For now, just return all posts (we'll add following filter later)
            feedPosts = await db.query.posts.findMany({
                    where: baseFilter,
                    with: {
                        author: true,
                        media: true,
                        replyTo: {
                            with: { author: true },
                        },
                    },
                    orderBy: [desc(posts.createdAt)],
                    limit,
                });
            } catch {
                // Not authenticated, return public timeline
                feedPosts = await db.query.posts.findMany({
                    where: baseFilter,
                    with: {
                        author: true,
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

        return NextResponse.json({
            posts: feedPosts,
            nextCursor: feedPosts.length === limit ? feedPosts[feedPosts.length - 1]?.id : null,
        });
    } catch (error) {
        console.error('Get feed error:', error);
        return NextResponse.json(
            { error: 'Failed to get feed' },
            { status: 500 }
        );
    }
}
