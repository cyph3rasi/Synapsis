/**
 * Swarm Follow Endpoint
 * 
 * POST: Receive a follow from another swarm node
 * 
 * This enables swarm-native follows between Synapsis nodes
 * with instant delivery and real-time updates.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, users, notifications, remoteFollowers } from '@/db';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const swarmFollowSchema = z.object({
  targetHandle: z.string(),
  follow: z.object({
    followerHandle: z.string(),
    followerDisplayName: z.string(),
    followerAvatarUrl: z.string().optional(),
    followerBio: z.string().optional(),
    followerNodeDomain: z.string(),
    interactionId: z.string(),
    timestamp: z.string(),
  }),
});

/**
 * POST /api/swarm/interactions/follow
 * 
 * Receives a follow from another swarm node.
 */
export async function POST(request: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const body = await request.json();
    const data = swarmFollowSchema.parse(body);

    // Find the target user (local user being followed)
    const targetUser = await db.query.users.findFirst({
      where: eq(users.handle, data.targetHandle.toLowerCase()),
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (targetUser.isSuspended) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Construct the remote follower's actor URL (swarm-style)
    const actorUrl = `swarm://${data.follow.followerNodeDomain}/${data.follow.followerHandle}`;
    const inboxUrl = `https://${data.follow.followerNodeDomain}/api/swarm/interactions/inbox`;

    // Check if this follow already exists
    const existingFollow = await db.query.remoteFollowers.findFirst({
      where: and(
        eq(remoteFollowers.userId, targetUser.id),
        eq(remoteFollowers.actorUrl, actorUrl)
      ),
    });

    if (existingFollow) {
      return NextResponse.json({
        success: true,
        message: 'Already following',
      });
    }

    // Create the remote follower record
    await db.insert(remoteFollowers).values({
      userId: targetUser.id,
      actorUrl,
      inboxUrl,
      handle: `${data.follow.followerHandle}@${data.follow.followerNodeDomain}`,
      activityId: data.follow.interactionId,
    });

    // Update follower count
    await db.update(users)
      .set({ followersCount: targetUser.followersCount + 1 })
      .where(eq(users.id, targetUser.id));

    // Create notification with actor info stored directly
    try {
      await db.insert(notifications).values({
        userId: targetUser.id,
        actorHandle: data.follow.followerHandle,
        actorDisplayName: data.follow.followerDisplayName,
        actorAvatarUrl: data.follow.followerAvatarUrl || null,
        actorNodeDomain: data.follow.followerNodeDomain,
        type: 'follow',
      });
      console.log(`[Swarm] Created follow notification for @${data.targetHandle} from ${data.follow.followerHandle}@${data.follow.followerNodeDomain}`);
    } catch (notifError) {
      console.error(`[Swarm] Failed to create notification:`, notifError);
    }

    // Also notify bot owner if this is a bot being followed
    if (targetUser.isBot && targetUser.botOwnerId) {
      try {
        await db.insert(notifications).values({
          userId: targetUser.botOwnerId,
          actorHandle: data.follow.followerHandle,
          actorDisplayName: data.follow.followerDisplayName,
          actorAvatarUrl: data.follow.followerAvatarUrl || null,
          actorNodeDomain: data.follow.followerNodeDomain,
          type: 'follow',
        });
      } catch (err) {
        console.error('[Swarm] Failed to notify bot owner:', err);
      }
    }

    console.log(`[Swarm] Received follow from ${data.follow.followerHandle}@${data.follow.followerNodeDomain} for @${data.targetHandle}`);

    return NextResponse.json({
      success: true,
      message: 'Follow received',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.issues }, { status: 400 });
    }
    console.error('[Swarm] Follow error:', error);
    return NextResponse.json({ error: 'Failed to process follow' }, { status: 500 });
  }
}
