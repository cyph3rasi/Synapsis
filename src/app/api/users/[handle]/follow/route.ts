import { NextResponse } from 'next/server';
import { db, follows, users, notifications } from '@/db';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';

type RouteContext = { params: Promise<{ handle: string }> };

// Check follow status
export async function GET(request: Request, context: RouteContext) {
    try {
        const currentUser = await requireAuth();
        const { handle } = await context.params;
        const cleanHandle = handle.toLowerCase().replace(/^@/, '');

        if (currentUser.isSuspended || currentUser.isSilenced) {
            return NextResponse.json({ error: 'Account restricted' }, { status: 403 });
        }

        if (!db) {
            return NextResponse.json({ error: 'Database not available' }, { status: 503 });
        }

        const targetUser = await db.query.users.findFirst({
            where: eq(users.handle, cleanHandle),
        });

        if (!targetUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }
        if (targetUser.isSuspended) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        if (targetUser.id === currentUser.id) {
            return NextResponse.json({ following: false, self: true });
        }

        const existingFollow = await db.query.follows.findFirst({
            where: and(
                eq(follows.followerId, currentUser.id),
                eq(follows.followingId, targetUser.id)
            ),
        });

        return NextResponse.json({ following: !!existingFollow });
    } catch (error) {
        if (error instanceof Error && error.message === 'Authentication required') {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        console.error('Follow status error:', error);
        return NextResponse.json({ error: 'Failed to get follow status' }, { status: 500 });
    }
}

// Follow a user
export async function POST(request: Request, context: RouteContext) {
    try {
        const currentUser = await requireAuth();
        const { handle } = await context.params;
        const cleanHandle = handle.toLowerCase().replace(/^@/, '');

        if (currentUser.isSuspended || currentUser.isSilenced) {
            return NextResponse.json({ error: 'Account restricted' }, { status: 403 });
        }

        if (!db) {
            return NextResponse.json({ error: 'Database not available' }, { status: 503 });
        }

        // Find target user
        const targetUser = await db.query.users.findFirst({
            where: eq(users.handle, cleanHandle),
        });

        if (!targetUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }
        if (targetUser.isSuspended) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Can't follow yourself
        if (targetUser.id === currentUser.id) {
            return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 });
        }

        // Check if already following
        const existingFollow = await db.query.follows.findFirst({
            where: and(
                eq(follows.followerId, currentUser.id),
                eq(follows.followingId, targetUser.id)
            ),
        });

        if (existingFollow) {
            return NextResponse.json({ error: 'Already following' }, { status: 400 });
        }

        // Create follow
        await db.insert(follows).values({
            followerId: currentUser.id,
            followingId: targetUser.id,
        });

        if (currentUser.id !== targetUser.id) {
            await db.insert(notifications).values({
                userId: targetUser.id,
                actorId: currentUser.id,
                type: 'follow',
            });
        }

        // Update counts
        await db.update(users)
            .set({ followingCount: currentUser.followingCount + 1 })
            .where(eq(users.id, currentUser.id));

        await db.update(users)
            .set({ followersCount: targetUser.followersCount + 1 })
            .where(eq(users.id, targetUser.id));

        // TODO: Send ActivityPub Follow activity

        return NextResponse.json({ success: true, following: true });
    } catch (error) {
        if (error instanceof Error && error.message === 'Authentication required') {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        console.error('Follow error:', error);
        return NextResponse.json({ error: 'Failed to follow' }, { status: 500 });
    }
}

// Unfollow a user
export async function DELETE(request: Request, context: RouteContext) {
    try {
        const currentUser = await requireAuth();
        const { handle } = await context.params;
        const cleanHandle = handle.toLowerCase().replace(/^@/, '');

        if (!db) {
            return NextResponse.json({ error: 'Database not available' }, { status: 503 });
        }

        // Find target user
        const targetUser = await db.query.users.findFirst({
            where: eq(users.handle, cleanHandle),
        });

        if (!targetUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }
        if (targetUser.isSuspended) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Find existing follow
        const existingFollow = await db.query.follows.findFirst({
            where: and(
                eq(follows.followerId, currentUser.id),
                eq(follows.followingId, targetUser.id)
            ),
        });

        if (!existingFollow) {
            return NextResponse.json({ error: 'Not following' }, { status: 400 });
        }

        // Remove follow
        await db.delete(follows).where(eq(follows.id, existingFollow.id));

        // Update counts
        await db.update(users)
            .set({ followingCount: Math.max(0, currentUser.followingCount - 1) })
            .where(eq(users.id, currentUser.id));

        await db.update(users)
            .set({ followersCount: Math.max(0, targetUser.followersCount - 1) })
            .where(eq(users.id, targetUser.id));

        // TODO: Send ActivityPub Undo Follow activity

        return NextResponse.json({ success: true, following: false });
    } catch (error) {
        if (error instanceof Error && error.message === 'Authentication required') {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        console.error('Unfollow error:', error);
        return NextResponse.json({ error: 'Failed to unfollow' }, { status: 500 });
    }
}
