import { NextResponse } from 'next/server';
import { db, users, posts, likes } from '@/db';
import { ilike, or, desc, and, notInArray, eq, inArray } from 'drizzle-orm';
import { fetchSwarmUserProfile, isSwarmNode } from '@/lib/swarm/interactions';

type SearchUser = {
    id: string;
    handle: string;
    displayName: string | null;
    avatarUrl: string | null;
    bio: string | null;
    profileUrl?: string | null;
    isRemote?: boolean;
    isBot?: boolean;
};

const parseRemoteHandleQuery = (query: string): { handle: string; domain: string } | null => {
    let trimmed = query.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('acct:')) {
        trimmed = trimmed.slice(5);
    }
    const withoutPrefix = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
    if (withoutPrefix.includes(' ')) return null;
    const parts = withoutPrefix.split('@').filter(Boolean);
    if (parts.length !== 2) return null;
    const [handle, domain] = parts;
    if (!handle || !domain) return null;
    if (!domain.includes('.') && !domain.includes(':')) return null;
    return { handle: handle.toLowerCase(), domain: domain.toLowerCase() };
};

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q') || '';
        const type = searchParams.get('type') || 'all'; // all, users, posts
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

        if (!query.trim()) {
            return NextResponse.json({ users: [], posts: [] });
        }

        // Return empty if no database
        if (!db) {
            return NextResponse.json({
                users: [],
                posts: [],
                message: 'Search requires database connection'
            });
        }

        const searchPattern = `%${query}%`;
        let searchUsers: SearchUser[] = [];
        let searchPosts: typeof posts.$inferSelect[] = [];

        // Search users
        if (type === 'all' || type === 'users') {
            const userConditions = and(
                or(
                    ilike(users.handle, searchPattern),
                    ilike(users.displayName, searchPattern),
                    ilike(users.bio, searchPattern)
                ),
                eq(users.isSuspended, false),
                eq(users.isSilenced, false)
            );
            const localUsers = await db.select({
                id: users.id,
                handle: users.handle,
                displayName: users.displayName,
                avatarUrl: users.avatarUrl,
                bio: users.bio,
                isBot: users.isBot,
            })
                .from(users)
                .where(userConditions)
                .limit(limit);
            
            // Filter out remote placeholder users (those with @ in handle)
            searchUsers = localUsers.filter(u => !u.handle.includes('@'));
        }

        // Swarm user lookup (exact handle@domain queries)
        if ((type === 'all' || type === 'users') && searchUsers.length < limit) {
            const parsedRemote = parseRemoteHandleQuery(query);
            if (parsedRemote) {
                // Only lookup on swarm nodes
                const isSwarm = await isSwarmNode(parsedRemote.domain);
                if (isSwarm) {
                    try {
                        const profileData = await fetchSwarmUserProfile(parsedRemote.handle, parsedRemote.domain, 0);
                        if (profileData?.profile) {
                            const fullHandle = `${parsedRemote.handle}@${parsedRemote.domain}`;
                            const remoteUser: SearchUser = {
                                id: `swarm:${parsedRemote.domain}:${parsedRemote.handle}`,
                                handle: fullHandle,
                                displayName: profileData.profile.displayName || parsedRemote.handle,
                                avatarUrl: profileData.profile.avatarUrl || null,
                                bio: profileData.profile.bio || null,
                                profileUrl: `https://${parsedRemote.domain}/@${parsedRemote.handle}`,
                                isRemote: true,
                                isBot: profileData.profile.isBot,
                            };
                            if (!searchUsers.some((user) => user.handle.toLowerCase() === remoteUser.handle.toLowerCase())) {
                                searchUsers = [remoteUser, ...searchUsers].slice(0, limit);
                            }
                        }
                    } catch (error) {
                        console.error(`[Search] Error fetching swarm user ${parsedRemote.handle}@${parsedRemote.domain}:`, error);
                    }
                }
            }
        }

        const moderatedUsers = await db.select({ id: users.id })
            .from(users)
            .where(or(eq(users.isSuspended, true), eq(users.isSilenced, true)));
        const moderatedIds = moderatedUsers.map((item) => item.id);

        // Search posts
        if (type === 'all' || type === 'posts') {
            const postConditions = [
                ilike(posts.content, searchPattern),
                eq(posts.isRemoved, false),
            ];
            if (moderatedIds.length) {
                postConditions.push(notInArray(posts.userId, moderatedIds));
            }
            const postResults = await db.query.posts.findMany({
                where: and(...postConditions),
                with: {
                    author: true,
                    media: true,
                    bot: true,
                },
                orderBy: [desc(posts.createdAt)],
                limit,
            });
            searchPosts = postResults;

            // Populate isLiked and isReposted for authenticated users
            try {
                const { getSession } = await import('@/lib/auth');
                const session = await getSession();

                if (session?.user && searchPosts.length > 0) {
                    const viewer = session.user;
                    const postIds = searchPosts.map(p => p.id).filter(Boolean);

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

                        searchPosts = searchPosts.map(p => ({
                            ...p,
                            isLiked: likedPostIds.has(p.id),
                            isReposted: repostedPostIds.has(p.id),
                        })) as any;
                    }
                }
            } catch (error) {
                console.error('Error populating interaction flags:', error);
            }
        }

        return NextResponse.json({
            users: searchUsers,
            posts: searchPosts,
        });
    } catch (error) {
        console.error('Search error:', error);
        return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }
}
