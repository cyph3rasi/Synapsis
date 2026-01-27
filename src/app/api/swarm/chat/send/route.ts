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
  // For E2E encryption: client sends pre-encrypted content
  encryptedContent: z.string().optional(),
  senderPublicKey: z.string().optional(), // ECDH public key for decryption
  // Legacy: server-side encryption (will be removed)
  content: z.string().min(1).max(5000).optional(),
}).refine(data => data.encryptedContent || data.content, {
  message: 'Either encryptedContent or content is required',
});

export async function POST(request: NextRequest) {
  console.log('[Chat Send] Starting request processing');
  try {
    if (!db) {
      console.error('[Chat Send] Database connection missing');
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const session = await getSession();
    if (!session?.user) {
      console.warn('[Chat Send] Unauthorized attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('[Chat Send] User authenticated:', session.user.id);

    let body;
    try {
      body = await request.json();
    } catch (e) {
      console.error('[Chat Send] Failed to parse JSON body');
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parseResult = sendMessageSchema.safeParse(body);
    if (!parseResult.success) {
      console.error('[Chat Send] Schema validation failed:', parseResult.error);
      return NextResponse.json({ error: 'Invalid input', details: parseResult.error.issues }, { status: 400 });
    }
    const data = parseResult.data;
    console.log('[Chat Send] Input validated. Recipient:', data.recipientHandle, 'Has senderPublicKey:', !!data.senderPublicKey);

    // Get sender info
    const sender = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!sender) {
      console.error('[Chat Send] Sender not found in DB:', session.user.id);
      return NextResponse.json({ error: 'Sender not found' }, { status: 404 });
    }
    console.log('[Chat Send] Sender retrieved:', sender.handle);

    // Parse recipient handle (could be local or remote)
    // Strip leading @ if present, then normalize
    const recipientHandle = data.recipientHandle.toLowerCase().replace(/^@/, '');
    const isRemote = recipientHandle.includes('@');

    let recipientUser: typeof users.$inferSelect | undefined;
    let recipientPublicKey: string;
    let recipientNodeDomain: string | null = null;

    if (isRemote) {
      // Remote user - need to fetch their public key
      // Format: handle@domain (e.g., matterbator@batorbros.bond)
      const atIndex = recipientHandle.indexOf('@');
      const handle = recipientHandle.substring(0, atIndex);
      const domain = recipientHandle.substring(atIndex + 1);
      recipientNodeDomain = domain;
      console.log('[Chat Send] Processing remote recipient:', handle, '@', domain);

      // Try to find cached remote user
      recipientUser = await db.query.users.findFirst({
        where: eq(users.handle, recipientHandle),
      });

      // Check if we have a valid public key (not a placeholder)
      const hasValidPublicKey = recipientUser?.publicKey?.startsWith('-----BEGIN');
      
      if (!recipientUser || !hasValidPublicKey) {
        // Fetch from remote node to get the real public key
        try {
          console.log('[Chat Send] Fetching remote user from node:', domain);
          const protocol = domain.includes('localhost') ? 'http' : 'https';
          const response = await fetch(`${protocol}://${domain}/api/users/${handle}`);

          if (!response.ok) {
            console.error('[Chat Send] Remote user fetch failed. Status:', response.status);
            return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
          }

          const remoteUserData = await response.json();
          const userData = remoteUserData.user || remoteUserData;
          recipientPublicKey = userData.publicKey;
          
          if (!recipientPublicKey || !recipientPublicKey.startsWith('-----BEGIN')) {
            console.error('[Chat Send] Remote user has no valid public key');
            return NextResponse.json({ error: 'Recipient does not support encrypted chat' }, { status: 400 });
          }

          if (recipientUser) {
            // Update existing cached user with real public key
            await db.update(users)
              .set({ publicKey: recipientPublicKey })
              .where(eq(users.id, recipientUser.id));
            console.log('[Chat Send] Updated cached user with real public key');
          } else {
            // Cache the remote user
            const [newUser] = await db.insert(users).values({
              did: userData.did || `did:swarm:${domain}:${handle}`,
              handle: recipientHandle,
              displayName: userData.displayName,
              avatarUrl: userData.avatarUrl,
              publicKey: recipientPublicKey,
            }).returning();
            recipientUser = newUser;
            console.log('[Chat Send] Remote user cached');
          }
        } catch (error) {
          console.error('[Chat Send] Failed to fetch remote user:', error);
          return NextResponse.json({ error: 'Failed to reach recipient node' }, { status: 503 });
        }
      } else {
        recipientPublicKey = recipientUser.publicKey;
        console.log('[Chat Send] Remote user found in cache with valid key');
      }
    } else {
      // Local user
      console.log('[Chat Send] Processing local recipient');
      recipientUser = await db.query.users.findFirst({
        where: eq(users.handle, recipientHandle),
      });

      if (!recipientUser) {
        console.warn('[Chat Send] Local recipient not found:', recipientHandle);
        return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
      }

      if (recipientUser.isSuspended) {
        console.warn('[Chat Send] Local recipient suspended:', recipientHandle);
        return NextResponse.json({ error: 'Recipient not available' }, { status: 404 });
      }

      recipientPublicKey = recipientUser.publicKey;
    }

    // Handle encryption - either client-side (E2E) or server-side (legacy)
    let encryptedContent: string;
    let senderEncryptedContent: string | null = null;
    
    if (data.encryptedContent) {
      // E2E mode: client already encrypted the message
      // Server cannot read the content - this is true E2E encryption
      console.log('[Chat Send] Using client-side E2E encryption');
      encryptedContent = data.encryptedContent;
      // Store sender's public key so recipient can decrypt
      // Note: senderEncryptedContent not needed in E2E mode - client stores locally
    } else if (data.content) {
      // Legacy mode: server-side encryption (for backwards compatibility)
      console.log('[Chat Send] Using server-side encryption (legacy)');
      try {
        encryptedContent = encryptMessage(data.content, recipientPublicKey);
        senderEncryptedContent = encryptMessage(data.content, sender.publicKey);
      } catch (encError) {
        console.error('[Chat Send] Encryption failed:', encError);
        return NextResponse.json({ error: 'Encryption failed' }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: 'No message content provided' }, { status: 400 });
    }

    // Get or create conversation
    let conversation = await db.query.chatConversations.findFirst({
      where: and(
        eq(chatConversations.participant1Id, sender.id),
        eq(chatConversations.participant2Handle, recipientHandle)
      ),
    });

    if (!conversation) {
      console.log('[Chat Send] Creating new conversation');
      const [newConversation] = await db.insert(chatConversations).values({
        participant1Id: sender.id,
        participant2Handle: recipientHandle,
        lastMessageAt: new Date(),
        lastMessagePreview: 'New message',
      }).returning();
      conversation = newConversation;
    }

    // Store the message locally
    const messageId = crypto.randomUUID();
    const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost';
    const swarmMessageId = `swarm:${nodeDomain}:${messageId}`;

    console.log('[Chat Send] Inserting message into DB, senderPublicKey from client:', !!data.senderPublicKey, 'from DB:', !!sender.chatPublicKey);
    const [newMessage] = await db.insert(chatMessages).values({
      conversationId: conversation.id,
      senderHandle: sender.handle,
      senderDisplayName: sender.displayName,
      senderAvatarUrl: sender.avatarUrl,
      senderNodeDomain: null, // Local sender
      encryptedContent,
      senderEncryptedContent,
      // Use client-provided key first, fall back to database
      senderChatPublicKey: data.senderPublicKey || sender.chatPublicKey,
      swarmMessageId,
      deliveredAt: isRemote ? null : new Date(), // Delivered immediately if local
      readAt: null,
    }).returning();

    // Update conversation
    await db.update(chatConversations)
      .set({
        lastMessageAt: new Date(),
        lastMessagePreview: 'New message',
        updatedAt: new Date(),
      })
      .where(eq(chatConversations.id, conversation.id));

    // For LOCAL recipients, create/update their conversation too
    if (!isRemote && recipientUser) {
      try {
        console.log('[Chat Send] Creating reciprocal conversation for local recipient:', recipientUser.handle);
        
        // Check if recipient has a conversation with sender
        let recipientConversation = await db.query.chatConversations.findFirst({
          where: and(
            eq(chatConversations.participant1Id, recipientUser.id),
            eq(chatConversations.participant2Handle, sender.handle)
          ),
        });

        if (!recipientConversation) {
          // Create conversation for recipient
          const [newRecipientConv] = await db.insert(chatConversations).values({
            participant1Id: recipientUser.id,
            participant2Handle: sender.handle,
            lastMessageAt: new Date(),
            lastMessagePreview: 'New message',
          }).returning();
          recipientConversation = newRecipientConv;
          console.log('[Chat Send] Created new conversation for recipient');
        } else {
          // Update existing conversation
          await db.update(chatConversations)
            .set({
              lastMessageAt: new Date(),
              lastMessagePreview: 'New message',
              updatedAt: new Date(),
            })
            .where(eq(chatConversations.id, recipientConversation.id));
          console.log('[Chat Send] Updated existing conversation for recipient');
        }

        // Insert message into recipient's conversation
        await db.insert(chatMessages).values({
          conversationId: recipientConversation.id,
          senderHandle: sender.handle,
          senderDisplayName: sender.displayName,
          senderAvatarUrl: sender.avatarUrl,
          senderNodeDomain: null,
          encryptedContent,
          senderEncryptedContent,
          senderChatPublicKey: data.senderPublicKey || sender.chatPublicKey,
          swarmMessageId: `${swarmMessageId}-recipient`, // Make it unique for recipient's copy
          deliveredAt: new Date(),
          readAt: null,
        });
        
        console.log('[Chat Send] Reciprocal message created for local recipient');
      } catch (recipError) {
        console.error('[Chat Send] Failed to create reciprocal conversation:', recipError);
        // Don't fail the whole request - sender's message was still saved
      }
    }

    // If remote, send to their node
    if (isRemote && recipientNodeDomain) {
      // ... (remote logic remains similar but add logs)
      console.log('[Chat Send] Dispatching to remote node:', recipientNodeDomain);
      // ... existing remote send logic ...
      // For brevity in this tool call, I'm keeping the original logic mostly intact but wrapped/logged.
      // Re-implementing the block:
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
          console.log('[Chat Send] Remote delivery confirmed');
        } else {
          console.warn('[Chat Send] Remote delivery failed. Status:', response.status);
        }
      } catch (error) {
        console.error('[Chat Send] Failed to send message to remote node:', error);
        // Message is still stored locally, will show as undelivered
      }
    }

    console.log('[Chat Send] Success');
    return NextResponse.json({
      success: true,
      message: newMessage,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Should be caught by safeParse above, but just in case
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    console.error('[Chat Send] Unhandled error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
