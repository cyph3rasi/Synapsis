/**
 * Swarm Repost Endpoint
 * 
 * POST: Receive a repost from another swarm node
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, posts, users, notifications } from '@/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const swarmRepostSchema = z.object({
  postId: z.string().uuid(),
  repost: z.object({
    actorHandle: z.string(),
    actorDisplayName: z.string(),
    actorAvatarUrl: z.string().optional(),
    actorNodeDomain: z.string(),
    repostId: z.string(), // The ID of the repost on the actor's node
    interactionId: z.string(),
    timestamp: z.string(),
  }),
});

/**
 * POST /api/swarm/interactions/repost
 * 
 * Receives a repost notification from another swarm node.
 */
export async function POST(request: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const body = await request.json();
    const data = swarmRepostSchema.parse(body);

    // Find the target post
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, data.postId),
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (post.isRemoved) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Increment repost count
    await db.update(posts)
      .set({ repostsCount: post.repostsCount + 1 })
      .where(eq(posts.id, data.postId));

    // Get or create placeholder user for the remote reposter
    const remoteHandle = `${data.repost.actorHandle}@${data.repost.actorNodeDomain}`;
    let remoteUser = await db.query.users.findFirst({
      where: eq(users.handle, remoteHandle),
    });

    if (!remoteUser) {
      const [newUser] = await db.insert(users).values({
        did: `did:swarm:${data.repost.actorNodeDomain}:${data.repost.actorHandle}`,
        handle: remoteHandle,
        displayName: data.repost.actorDisplayName,
        avatarUrl: data.repost.actorAvatarUrl || null,
        publicKey: 'swarm-remote-user',
      }).returning();
      remoteUser = newUser;
    }

    // Create notification
    await db.insert(notifications).values({
      userId: post.userId,
      actorId: remoteUser.id,
      postId: data.postId,
      type: 'repost',
    });

    // Also notify bot owner if this is a bot's post
    const { notifyBotOwnerForPost } = await import('@/lib/notifications/botOwnerNotify');
    await notifyBotOwnerForPost(post.userId, remoteUser.id, 'repost', data.postId);

    console.log(`[Swarm] Received repost from ${remoteHandle} on post ${data.postId}`);

    return NextResponse.json({
      success: true,
      message: 'Repost received',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.issues }, { status: 400 });
    }
    console.error('[Swarm] Repost error:', error);
    return NextResponse.json({ error: 'Failed to process repost' }, { status: 500 });
  }
}
