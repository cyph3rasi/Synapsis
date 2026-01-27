import { NextResponse } from 'next/server';
import { db, chatConversations, chatMessages } from '@/db';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's conversations
    const conversations = await db.query.chatConversations.findMany({
      where: eq(chatConversations.participant1Id, session.user.id),
    });

    if (conversations.length === 0) {
      return NextResponse.json({ unreadCount: 0 });
    }

    // Count unread messages across all conversations
    const conversationIds = conversations.map(c => c.id);
    
    const unreadMessages = await db.query.chatMessages.findMany({
      where: and(
        inArray(chatMessages.conversationId, conversationIds),
        isNull(chatMessages.readAt)
      ),
    });

    // Filter out messages sent by the current user
    const unreadCount = unreadMessages.filter(
      msg => msg.senderHandle !== session.user.handle
    ).length;

    return NextResponse.json({ unreadCount });
  } catch (error) {
    console.error('Get unread chat count error:', error);
    return NextResponse.json({ error: 'Failed to get unread count' }, { status: 500 });
  }
}
