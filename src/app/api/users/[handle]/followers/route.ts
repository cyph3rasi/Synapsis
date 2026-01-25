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
            return NextResponse.json({ followers: [], nextCursor: null });
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

        // Get followers
        const userFollowers = await db
            .select({
                id: follows.id,
                follower: users,
            })
            .from(follows)
            .innerJoin(users, eq(follows.followerId, users.id))
            .where(eq(follows.followingId, user.id))
            .limit(limit);

        return NextResponse.json({
            followers: userFollowers.map(f => ({
                id: f.follower.id,
                handle: f.follower.handle,
                displayName: f.follower.displayName,
                avatarUrl: f.follower.avatarUrl,
                bio: f.follower.bio,
                isBot: f.follower.isBot,
            })),
            nextCursor: userFollowers.length === limit ? userFollowers[userFollowers.length - 1]?.id : null,
        });
    } catch (error) {
        console.error('Get followers error:', error);
        return NextResponse.json({ error: 'Failed to get followers' }, { status: 500 });
    }
}
