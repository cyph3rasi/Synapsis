/**
 * Bot Owner Notification Helper
 * 
 * When someone interacts with a bot (likes, reposts, follows, mentions),
 * this helper creates a notification for the bot's owner so they can
 * see engagement on their bots.
 */

import { db, notifications, users } from '@/db';
import { eq } from 'drizzle-orm';

export type BotInteractionType = 'like' | 'repost' | 'follow' | 'mention';

/**
 * Check if a user is a bot and get their owner's ID.
 * 
 * @param userId - The user ID to check
 * @returns The bot owner's ID if this is a bot, null otherwise
 */
export async function getBotOwnerId(userId: string): Promise<string | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      isBot: true,
      botOwnerId: true,
    },
  });

  if (user?.isBot && user.botOwnerId) {
    return user.botOwnerId;
  }

  return null;
}

/**
 * Create a notification for a bot's owner when someone interacts with the bot.
 * 
 * This is called in addition to the normal notification (which goes to the bot's
 * user account). The owner gets notified so they can see engagement on their bots.
 * 
 * @param botUserId - The bot's user ID (the one receiving the interaction)
 * @param actorId - The user who performed the interaction
 * @param type - The type of interaction
 * @param postId - Optional post ID (for likes, reposts, mentions)
 * @returns True if a notification was created, false otherwise
 */
export async function notifyBotOwner(
  botUserId: string,
  actorId: string,
  type: BotInteractionType,
  postId?: string
): Promise<boolean> {
  try {
    const ownerId = await getBotOwnerId(botUserId);
    
    if (!ownerId) {
      // Not a bot, no owner to notify
      return false;
    }

    // Don't notify owner if they're the one doing the interaction
    if (ownerId === actorId) {
      return false;
    }

    // Create notification for the bot owner
    await db.insert(notifications).values({
      userId: ownerId,
      actorId,
      postId: postId || null,
      type,
    });

    return true;
  } catch (error) {
    console.error('[BotOwnerNotify] Error creating notification:', error);
    return false;
  }
}

/**
 * Notify bot owner about an interaction on a bot's post.
 * 
 * Checks if the post author is a bot and notifies the owner.
 * 
 * @param postAuthorId - The post author's user ID
 * @param actorId - The user who performed the interaction
 * @param type - The type of interaction (like, repost, mention)
 * @param postId - The post ID
 */
export async function notifyBotOwnerForPost(
  postAuthorId: string,
  actorId: string,
  type: 'like' | 'repost' | 'mention',
  postId: string
): Promise<boolean> {
  return notifyBotOwner(postAuthorId, actorId, type, postId);
}

/**
 * Notify bot owner about a new follower.
 * 
 * @param botUserId - The bot's user ID being followed
 * @param followerId - The user who followed the bot
 */
export async function notifyBotOwnerForFollow(
  botUserId: string,
  followerId: string
): Promise<boolean> {
  return notifyBotOwner(botUserId, followerId, 'follow');
}
