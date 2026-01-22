import { NextResponse } from 'next/server';
import { db, follows, users } from '@/db';
import { eq } from 'drizzle-orm';

type RouteContext = { params: Promise<{ handle: string }> };

export async function GET(request: Request, context: RouteContext) {
    try {
        const { handle } = await context.params;
        const cleanHandle = handle.toLowerCase().replace(/^@/, '');
        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

        // Return empty if no database
        if (!db) {
            return NextResponse.json({ following: [], nextCursor: null });
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

        // Get following
        const userFollowing = await db.query.follows.findMany({
            where: eq(follows.followerId, user.id),
            with: {
                following: true,
            },
            limit,
        });

        return NextResponse.json({
            following: userFollowing.map(f => ({
                id: f.following.id,
                handle: f.following.handle,
                displayName: f.following.displayName,
                avatarUrl: f.following.avatarUrl,
                bio: f.following.bio,
            })),
            nextCursor: userFollowing.length === limit ? userFollowing[userFollowing.length - 1]?.id : null,
        });
    } catch (error) {
        console.error('Get following error:', error);
        return NextResponse.json({ error: 'Failed to get following' }, { status: 500 });
    }
}
