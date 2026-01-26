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
 * Receives a reply from another node in the swarm.
 * The reply is stored as a remote reply linked to the local post.
 */
export async function POST(request: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const body = await request.json();
    const data = swarmReplySchema.parse(body);

    // Verify the target post exists on this node
    const targetPost = await db.query.posts.findFirst({
      where: eq(posts.id, data.postId),
    });

    if (!targetPost) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Check if we already have this reply (by swarm ID)
    const swarmReplyId = `swarm:${data.reply.nodeDomain}:${data.reply.id}`;
    const existingReply = await db.query.posts.findFirst({
      where: eq(posts.apId, swarmReplyId),
    });

    if (existingReply) {
      return NextResponse.json({ success: true, message: 'Reply already exists' });
    }

    // We need a system user to attribute swarm replies to
    // For now, we'll store them with metadata in the apId/apUrl fields
    // and create a virtual representation

    // Get or create a placeholder user for this remote author
    let remoteUser = await db.query.users.findFirst({
      where: eq(users.handle, `${data.reply.author.handle}@${data.reply.nodeDomain}`),
    });

    if (!remoteUser) {
      // Create a placeholder user for the remote author
      const [newUser] = await db.insert(users).values({
        did: `did:swarm:${data.reply.nodeDomain}:${data.reply.author.handle}`,
        handle: `${data.reply.author.handle}@${data.reply.nodeDomain}`,
        displayName: data.reply.author.displayName,
        avatarUrl: data.reply.author.avatarUrl || null,
        publicKey: 'swarm-remote-user', // Placeholder
      }).returning();
      remoteUser = newUser;
    }

    // Create the reply post
    const [replyPost] = await db.insert(posts).values({
      userId: remoteUser.id,
      content: data.reply.content,
      replyToId: data.postId,
      apId: swarmReplyId,
      apUrl: `https://${data.reply.nodeDomain}/${data.reply.author.handle}/posts/${data.reply.id}`,
      createdAt: new Date(data.reply.createdAt),
    }).returning();

    // Update the parent post's reply count
    await db.update(posts)
      .set({ repliesCount: targetPost.repliesCount + 1 })
      .where(eq(posts.id, data.postId));

    console.log(`[Swarm] Received reply from ${data.reply.nodeDomain} to post ${data.postId}`);

    return NextResponse.json({ 
      success: true, 
      replyId: replyPost.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.issues }, { status: 400 });
    }
    console.error('[Swarm] Reply error:', error);
    return NextResponse.json({ error: 'Failed to process reply' }, { status: 500 });
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
