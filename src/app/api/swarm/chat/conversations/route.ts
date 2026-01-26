/**
 * Swarm Chat Conversations
 * 
 * GET: List all conversations for the current user
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, chatConversations, chatMessages, users } from '@/db';
import { eq, desc, and, isNull, sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ conversations: [] });
    }

    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all conversations for this user
    const conversations = await db.query.chatConversations.findMany({
      where: eq(chatConversations.participant1Id, session.user.id),
      orderBy: [desc(chatConversations.lastMessageAt)],
      with: {
        messages: {
          orderBy: [desc(chatMessages.createdAt)],
          limit: 1,
        },
      },
    });

    // Calculate unread count for each conversation
    const conversationsWithUnread = await Promise.all(
      conversations.map(async (conv) => {
        const unreadCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(chatMessages)
          .where(
            and(
              eq(chatMessages.conversationId, conv.id),
              isNull(chatMessages.readAt),
              sql`${chatMessages.senderHandle} != ${session.user.handle}`
            )
          );

        // Parse participant info
        const participant2Handle = conv.participant2Handle;
        const isRemote = participant2Handle.includes('@');
        
        let participant2Info = {
          handle: participant2Handle,
          displayName: participant2Handle,
          avatarUrl: null as string | null,
        };

        // Try to get cached user info
        const cachedUser = await db.query.users.findFirst({
          where: eq(users.handle, participant2Handle),
        });

        if (cachedUser) {
          participant2Info = {
            handle: cachedUser.handle,
            displayName: cachedUser.displayName || cachedUser.handle,
            avatarUrl: cachedUser.avatarUrl,
          };
        }

        return {
          ...conv,
          participant2: participant2Info,
          unreadCount: Number(unreadCount[0]?.count || 0),
        };
      })
    );

    return NextResponse.json({
      conversations: conversationsWithUnread,
    });
  } catch (error) {
    console.error('List conversations error:', error);
    return NextResponse.json({ error: 'Failed to list conversations' }, { status: 500 });
  }
}
