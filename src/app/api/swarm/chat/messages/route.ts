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

    // Get recipient info for sent messages
    const recipientHandle = conversation.participant2Handle;
    let recipientPublicKey: string | null = null;
    
    console.log('[Messages API] Fetching recipient key for:', recipientHandle);
    
    // Check if this is a remote user (has @domain)
    const isRemote = recipientHandle.includes('@');
    
    if (isRemote) {
      // Remote user - fetch from their node
      const [handle, domain] = recipientHandle.split('@');
      try {
        const protocol = domain.includes('localhost') ? 'http' : 'https';
        const response = await fetch(`${protocol}://${domain}/api/users/${handle}`);
        if (response.ok) {
          const data = await response.json();
          recipientPublicKey = data.user?.chatPublicKey || null;
          console.log('[Messages API] Fetched remote recipient key:', !!recipientPublicKey);
        }
      } catch (error) {
        console.error('[Messages API] Failed to fetch remote recipient key:', error);
      }
    } else {
      // Local user
      const recipientUser = await db.query.users.findFirst({
        where: eq(users.handle, recipientHandle),
      });
      recipientPublicKey = recipientUser?.chatPublicKey || null;
    }
    
    console.log('[Messages API] Recipient public key found:', !!recipientPublicKey);

    // Get sender DID for received messages
    const senderDids = new Map<string, string>();
    for (const msg of messages) {
      const isSentByMe = msg.senderHandle === session.user.handle;
      if (!isSentByMe && !senderDids.has(msg.senderHandle)) {
        // Try to get DID for this sender
        try {
          const isRemote = msg.senderHandle.includes('@');
          if (isRemote) {
            const [handle, domain] = msg.senderHandle.split('@');
            const protocol = domain.includes('localhost') ? 'http' : 'https';
            const response = await fetch(`${protocol}://${domain}/api/users/${handle}`);
            if (response.ok) {
              const data = await response.json();
              if (data.user?.did) {
                senderDids.set(msg.senderHandle, data.user.did);
              }
            }
          } else {
            const senderUser = await db.query.users.findFirst({
              where: eq(users.handle, msg.senderHandle),
            });
            if (senderUser?.did) {
              senderDids.set(msg.senderHandle, senderUser.did);
            }
          }
        } catch (e) {
          console.error('[Messages API] Failed to resolve sender DID:', e);
        }
      }
    }

    const messagesWithDecryption = messages.map((msg) => {
      const isSentByMe = msg.senderHandle === session.user.handle;
      
      const senderPubKey = isSentByMe ? recipientPublicKey : msg.senderChatPublicKey;
      
      console.log('[Messages API] Message:', msg.id, 'isSentByMe:', isSentByMe, 'senderPubKey:', !!senderPubKey, 'msgSenderChatPubKey:', !!msg.senderChatPublicKey);
      
      return {
        id: msg.id,
        senderHandle: msg.senderHandle,
        senderDisplayName: msg.senderDisplayName,
        senderAvatarUrl: msg.senderAvatarUrl,
        senderDid: isSentByMe ? undefined : senderDids.get(msg.senderHandle), // Add DID for received messages
        // For decryption:
        // - Sent messages: need recipient's public key
        // - Received messages: need sender's public key
        senderPublicKey: senderPubKey,
        isE2E: !!msg.senderChatPublicKey || (isSentByMe && !!recipientPublicKey),
        encryptedContent: msg.encryptedContent, // This is now the full envelope JSON
        deliveredAt: msg.deliveredAt,
        readAt: msg.readAt,
        createdAt: msg.createdAt,
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
