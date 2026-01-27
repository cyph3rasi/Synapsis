/**
 * Swarm Chat Messages
 * 
 * GET: Get messages for a conversation
 * PATCH: Mark messages as read
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, chatConversations, chatMessages, users } from '@/db';
import { eq, desc, and, lt, isNull } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { decryptMessage } from '@/lib/swarm/chat-crypto';

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

    // Get user's private key for decryption
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user?.privateKeyEncrypted) {
      return NextResponse.json({ error: 'Cannot decrypt messages' }, { status: 500 });
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

    // Decrypt messages
    // Note: In production, you'd decrypt the private key first using a user password/session key
    // For now, we'll return encrypted content and decrypt client-side
    const messagesWithDecryption = messages.map((msg) => {
      const isSentByMe = msg.senderHandle === session.user.handle;
      
      return {
        ...msg,
        // Only include encrypted content - client will decrypt
        content: undefined, // Remove plaintext
        isSentByMe,
      };
    });

    return NextResponse.json({
      messages: messagesWithDecryption.reverse(), // Oldest first for display
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
