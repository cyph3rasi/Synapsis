import { NextResponse } from 'next/server';
import { db, posts, users } from '@/db';
import { eq, desc, and } from 'drizzle-orm';

type RouteContext = { params: Promise<{ handle: string }> };

export async function GET(request: Request, context: RouteContext) {
    try {
        const { handle } = await context.params;
        const cleanHandle = handle.toLowerCase().replace(/^@/, '');
        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

        // Return empty if no database
        if (!db) {
            return NextResponse.json({ posts: [], nextCursor: null });
        }

        // Find the user
        const user = await db.query.users.findFirst({
            where: eq(users.handle, cleanHandle),
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }
        if (user.isSuspended) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Get user's posts
        const userPosts = await db.query.posts.findMany({
            where: and(eq(posts.userId, user.id), eq(posts.isRemoved, false)),
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

        return NextResponse.json({
            posts: userPosts,
            nextCursor: userPosts.length === limit ? userPosts[userPosts.length - 1]?.id : null,
        });
    } catch (error) {
        console.error('Get user posts error:', error);
        return NextResponse.json({ error: 'Failed to get posts' }, { status: 500 });
    }
}
