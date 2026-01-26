/**
 * Swarm Like Endpoint
 * 
 * POST: Receive a like from another swarm node
 * 
 * This is the swarm-first approach - direct node-to-node communication
 * for likes, bypassing ActivityPub for Synapsis nodes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, posts, users, notifications } from '@/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const swarmLikeSchema = z.object({
  postId: z.string().uuid(),
  like: z.object({
    actorHandle: z.string(),
    actorDisplayName: z.string(),
    actorAvatarUrl: z.string().optional(),
    actorNodeDomain: z.string(),
    interactionId: z.string(),
    timestamp: z.string(),
  }),
});

/**
 * POST /api/swarm/interactions/like
 * 
 * Receives a like from another swarm node.
 */
export async function POST(request: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const body = await request.json();
    const data = swarmLikeSchema.parse(body);

    // Find the target post
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, data.postId),
      with: { author: true },
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (post.isRemoved) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Increment like count
    await db.update(posts)
      .set({ likesCount: post.likesCount + 1 })
      .where(eq(posts.id, data.postId));

    // Create a notification for the post author
    // First, get or create a placeholder user for the remote liker
    const remoteHandle = `${data.like.actorHandle}@${data.like.actorNodeDomain}`;
    let remoteUser = await db.query.users.findFirst({
      where: eq(users.handle, remoteHandle),
    });

    if (!remoteUser) {
      // Create a placeholder user for the remote actor
      const [newUser] = await db.insert(users).values({
        did: `did:swarm:${data.like.actorNodeDomain}:${data.like.actorHandle}`,
        handle: remoteHandle,
        displayName: data.like.actorDisplayName,
        avatarUrl: data.like.actorAvatarUrl || null,
        publicKey: 'swarm-remote-user',
      }).returning();
      remoteUser = newUser;
    }

    // Create notification
    try {
      await db.insert(notifications).values({
        userId: post.userId,
        actorId: remoteUser.id,
        postId: data.postId,
        type: 'like',
      });
      console.log(`[Swarm] Created like notification for post ${data.postId} from ${remoteHandle}`);
    } catch (notifError) {
      console.error(`[Swarm] Failed to create like notification:`, notifError);
    }

    // Also notify bot owner if this is a bot's post
    const { notifyBotOwnerForPost } = await import('@/lib/notifications/botOwnerNotify');
    await notifyBotOwnerForPost(post.userId, remoteUser.id, 'like', data.postId);

    console.log(`[Swarm] Received like from ${remoteHandle} on post ${data.postId}`);

    return NextResponse.json({
      success: true,
      message: 'Like received',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.issues }, { status: 400 });
    }
    console.error('[Swarm] Like error:', error);
    return NextResponse.json({ error: 'Failed to process like' }, { status: 500 });
  }
}
