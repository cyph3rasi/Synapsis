/**
 * Swarm Post Likes Endpoint
 * 
 * GET: Check who has liked a post (for real-time like status)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, posts, likes, users, remoteLikes } from '@/db';
import { eq, and } from 'drizzle-orm';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/swarm/posts/[id]/likes
 * 
 * Returns like information for a post.
 * Query params:
 *   - checkHandle: Check if a specific handle has liked this post
 *   - checkDomain: The domain of the user to check (required with checkHandle for remote users)
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const { id: postId } = await context.params;
    const { searchParams } = new URL(request.url);
    const checkHandle = searchParams.get('checkHandle');
    const checkDomain = searchParams.get('checkDomain');

    // Find the post
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, postId),
    });

    if (!post || post.isRemoved) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // If checking a specific handle
    if (checkHandle) {
      // If domain is provided, check remote likes
      if (checkDomain) {
        const remoteLike = await db.query.remoteLikes.findFirst({
          where: and(
            eq(remoteLikes.postId, postId),
            eq(remoteLikes.actorHandle, checkHandle),
            eq(remoteLikes.actorNodeDomain, checkDomain)
          ),
        });

        return NextResponse.json({
          postId,
          likesCount: post.likesCount,
          isLiked: !!remoteLike,
          checkedHandle: checkHandle,
          checkedDomain: checkDomain,
        });
      }

      // No domain = local user
      const localUser = await db.query.users.findFirst({
        where: eq(users.handle, checkHandle),
      });

      if (localUser) {
        const liked = await db.query.likes.findFirst({
          where: and(
            eq(likes.postId, postId),
            eq(likes.userId, localUser.id)
          ),
        });

        return NextResponse.json({
          postId,
          likesCount: post.likesCount,
          isLiked: !!liked,
          checkedHandle: checkHandle,
        });
      }

      return NextResponse.json({
        postId,
        likesCount: post.likesCount,
        isLiked: false,
        checkedHandle: checkHandle,
      });
    }

    // Return general like info
    return NextResponse.json({
      postId,
      likesCount: post.likesCount,
    });
  } catch (error) {
    console.error('[Swarm] Post likes error:', error);
    return NextResponse.json({ error: 'Failed to get likes' }, { status: 500 });
  }
}
