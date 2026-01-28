
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { chatConversations, chatMessages, users } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * POST /api/chat/receive
 * Endpoint for receiving federated chat messages from other nodes.
 * 
 * Body: {
 *   senderDid: string,
 *   senderHandle: string, // user@domain
 *   senderDisplayName: string,
 *   senderAvatarUrl: string,
 *   senderNodeDomain: string,
 *   recipientDid: string,
 *   encryptedContent: string (base64 JSON of {senderPublicKey, ciphertext, nonce, recipientDid}),
 *   sentAt: string (ISO date)
 * }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            senderDid,
            senderHandle,
            senderDisplayName,
            senderAvatarUrl,
            senderNodeDomain,
            recipientDid,
            encryptedContent
        } = body;

        // Basic validation
        if (!senderDid || !senderHandle || !recipientDid || !encryptedContent || !senderNodeDomain) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // 1. Find local recipient
        const recipientUser = await db.query.users.findFirst({
            where: eq(users.did, recipientDid)
        });

        if (!recipientUser) {
            return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
        }

        // 2. Find or Create Conversation
        // For the RECIPIENT, the conversation is with the SENDER (Remote)
        let conversation = await db.query.chatConversations.findFirst({
            where: and(
                eq(chatConversations.participant1Id, recipientUser.id),
                eq(chatConversations.participant2Handle, senderHandle)
            )
        });

        if (!conversation) {
            const [newConv] = await db.insert(chatConversations).values({
                participant1Id: recipientUser.id,
                participant2Handle: senderHandle,
                lastMessageAt: new Date(),
                lastMessagePreview: '[Encrypted Message]'
            }).returning();
            conversation = newConv;
        }

        // 3. Store Message
        await db.insert(chatMessages).values({
            conversationId: conversation.id,
            senderHandle: senderHandle,
            senderDisplayName: senderDisplayName || senderHandle,
            senderAvatarUrl: senderAvatarUrl,
            senderNodeDomain: senderNodeDomain,
            senderDid: senderDid,
            encryptedContent: encryptedContent,
            deliveredAt: new Date(),
        });

        // 4. Update conversation timestamp
        await db.update(chatConversations)
            .set({
                lastMessageAt: new Date(),
                lastMessagePreview: '[Encrypted Message]'
            })
            .where(eq(chatConversations.id, conversation.id));

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Federated Receive Failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
