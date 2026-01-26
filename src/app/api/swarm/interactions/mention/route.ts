/**
 * Swarm Mention Endpoint
 * 
 * POST: Receive a mention notification from another swarm node
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, users, notifications, posts } from '@/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const swarmMentionSchema = z.object({
  mentionedHandle: z.string(),
  mention: z.object({
    actorHandle: z.string(),
    actorDisplayName: z.string(),
    actorAvatarUrl: z.string().optional(),
    actorNodeDomain: z.string(),
    postId: z.string(),
    postContent: z.string(),
    interactionId: z.string(),
    timestamp: z.string(),
  }),
});

/**
 * POST /api/swarm/interactions/mention
 * 
 * Receives a mention notification from another swarm node.
 */
export async function POST(request: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const body = await request.json();
    const data = swarmMentionSchema.parse(body);

    // Find the mentioned user (local user)
    const mentionedUser = await db.query.users.findFirst({
      where: eq(users.handle, data.mentionedHandle.toLowerCase()),
    });

    if (!mentionedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (mentionedUser.isSuspended) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get or create placeholder user for the remote actor
    const remoteHandle = `${data.mention.actorHandle}@${data.mention.actorNodeDomain}`;
    let remoteUser = await db.query.users.findFirst({
      where: eq(users.handle, remoteHandle),
    });

    if (!remoteUser) {
      const [newUser] = await db.insert(users).values({
        did: `did:swarm:${data.mention.actorNodeDomain}:${data.mention.actorHandle}`,
        handle: remoteHandle,
        displayName: data.mention.actorDisplayName,
        avatarUrl: data.mention.actorAvatarUrl || null,
        publicKey: 'swarm-remote-user',
      }).returning();
      remoteUser = newUser;
    }

    // Check if we already have this post cached (from swarm timeline)
    // If not, create a placeholder post for the notification
    const swarmPostId = `swarm:${data.mention.actorNodeDomain}:${data.mention.postId}`;
    let post = await db.query.posts.findFirst({
      where: eq(posts.apId, swarmPostId),
    });

    if (!post) {
      // Create a placeholder post for the mention
      const [newPost] = await db.insert(posts).values({
        userId: remoteUser.id,
        content: data.mention.postContent,
        apId: swarmPostId,
        apUrl: `https://${data.mention.actorNodeDomain}/${data.mention.actorHandle}/posts/${data.mention.postId}`,
        createdAt: new Date(data.mention.timestamp),
      }).returning();
      post = newPost;
    }

    // Create notification
    await db.insert(notifications).values({
      userId: mentionedUser.id,
      actorId: remoteUser.id,
      postId: post.id,
      type: 'mention',
    });

    // Also notify bot owner if this is a bot being mentioned
    const { notifyBotOwnerForPost } = await import('@/lib/notifications/botOwnerNotify');
    await notifyBotOwnerForPost(mentionedUser.id, remoteUser.id, 'mention', post.id);

    console.log(`[Swarm] Received mention from ${remoteHandle} for @${data.mentionedHandle}`);

    return NextResponse.json({
      success: true,
      message: 'Mention received',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.issues }, { status: 400 });
    }
    console.error('[Swarm] Mention error:', error);
    return NextResponse.json({ error: 'Failed to process mention' }, { status: 500 });
  }
}
