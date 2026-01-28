/**
 * Swarm Chat Inbox
 * 
 * POST: Receives chat messages from other swarm nodes
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, users, chatConversations, chatMessages } from '@/db';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import type { SwarmChatMessagePayload } from '@/lib/swarm/chat-types';

const chatMessageSchema = z.object({
  messageId: z.string(),
  senderHandle: z.string(),
  senderDisplayName: z.string().optional(),
  senderAvatarUrl: z.string().optional(),
  senderNodeDomain: z.string(),
  recipientHandle: z.string(),
  encryptedContent: z.string(),
  timestamp: z.string(),
  signature: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const body = await request.json();
    console.log('[Swarm Inbox] Received body keys:', Object.keys(body), 'action:', body.action);
    
    // Check if this is a V2 encrypted envelope (has 'action' and 'data' fields)
    // MUST check BEFORE Zod validation to avoid validation errors
    if (body.action === 'chat.deliver' && body.data) {
      // V2 E2EE Message - store in chatInbox
      const { recipientDid, recipientDeviceId, ciphertext } = body.data;
      
      if (!recipientDid || !ciphertext) {
        return NextResponse.json({ error: 'Invalid V2 payload' }, { status: 400 });
      }

      // Find recipient by DID
      const recipient = await db.query.users.findFirst({
        where: eq(users.did, recipientDid)
      });

      if (!recipient) {
        return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
      }

      // Import chatInbox schema
      const { chatInbox } = await import('@/db/schema');
      
      // Store in V2 inbox
      await db.insert(chatInbox).values({
        senderDid: body.did, // From signed envelope
        recipientDid,
        recipientDeviceId: recipientDeviceId || null,
        envelope: JSON.stringify(body),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });

      console.log(`[Swarm Chat V2] Received encrypted message for ${recipientDid}`);

      return NextResponse.json({
        success: true,
        message: 'V2 message received',
        version: 2
      });
    }
    
    // V1 Legacy Message Format - validate with Zod
    const data = chatMessageSchema.parse(body) as SwarmChatMessagePayload;

    // Find the recipient (local user)
    const recipient = await db.query.users.findFirst({
      where: eq(users.handle, data.recipientHandle.toLowerCase()),
    });

    if (!recipient) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
    }

    if (recipient.isSuspended) {
      return NextResponse.json({ error: 'Recipient not available' }, { status: 404 });
    }

    // Check if message already exists (prevent duplicates)
    const swarmMessageId = `swarm:${data.senderNodeDomain}:${data.messageId}`;
    const existingMessage = await db.query.chatMessages.findFirst({
      where: eq(chatMessages.swarmMessageId, swarmMessageId),
    });

    if (existingMessage) {
      return NextResponse.json({
        success: true,
        message: 'Message already received',
      });
    }

    // Get or create conversation
    const senderFullHandle = `${data.senderHandle}@${data.senderNodeDomain}`;
    let conversation = await db.query.chatConversations.findFirst({
      where: and(
        eq(chatConversations.participant1Id, recipient.id),
        eq(chatConversations.participant2Handle, senderFullHandle)
      ),
    });

    if (!conversation) {
      const [newConversation] = await db.insert(chatConversations).values({
        participant1Id: recipient.id,
        participant2Handle: senderFullHandle,
        lastMessageAt: new Date(data.timestamp),
        lastMessagePreview: '[Encrypted message]',
      }).returning();
      conversation = newConversation;
    }

    // Store the message
    const [newMessage] = await db.insert(chatMessages).values({
      conversationId: conversation.id,
      senderHandle: senderFullHandle,
      senderDisplayName: data.senderDisplayName,
      senderAvatarUrl: data.senderAvatarUrl,
      senderNodeDomain: data.senderNodeDomain,
      encryptedContent: data.encryptedContent,
      swarmMessageId,
      deliveredAt: new Date(),
      createdAt: new Date(data.timestamp),
    }).returning();

    // Update conversation last message
    await db.update(chatConversations)
      .set({
        lastMessageAt: new Date(data.timestamp),
        lastMessagePreview: '[Encrypted message]',
        updatedAt: new Date(),
      })
      .where(eq(chatConversations.id, conversation.id));

    console.log(`[Swarm Chat] Received message from ${senderFullHandle} to ${data.recipientHandle}`);

    return NextResponse.json({
      success: true,
      message: 'Message received',
      messageId: newMessage.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid payload', details: error.issues }, { status: 400 });
    }
    console.error('Swarm chat inbox error:', error);
    return NextResponse.json({ error: 'Failed to receive message' }, { status: 500 });
  }
}
