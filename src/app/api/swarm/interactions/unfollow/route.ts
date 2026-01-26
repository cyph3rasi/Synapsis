/**
 * Swarm Unfollow Endpoint
 * 
 * POST: Receive an unfollow from another swarm node
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, users, remoteFollowers } from '@/db';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const swarmUnfollowSchema = z.object({
  targetHandle: z.string(),
  unfollow: z.object({
    followerHandle: z.string(),
    followerNodeDomain: z.string(),
    interactionId: z.string(),
    timestamp: z.string(),
  }),
});

/**
 * POST /api/swarm/interactions/unfollow
 * 
 * Receives an unfollow from another swarm node.
 */
export async function POST(request: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const body = await request.json();
    const data = swarmUnfollowSchema.parse(body);

    // Find the target user
    const targetUser = await db.query.users.findFirst({
      where: eq(users.handle, data.targetHandle.toLowerCase()),
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find and remove the remote follower record
    const actorUrl = `swarm://${data.unfollow.followerNodeDomain}/${data.unfollow.followerHandle}`;
    
    const existingFollow = await db.query.remoteFollowers.findFirst({
      where: and(
        eq(remoteFollowers.userId, targetUser.id),
        eq(remoteFollowers.actorUrl, actorUrl)
      ),
    });

    if (!existingFollow) {
      return NextResponse.json({
        success: true,
        message: 'Not following',
      });
    }

    // Remove the follow
    await db.delete(remoteFollowers).where(eq(remoteFollowers.id, existingFollow.id));

    // Update follower count
    await db.update(users)
      .set({ followersCount: Math.max(0, targetUser.followersCount - 1) })
      .where(eq(users.id, targetUser.id));

    console.log(`[Swarm] Received unfollow from ${data.unfollow.followerHandle}@${data.unfollow.followerNodeDomain} for @${data.targetHandle}`);

    return NextResponse.json({
      success: true,
      message: 'Unfollow received',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.issues }, { status: 400 });
    }
    console.error('[Swarm] Unfollow error:', error);
    return NextResponse.json({ error: 'Failed to process unfollow' }, { status: 500 });
  }
}
