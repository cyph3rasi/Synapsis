/**
 * Swarm Like Endpoint
 * 
 * POST: Receive a like from another swarm node
 * 
 * SECURITY: All requests must be cryptographically signed by the sender.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, posts, users, notifications, remoteLikes } from '@/db';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { verifyUserInteraction } from '@/lib/swarm/signature';

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
  signature: z.string(),
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

    // SECURITY: Verify the signature
    const { signature, ...payload } = data;
    const isValid = await verifyUserInteraction(
      payload,
      signature,
      data.like.actorHandle,
      data.like.actorNodeDomain
    );

    if (!isValid) {
      console.warn(`[Swarm] Invalid signature for like from ${data.like.actorHandle}@${data.like.actorNodeDomain}`);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

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

    // Check if already liked by this remote user
    const existingLike = await db.query.remoteLikes.findFirst({
      where: and(
        eq(remoteLikes.postId, data.postId),
        eq(remoteLikes.actorHandle, data.like.actorHandle),
        eq(remoteLikes.actorNodeDomain, data.like.actorNodeDomain)
      ),
    });

    if (existingLike) {
      return NextResponse.json({ success: true, message: 'Already liked' });
    }

    // Track the remote like
    await db.insert(remoteLikes).values({
      postId: data.postId,
      actorHandle: data.like.actorHandle,
      actorNodeDomain: data.like.actorNodeDomain,
    });

    // Increment like count
    await db.update(posts)
      .set({ likesCount: post.likesCount + 1 })
      .where(eq(posts.id, data.postId));

    // Create notification with actor info stored directly
    try {
      await db.insert(notifications).values({
        userId: post.userId,
        actorHandle: data.like.actorHandle,
        actorDisplayName: data.like.actorDisplayName,
        actorAvatarUrl: data.like.actorAvatarUrl || null,
        actorNodeDomain: data.like.actorNodeDomain,
        postId: data.postId,
        postContent: post.content?.slice(0, 200) || null,
        type: 'like',
      });
      console.log(`[Swarm] Created like notification for post ${data.postId} from ${data.like.actorHandle}@${data.like.actorNodeDomain}`);
    } catch (notifError) {
      console.error(`[Swarm] Failed to create like notification:`, notifError);
    }

    // Also notify bot owner if this is a bot's post
    const author = post.author as { isBot?: boolean; botOwnerId?: string } | null;
    if (author?.isBot && author.botOwnerId) {
      try {
        await db.insert(notifications).values({
          userId: author.botOwnerId,
          actorHandle: data.like.actorHandle,
          actorDisplayName: data.like.actorDisplayName,
          actorAvatarUrl: data.like.actorAvatarUrl || null,
          actorNodeDomain: data.like.actorNodeDomain,
          postId: data.postId,
          postContent: post.content?.slice(0, 200) || null,
          type: 'like',
        });
      } catch (err) {
        console.error('[Swarm] Failed to notify bot owner:', err);
      }
    }

    console.log(`[Swarm] Received like from ${data.like.actorHandle}@${data.like.actorNodeDomain} on post ${data.postId}`);

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
