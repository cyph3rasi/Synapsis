import { NextResponse } from 'next/server';
import { db, posts, likes, users, notifications } from '@/db';
import { requireAuth } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';

type RouteContext = { params: Promise<{ id: string }> };

// Like a post
export async function POST(request: Request, context: RouteContext) {
    try {
        const user = await requireAuth();
        const { id: postId } = await context.params;

        if (user.isSuspended || user.isSilenced) {
            return NextResponse.json({ error: 'Account restricted' }, { status: 403 });
        }

        // Check if post exists
        const post = await db.query.posts.findFirst({
            where: eq(posts.id, postId),
        });

        if (!post) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }
        if (post.isRemoved) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }

        // Check if already liked
        const existingLike = await db.query.likes.findFirst({
            where: and(
                eq(likes.userId, user.id),
                eq(likes.postId, postId)
            ),
        });

        if (existingLike) {
            return NextResponse.json({ error: 'Already liked' }, { status: 400 });
        }

        // Create like
        await db.insert(likes).values({
            userId: user.id,
            postId,
        });

        // Update post's like count
        await db.update(posts)
            .set({ likesCount: post.likesCount + 1 })
            .where(eq(posts.id, postId));

        if (post.userId !== user.id) {
            await db.insert(notifications).values({
                userId: post.userId,
                actorId: user.id,
                postId,
                type: 'like',
            });
        }

        // TODO: Federate the like

        return NextResponse.json({ success: true, liked: true });
    } catch (error) {
        if (error instanceof Error && error.message === 'Authentication required') {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        return NextResponse.json({ error: 'Failed to like post' }, { status: 500 });
    }
}

// Unlike a post
export async function DELETE(request: Request, context: RouteContext) {
    try {
        const user = await requireAuth();
        const { id: postId } = await context.params;

        if (user.isSuspended || user.isSilenced) {
            return NextResponse.json({ error: 'Account restricted' }, { status: 403 });
        }

        // Check if post exists
        const post = await db.query.posts.findFirst({
            where: eq(posts.id, postId),
        });

        if (!post) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }
        if (post.isRemoved) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }

        // Find the like
        const existingLike = await db.query.likes.findFirst({
            where: and(
                eq(likes.userId, user.id),
                eq(likes.postId, postId)
            ),
        });

        if (!existingLike) {
            return NextResponse.json({ error: 'Not liked' }, { status: 400 });
        }

        // Remove like
        await db.delete(likes).where(eq(likes.id, existingLike.id));

        // Update post's like count
        await db.update(posts)
            .set({ likesCount: Math.max(0, post.likesCount - 1) })
            .where(eq(posts.id, postId));

        return NextResponse.json({ success: true, liked: false });
    } catch (error) {
        if (error instanceof Error && error.message === 'Authentication required') {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        return NextResponse.json({ error: 'Failed to unlike post' }, { status: 500 });
    }
}
