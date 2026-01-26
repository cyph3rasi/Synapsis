/**
 * Swarm Timeline Endpoint
 * 
 * GET: Returns recent public posts from this node for the swarm timeline
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, posts, users, media, nodes } from '@/db';
import { eq, desc, and, isNull } from 'drizzle-orm';

export interface SwarmPost {
  id: string;
  content: string;
  createdAt: string;
  author: {
    handle: string;
    displayName: string;
    avatarUrl?: string;
    isNsfw: boolean;
  };
  nodeDomain: string;
  nodeIsNsfw: boolean;
  isNsfw: boolean;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  media?: { url: string; mimeType?: string; altText?: string }[];
  // Link preview
  linkPreviewUrl?: string;
  linkPreviewTitle?: string;
  linkPreviewDescription?: string;
  linkPreviewImage?: string;
}

/**
 * GET /api/swarm/timeline
 * 
 * Returns recent public posts from this node.
 * Used by other nodes to build the swarm-wide timeline.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

    if (!db) {
      return NextResponse.json({ posts: [], nodeDomain: '', nodeIsNsfw: false });
    }

    const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost';
    
    // Get node NSFW status
    const node = await db.query.nodes.findFirst({
      where: eq(nodes.domain, nodeDomain),
    });
    const nodeIsNsfw = node?.isNsfw ?? false;

    // Get recent public posts (not replies, local users only, not removed)
    const recentPosts = await db
      .select({
        id: posts.id,
        content: posts.content,
        createdAt: posts.createdAt,
        isNsfw: posts.isNsfw,
        likesCount: posts.likesCount,
        repostsCount: posts.repostsCount,
        repliesCount: posts.repliesCount,
        linkPreviewUrl: posts.linkPreviewUrl,
        linkPreviewTitle: posts.linkPreviewTitle,
        linkPreviewDescription: posts.linkPreviewDescription,
        linkPreviewImage: posts.linkPreviewImage,
        authorHandle: users.handle,
        authorDisplayName: users.displayName,
        authorAvatarUrl: users.avatarUrl,
        authorIsNsfw: users.isNsfw,
        authorNodeId: users.nodeId,
      })
      .from(posts)
      .innerJoin(users, eq(posts.userId, users.id))
      .where(
        and(
          isNull(posts.replyToId), // Not a reply
          eq(posts.isRemoved, false) // Not removed
        )
      )
      .orderBy(desc(posts.createdAt))
      .limit(limit);

    // Fetch media for each post
    const swarmPosts: SwarmPost[] = [];
    
    for (const post of recentPosts) {
      const postMedia = await db
        .select({ url: media.url, mimeType: media.mimeType, altText: media.altText })
        .from(media)
        .where(eq(media.postId, post.id));

      swarmPosts.push({
        id: post.id,
        content: post.content,
        createdAt: post.createdAt.toISOString(),
        author: {
          handle: post.authorHandle,
          displayName: post.authorDisplayName || post.authorHandle,
          avatarUrl: post.authorAvatarUrl || undefined,
          isNsfw: post.authorIsNsfw,
        },
        nodeDomain,
        nodeIsNsfw,
        isNsfw: post.isNsfw || post.authorIsNsfw || nodeIsNsfw, // Cascade NSFW flag
        likeCount: post.likesCount,
        repostCount: post.repostsCount,
        replyCount: post.repliesCount,
        media: postMedia.length > 0 ? postMedia.map(m => ({
          url: m.url,
          mimeType: m.mimeType || undefined,
          altText: m.altText || undefined,
        })) : undefined,
        linkPreviewUrl: post.linkPreviewUrl || undefined,
        linkPreviewTitle: post.linkPreviewTitle || undefined,
        linkPreviewDescription: post.linkPreviewDescription || undefined,
        linkPreviewImage: post.linkPreviewImage || undefined,
      });
    }

    return NextResponse.json({
      posts: swarmPosts,
      nodeDomain,
      nodeIsNsfw,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Swarm timeline error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch timeline' },
      { status: 500 }
    );
  }
}
