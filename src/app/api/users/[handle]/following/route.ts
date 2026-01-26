import { NextResponse } from 'next/server';
import { db, follows, users, remoteFollows } from '@/db';
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

        // Get local following
        const userFollowing = await db
            .select({
                id: follows.id,
                following: users,
            })
            .from(follows)
            .innerJoin(users, eq(follows.followingId, users.id))
            .where(eq(follows.followerId, user.id))
            .limit(limit);

        const localFollowing = userFollowing.map(f => ({
            id: f.following.id,
            handle: f.following.handle,
            displayName: f.following.displayName,
            avatarUrl: f.following.avatarUrl,
            bio: f.following.bio,
            isRemote: false,
            isBot: f.following.isBot,
        }));

        // Get remote following
        const userRemoteFollowing = await db.query.remoteFollows.findMany({
            where: eq(remoteFollows.followerId, user.id),
            limit,
        });

        const remoteFollowing = userRemoteFollowing.map(f => ({
            id: f.targetActorUrl,
            handle: f.targetHandle,
            displayName: f.displayName || f.targetHandle.split('@')[0], // Use stored display name or username part
            avatarUrl: f.avatarUrl,
            bio: f.bio,
            isRemote: true,
        }));

        // Merge and return
        const allFollowing = [...localFollowing, ...remoteFollowing].slice(0, limit);

        return NextResponse.json({
            following: allFollowing,
            nextCursor: allFollowing.length === limit ? allFollowing[allFollowing.length - 1]?.id : null,
        });
    } catch (error) {
        console.error('Get following error:', error);
        return NextResponse.json({ error: 'Failed to get following' }, { status: 500 });
    }
}
