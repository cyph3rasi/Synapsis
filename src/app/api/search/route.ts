import { NextResponse } from 'next/server';
import { db, users, posts } from '@/db';
import { ilike, or, desc, and, notInArray, eq } from 'drizzle-orm';
import { resolveRemoteUser } from '@/lib/activitypub/fetch';

type SearchUser = {
    id: string;
    handle: string;
    displayName: string | null;
    avatarUrl: string | null;
    bio: string | null;
    profileUrl?: string | null;
    isRemote?: boolean;
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

const buildRemoteUser = (
    profile: Awaited<ReturnType<typeof resolveRemoteUser>>,
    handle: string,
    domain: string,
): SearchUser | null => {
    if (!profile) return null;
    const displayName = profile.name || profile.preferredUsername || null;
    const username = profile.preferredUsername || handle;
    if (!username) return null;
    const fullHandle = `${username}@${domain}`.replace(/^@/, '');
    const iconUrl = typeof profile.icon === 'string' ? profile.icon : profile.icon?.url;
    const profileUrl = typeof profile.url === 'string' ? profile.url : profile.id;

    return {
        id: profile.id || profileUrl || `remote:${fullHandle}`,
        handle: fullHandle,
        displayName,
        avatarUrl: iconUrl ?? null,
        bio: profile.summary ?? null,
        profileUrl: profileUrl ?? null,
        isRemote: true,
    };
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
            searchUsers = await db.select({
                id: users.id,
                handle: users.handle,
                displayName: users.displayName,
                avatarUrl: users.avatarUrl,
                bio: users.bio,
            })
                .from(users)
                .where(userConditions)
                .limit(limit);
        }

        // Federated user lookup (exact handle@domain queries)
        if ((type === 'all' || type === 'users') && searchUsers.length < limit) {
            const parsedRemote = parseRemoteHandleQuery(query);
            if (parsedRemote) {
                const remoteProfile = await resolveRemoteUser(parsedRemote.handle, parsedRemote.domain);
                const remoteUser = buildRemoteUser(remoteProfile, parsedRemote.handle, parsedRemote.domain);
                if (remoteUser && !searchUsers.some((user) => user.handle.toLowerCase() === remoteUser.handle.toLowerCase())) {
                    searchUsers = [remoteUser, ...searchUsers].slice(0, limit);
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
                },
                orderBy: [desc(posts.createdAt)],
                limit,
            });
            searchPosts = postResults;
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
