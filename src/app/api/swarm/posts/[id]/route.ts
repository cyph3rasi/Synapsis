/**
 * Swarm Post Endpoint
 * 
 * GET: Returns a single post for swarm requests
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, posts, users, media } from '@/db';
import { eq } from 'drizzle-orm';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/swarm/posts/[id]
 * 
 * Returns a single post with author info.
 * Used by other nodes to fetch post details.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: postId } = await context.params;

    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost';

    // Find the post with author
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, postId),
      with: { author: true },
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (post.isRemoved) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Get media for the post
    const postMedia = await db
      .select({ url: media.url, mimeType: media.mimeType, altText: media.altText })
      .from(media)
      .where(eq(media.postId, postId));

    const author = post.author as {
      handle: string;
      displayName: string | null;
      avatarUrl: string | null;
      isNsfw: boolean;
    };

    return NextResponse.json({
      id: post.id,
      content: post.content,
      createdAt: post.createdAt.toISOString(),
      author: {
        handle: author.handle,
        displayName: author.displayName || author.handle,
        avatarUrl: author.avatarUrl || undefined,
        isNsfw: author.isNsfw,
      },
      nodeDomain,
      isNsfw: post.isNsfw || author.isNsfw,
      likesCount: post.likesCount,
      repostsCount: post.repostsCount,
      repliesCount: post.repliesCount,
      media: postMedia.length > 0 ? postMedia.map(m => ({
        url: m.url,
        mimeType: m.mimeType || undefined,
        altText: m.altText || undefined,
      })) : undefined,
      linkPreviewUrl: post.linkPreviewUrl || undefined,
      linkPreviewTitle: post.linkPreviewTitle || undefined,
      linkPreviewDescription: post.linkPreviewDescription || undefined,
      linkPreviewImage: post.linkPreviewImage || undefined,
      replyToId: post.replyToId || undefined,
      repostOfId: post.repostOfId || undefined,
    });
  } catch (error) {
    console.error('Swarm post error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch post' },
      { status: 500 }
    );
  }
}
