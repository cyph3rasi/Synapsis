import { NextResponse } from 'next/server';
import { db, users, posts } from '@/db';
import { ilike, or, desc, and, notInArray, eq } from 'drizzle-orm';

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
        let searchUsers: { id: string; handle: string; displayName: string | null; avatarUrl: string | null; bio: string | null }[] = [];
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
