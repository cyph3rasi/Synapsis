/**
 * Swarm Post Detail Endpoint
 * 
 * GET: Get a post's details for other swarm nodes
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, posts } from '@/db';
import { eq, desc, and } from 'drizzle-orm';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/swarm/posts/[id]
 * 
 * Returns post details including replies for swarm federation.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const { id: postId } = await context.params;

    // Find the post
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, postId),
      with: {
        author: true,
        media: true,
      },
    });

    if (!post || post.isRemoved) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Get replies
    const replies = await db.query.posts.findMany({
      where: and(
        eq(posts.replyToId, postId),
        eq(posts.isRemoved, false)
      ),
      with: {
        author: true,
        media: true,
      },
      orderBy: [desc(posts.createdAt)],
      limit: 50,
    });

    const author = post.author as any;

    return NextResponse.json({
      post: {
        id: post.id,
        apId: post.apId, // Expose apId for swarm coordination (e.g. deletion recovery)
        content: post.content,
        createdAt: post.createdAt.toISOString(),
        likesCount: post.likesCount,
        repostsCount: post.repostsCount,
        repliesCount: post.repliesCount,
        author: {
          handle: author.handle,
          displayName: author.displayName,
          avatarUrl: author.avatarUrl,
        },
        media: (post.media as any[])?.map(m => ({
          url: m.url,
          altText: m.altText,
        })) || [],
        linkPreviewUrl: post.linkPreviewUrl,
        linkPreviewTitle: post.linkPreviewTitle,
        linkPreviewDescription: post.linkPreviewDescription,
        linkPreviewImage: post.linkPreviewImage,
      },
      replies: replies.map(r => {
        const replyAuthor = r.author as any;
        return {
          id: r.id,
          content: r.content,
          createdAt: r.createdAt.toISOString(),
          likesCount: r.likesCount,
          repostsCount: r.repostsCount,
          repliesCount: r.repliesCount,
          author: {
            handle: replyAuthor.handle,
            displayName: replyAuthor.displayName,
            avatarUrl: replyAuthor.avatarUrl,
          },
          media: (r.media as any[])?.map(m => ({
            url: m.url,
            altText: m.altText,
          })) || [],
        };
      }),
    });
  } catch (error) {
    console.error('[Swarm] Post detail error:', error);
    return NextResponse.json({ error: 'Failed to get post' }, { status: 500 });
  }
}
