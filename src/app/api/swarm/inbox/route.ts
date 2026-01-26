/**
 * Swarm Inbox Endpoint
 * 
 * POST: Receive posts from users on other swarm nodes that local users follow
 * 
 * This is the swarm equivalent of ActivityPub inbox - when a user on another
 * Synapsis node creates a post, it gets pushed here for their followers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, posts, users, media, remoteFollowers } from '@/db';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const swarmPostSchema = z.object({
  post: z.object({
    id: z.string(),
    content: z.string(),
    createdAt: z.string(),
    isNsfw: z.boolean(),
    replyToId: z.string().optional(),
    repostOfId: z.string().optional(),
    media: z.array(z.object({
      url: z.string(),
      mimeType: z.string().optional(),
      altText: z.string().optional(),
    })).optional(),
    linkPreviewUrl: z.string().optional(),
    linkPreviewTitle: z.string().optional(),
    linkPreviewDescription: z.string().optional(),
    linkPreviewImage: z.string().optional(),
  }),
  author: z.object({
    handle: z.string(),
    displayName: z.string(),
    avatarUrl: z.string().optional(),
    isNsfw: z.boolean(),
  }),
  nodeDomain: z.string(),
  timestamp: z.string(),
});

/**
 * POST /api/swarm/inbox
 * 
 * Receives a post from another swarm node.
 * Stores it for local users who follow the author.
 */
export async function POST(request: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const body = await request.json();
    const data = swarmPostSchema.parse(body);

    // Construct the swarm post ID
    const swarmPostId = `swarm:${data.nodeDomain}:${data.post.id}`;
    
    // Check if we already have this post
    const existingPost = await db.query.posts.findFirst({
      where: eq(posts.apId, swarmPostId),
    });

    if (existingPost) {
      return NextResponse.json({
        success: true,
        message: 'Post already exists',
      });
    }

    // Check if anyone on this node follows the author
    const authorActorUrl = `swarm://${data.nodeDomain}/${data.author.handle}`;
    const hasFollowers = await db.query.remoteFollowers.findFirst({
      where: eq(remoteFollowers.actorUrl, authorActorUrl),
    });

    // Even if no one follows, we might want to cache for timeline
    // For now, only store if someone follows
    if (!hasFollowers) {
      return NextResponse.json({
        success: true,
        message: 'No local followers',
      });
    }

    // Get or create placeholder user for the remote author
    const remoteHandle = `${data.author.handle}@${data.nodeDomain}`;
    let remoteUser = await db.query.users.findFirst({
      where: eq(users.handle, remoteHandle),
    });

    if (!remoteUser) {
      const [newUser] = await db.insert(users).values({
        did: `did:swarm:${data.nodeDomain}:${data.author.handle}`,
        handle: remoteHandle,
        displayName: data.author.displayName,
        avatarUrl: data.author.avatarUrl || null,
        isNsfw: data.author.isNsfw,
        publicKey: 'swarm-remote-user',
      }).returning();
      remoteUser = newUser;
    } else {
      // Update profile info if changed
      await db.update(users)
        .set({
          displayName: data.author.displayName,
          avatarUrl: data.author.avatarUrl || remoteUser.avatarUrl,
          isNsfw: data.author.isNsfw,
        })
        .where(eq(users.id, remoteUser.id));
    }

    // Create the post
    const [newPost] = await db.insert(posts).values({
      userId: remoteUser.id,
      content: data.post.content,
      isNsfw: data.post.isNsfw || data.author.isNsfw,
      apId: swarmPostId,
      apUrl: `https://${data.nodeDomain}/${data.author.handle}/posts/${data.post.id}`,
      createdAt: new Date(data.post.createdAt),
      linkPreviewUrl: data.post.linkPreviewUrl || null,
      linkPreviewTitle: data.post.linkPreviewTitle || null,
      linkPreviewDescription: data.post.linkPreviewDescription || null,
      linkPreviewImage: data.post.linkPreviewImage || null,
    }).returning();

    // Store media attachments
    if (data.post.media && data.post.media.length > 0) {
      for (const m of data.post.media) {
        await db.insert(media).values({
          userId: remoteUser.id,
          postId: newPost.id,
          url: m.url,
          mimeType: m.mimeType || null,
          altText: m.altText || null,
        });
      }
    }

    console.log(`[Swarm] Received post from ${remoteHandle}: ${newPost.id}`);

    return NextResponse.json({
      success: true,
      message: 'Post received',
      postId: newPost.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.issues }, { status: 400 });
    }
    console.error('[Swarm] Inbox error:', error);
    return NextResponse.json({ error: 'Failed to process post' }, { status: 500 });
  }
}
