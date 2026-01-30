/**
 * Swarm Chat Messages
 * 
 * GET: Get messages for a conversation
 * PATCH: Mark messages as read
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, chatConversations, chatMessages, users } from '@/db';
import { eq, desc, and, lt, isNull, sql, inArray } from 'drizzle-orm';
import { getSession } from '@/lib/auth';


export async function GET(request: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ messages: [] });
    }

    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');
    const cursor = searchParams.get('cursor'); // For pagination
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
    }

    // Verify user has access to this conversation
    const conversation = await db.query.chatConversations.findFirst({
      where: and(
        eq(chatConversations.id, conversationId),
        eq(chatConversations.participant1Id, session.user.id)
      ),
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Build query with cursor-based pagination
    const baseCondition = eq(chatMessages.conversationId, conversationId);
    const whereCondition = cursor
      ? and(baseCondition, lt(chatMessages.createdAt, new Date(cursor)))!
      : baseCondition;

    // Get messages
    const messages = await db.query.chatMessages.findMany({
      where: whereCondition,
      orderBy: [desc(chatMessages.createdAt)],
      limit,
    });



    // Collect all unique sender DIDs/Handles
    const senderDids = new Set<string>();
    const senderHandles = new Set<string>(); // Fallback

    messages.forEach(m => {
      if (m.senderDid) senderDids.add(m.senderDid);
      else if (m.senderHandle) senderHandles.add(m.senderHandle);
    });

    // Fetch users
    const usersByDid: Record<string, any> = {};
    const usersByHandle: Record<string, any> = {};

    if (senderDids.size > 0) {
      const found = await db.query.users.findMany({
        where: inArray(users.did, Array.from(senderDids))
      });
      found.forEach(u => usersByDid[u.did] = u);
    }

    // Also fetch local users by handle if needed
    if (senderHandles.size > 0) {
      const found = await db.query.users.findMany({
        where: inArray(users.handle, Array.from(senderHandles))
      });
      found.forEach(u => usersByHandle[u.handle] = u);
    }

    const messagesMapped = messages.map((msg) => {
      const isSentByMe = msg.senderHandle === session.user.handle;

      // Resolve fresh user data
      const user = msg.senderDid ? usersByDid[msg.senderDid] : usersByHandle[msg.senderHandle];

      const displayName = user?.displayName || msg.senderDisplayName || msg.senderHandle;
      const avatarUrl = user?.avatarUrl || msg.senderAvatarUrl;

      return {
        id: msg.id,
        senderHandle: msg.senderHandle,
        senderDisplayName: displayName,
        senderAvatarUrl: avatarUrl,
        senderDid: msg.senderDid,
        content: msg.content,
        deliveredAt: msg.deliveredAt,
        readAt: msg.readAt,
        createdAt: msg.createdAt,
        isSentByMe,
      };
    });

    return NextResponse.json({
      messages: messagesMapped.reverse(), // Oldest first for display
      nextCursor: messages.length === limit ? messages[messages.length - 1].createdAt.toISOString() : null,
    });
  } catch (error) {
    console.error('Get messages error:', error);
    return NextResponse.json({ error: 'Failed to get messages' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId } = await request.json();

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
    }

    // Verify user has access to this conversation
    const conversation = await db.query.chatConversations.findFirst({
      where: and(
        eq(chatConversations.id, conversationId),
        eq(chatConversations.participant1Id, session.user.id)
      ),
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Mark all unread messages as read
    await db.update(chatMessages)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(chatMessages.conversationId, conversationId),
          isNull(chatMessages.readAt)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Mark as read error:', error);
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 });
  }
}
