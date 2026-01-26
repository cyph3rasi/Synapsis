/**
 * Swarm Chat Send
 * 
 * POST: Send a chat message to another user (local or remote)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, users, chatConversations, chatMessages } from '@/db';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { encryptMessage } from '@/lib/swarm/chat-crypto';
import type { SwarmChatMessagePayload } from '@/lib/swarm/chat-types';

const sendMessageSchema = z.object({
  recipientHandle: z.string(),
  content: z.string().min(1).max(5000),
});

export async function POST(request: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = sendMessageSchema.parse(body);

    // Get sender info
    const sender = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!sender) {
      return NextResponse.json({ error: 'Sender not found' }, { status: 404 });
    }

    // Parse recipient handle (could be local or remote)
    const recipientHandle = data.recipientHandle.toLowerCase();
    const isRemote = recipientHandle.includes('@');
    
    let recipientUser: typeof users.$inferSelect | undefined;
    let recipientPublicKey: string;
    let recipientNodeDomain: string | null = null;

    if (isRemote) {
      // Remote user - need to fetch their public key
      const [handle, domain] = recipientHandle.split('@');
      recipientNodeDomain = domain;

      // Try to find cached remote user
      recipientUser = await db.query.users.findFirst({
        where: eq(users.handle, recipientHandle),
      });

      if (!recipientUser) {
        // Fetch from remote node
        try {
          const protocol = domain.includes('localhost') ? 'http' : 'https';
          const response = await fetch(`${protocol}://${domain}/api/users/${handle}`);
          
          if (!response.ok) {
            return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
          }

          const remoteUserData = await response.json();
          recipientPublicKey = remoteUserData.publicKey;

          // Cache the remote user
          const [newUser] = await db.insert(users).values({
            did: remoteUserData.did || `did:swarm:${domain}:${handle}`,
            handle: recipientHandle,
            displayName: remoteUserData.displayName,
            avatarUrl: remoteUserData.avatarUrl,
            publicKey: recipientPublicKey,
          }).returning();
          recipientUser = newUser;
        } catch (error) {
          console.error('Failed to fetch remote user:', error);
          return NextResponse.json({ error: 'Failed to reach recipient node' }, { status: 503 });
        }
      } else {
        recipientPublicKey = recipientUser.publicKey;
      }
    } else {
      // Local user
      recipientUser = await db.query.users.findFirst({
        where: eq(users.handle, recipientHandle),
      });

      if (!recipientUser) {
        return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
      }

      if (recipientUser.isSuspended) {
        return NextResponse.json({ error: 'Recipient not available' }, { status: 404 });
      }

      recipientPublicKey = recipientUser.publicKey;
    }

    // Encrypt the message with recipient's public key
    const encryptedContent = encryptMessage(data.content, recipientPublicKey);

    // Get or create conversation
    let conversation = await db.query.chatConversations.findFirst({
      where: and(
        eq(chatConversations.participant1Id, sender.id),
        eq(chatConversations.participant2Handle, recipientHandle)
      ),
    });

    if (!conversation) {
      const [newConversation] = await db.insert(chatConversations).values({
        participant1Id: sender.id,
        participant2Handle: recipientHandle,
        lastMessageAt: new Date(),
        lastMessagePreview: data.content.substring(0, 100),
      }).returning();
      conversation = newConversation;
    }

    // Store the message locally
    const messageId = crypto.randomUUID();
    const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost';
    const swarmMessageId = `swarm:${nodeDomain}:${messageId}`;

    const [newMessage] = await db.insert(chatMessages).values({
      conversationId: conversation.id,
      senderHandle: sender.handle,
      senderDisplayName: sender.displayName,
      senderAvatarUrl: sender.avatarUrl,
      senderNodeDomain: null, // Local sender
      encryptedContent,
      swarmMessageId,
      deliveredAt: isRemote ? null : new Date(), // Delivered immediately if local
      readAt: null,
    }).returning();

    // Update conversation
    await db.update(chatConversations)
      .set({
        lastMessageAt: new Date(),
        lastMessagePreview: data.content.substring(0, 100),
        updatedAt: new Date(),
      })
      .where(eq(chatConversations.id, conversation.id));

    // If remote, send to their node
    if (isRemote && recipientNodeDomain) {
      try {
        const payload: SwarmChatMessagePayload = {
          messageId,
          senderHandle: sender.handle,
          senderDisplayName: sender.displayName || undefined,
          senderAvatarUrl: sender.avatarUrl || undefined,
          senderNodeDomain: nodeDomain,
          recipientHandle: recipientHandle.split('@')[0],
          encryptedContent,
          timestamp: new Date().toISOString(),
        };

        const protocol = recipientNodeDomain.includes('localhost') ? 'http' : 'https';
        const response = await fetch(`${protocol}://${recipientNodeDomain}/api/swarm/chat/inbox`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          // Mark as delivered
          await db.update(chatMessages)
            .set({ deliveredAt: new Date() })
            .where(eq(chatMessages.id, newMessage.id));
        }
      } catch (error) {
        console.error('Failed to send message to remote node:', error);
        // Message is still stored locally, will show as undelivered
      }
    }

    return NextResponse.json({
      success: true,
      message: newMessage,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Send message error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
