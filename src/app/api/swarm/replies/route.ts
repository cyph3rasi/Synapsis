/**
 * Swarm Replies Endpoint
 * 
 * POST: Receive a reply from another node
 * GET: Fetch replies to a post on this node
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, posts, users, media } from '@/db';
import { eq, desc, and } from 'drizzle-orm';
import { z } from 'zod';

// Schema for incoming swarm reply
const swarmReplySchema = z.object({
  postId: z.string().uuid(), // The local post being replied to
  reply: z.object({
    id: z.string(), // Original reply ID on the sender's node
    content: z.string(),
    createdAt: z.string(),
    author: z.object({
      handle: z.string(),
      displayName: z.string(),
      avatarUrl: z.string().optional(),
    }),
    nodeDomain: z.string(),
    mediaUrls: z.array(z.string()).optional(),
  }),
});

/**
 * POST /api/swarm/replies
 * 
 * DEPRECATED: This endpoint is disabled.
 * We now use real-time pull-based federation instead of push-based caching.
 */
export async function POST(request: NextRequest) {
  return NextResponse.json({
    error: 'This endpoint is deprecated. Swarm uses real-time pull-based federation.',
  }, { status: 410 }); // 410 Gone
}

/**
 * DELETE /api/swarm/replies
 * 
 * Receives a deletion request from another node.
 * Removes a reply that was previously delivered.
 */
export async function DELETE(request: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const body = await request.json();
    const { replyId, nodeDomain, authorHandle } = body;

    if (!replyId || !nodeDomain) {
      return NextResponse.json({ error: 'replyId and nodeDomain required' }, { status: 400 });
    }

    // Find the reply by its swarm ID
    const swarmReplyId = `swarm:${nodeDomain}:${replyId}`;
    const existingReply = await db.query.posts.findFirst({
      where: eq(posts.apId, swarmReplyId),
    });

    if (!existingReply) {
      // Already deleted or never existed
      return NextResponse.json({ success: true, message: 'Reply not found or already deleted' });
    }

    // Decrement parent's reply count
    if (existingReply.replyToId) {
      const parentPost = await db.query.posts.findFirst({
        where: eq(posts.id, existingReply.replyToId),
      });
      if (parentPost && parentPost.repliesCount > 0) {
        await db.update(posts)
          .set({ repliesCount: parentPost.repliesCount - 1 })
          .where(eq(posts.id, existingReply.replyToId));
      }
    }

    // Delete the reply
    await db.delete(posts).where(eq(posts.id, existingReply.id));

    console.log(`[Swarm] Deleted reply ${swarmReplyId} from ${nodeDomain}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Swarm] Delete reply error:', error);
    return NextResponse.json({ error: 'Failed to delete reply' }, { status: 500 });
  }
}

/**
 * GET /api/swarm/replies?postId=xxx
 * 
 * Returns replies to a specific post on this node.
 * Used by other nodes to fetch reply threads.
 */
export async function GET(request: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ replies: [] });
    }

    const { searchParams } = new URL(request.url);
    const postId = searchParams.get('postId');

    if (!postId) {
      return NextResponse.json({ error: 'postId required' }, { status: 400 });
    }

    const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost';

    // Get replies to this post
    const replies = await db
      .select({
        id: posts.id,
        content: posts.content,
        createdAt: posts.createdAt,
        likesCount: posts.likesCount,
        repostsCount: posts.repostsCount,
        repliesCount: posts.repliesCount,
        authorHandle: users.handle,
        authorDisplayName: users.displayName,
        authorAvatarUrl: users.avatarUrl,
      })
      .from(posts)
      .innerJoin(users, eq(posts.userId, users.id))
      .where(
        and(
          eq(posts.replyToId, postId),
          eq(posts.isRemoved, false)
        )
      )
      .orderBy(desc(posts.createdAt))
      .limit(50);

    // Format replies for swarm consumption
    const formattedReplies = replies.map(reply => ({
      id: reply.id,
      content: reply.content,
      createdAt: reply.createdAt.toISOString(),
      author: {
        handle: reply.authorHandle.includes('@') 
          ? reply.authorHandle.split('@')[0] 
          : reply.authorHandle,
        displayName: reply.authorDisplayName || reply.authorHandle,
        avatarUrl: reply.authorAvatarUrl || undefined,
      },
      nodeDomain: reply.authorHandle.includes('@')
        ? reply.authorHandle.split('@')[1]
        : nodeDomain,
      likeCount: reply.likesCount,
      repostCount: reply.repostsCount,
      replyCount: reply.repliesCount,
    }));

    return NextResponse.json({
      postId,
      replies: formattedReplies,
      nodeDomain,
    });
  } catch (error) {
    console.error('[Swarm] Fetch replies error:', error);
    return NextResponse.json({ error: 'Failed to fetch replies' }, { status: 500 });
  }
}
