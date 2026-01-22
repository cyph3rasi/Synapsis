import { NextResponse } from 'next/server';
import { db, posts, users, notifications } from '@/db';
import { requireAuth } from '@/lib/auth';
import { eq } from 'drizzle-orm';

type RouteContext = { params: Promise<{ id: string }> };

// Repost a post
export async function POST(request: Request, context: RouteContext) {
    try {
        const user = await requireAuth();
        const { id: postId } = await context.params;
        const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';

        if (user.isSuspended || user.isSilenced) {
            return NextResponse.json({ error: 'Account restricted' }, { status: 403 });
        }

        // Check if post exists
        const originalPost = await db.query.posts.findFirst({
            where: eq(posts.id, postId),
        });

        if (!originalPost) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }
        if (originalPost.isRemoved) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }

        // Create repost
        const [repost] = await db.insert(posts).values({
            userId: user.id,
            content: '', // Reposts don't have their own content
            repostOfId: postId,
            apId: `https://${nodeDomain}/posts/${crypto.randomUUID()}`,
            apUrl: `https://${nodeDomain}/posts/${crypto.randomUUID()}`,
        }).returning();

        // Update original post's repost count
        await db.update(posts)
            .set({ repostsCount: originalPost.repostsCount + 1 })
            .where(eq(posts.id, postId));

        // Update user's post count
        await db.update(users)
            .set({ postsCount: user.postsCount + 1 })
            .where(eq(users.id, user.id));

        if (originalPost.userId !== user.id) {
            await db.insert(notifications).values({
                userId: originalPost.userId,
                actorId: user.id,
                postId,
                type: 'repost',
            });
        }

        // TODO: Federate the repost (Announce activity)

        return NextResponse.json({ success: true, repost });
    } catch (error) {
        if (error instanceof Error && error.message === 'Authentication required') {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        return NextResponse.json({ error: 'Failed to repost' }, { status: 500 });
    }
}
