import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { chatConversations, chatMessages, users } from '@/db/schema';
import { requireAuth } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';

/**
 * POST /api/chat/send
 * Store encrypted message (server never decrypts)
 * 
 * Body: {
 *   recipientDid: string,
 *   senderPublicKey: string (base64),
 *   ciphertext: string (base64),
 *   nonce: string (base64),
 *   recipientHandle?: string
 * }
 */
export async function POST(request: NextRequest) {
    try {
        const user = await requireAuth();

        const body = await request.json();
        const { recipientDid, senderPublicKey, ciphertext, nonce, recipientHandle } = body;

        if (!recipientDid || !senderPublicKey || !ciphertext || !nonce) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Check if recipient is local
        const recipientUser = await db.query.users.findFirst({
            where: eq(users.did, recipientDid)
        });

        if (recipientUser) {
            // LOCAL RECIPIENT
            
            // Ensure conversations exist
            let recipientConv = await db.query.chatConversations.findFirst({
                where: and(
                    eq(chatConversations.participant1Id, recipientUser.id),
                    eq(chatConversations.participant2Handle, user.handle)
                )
            });

            if (!recipientConv) {
                const [newConv] = await db.insert(chatConversations).values({
                    participant1Id: recipientUser.id,
                    participant2Handle: user.handle,
                    lastMessageAt: new Date(),
                    lastMessagePreview: '[Encrypted]'
                }).returning();
                recipientConv = newConv;
            }

            let senderConv = await db.query.chatConversations.findFirst({
                where: and(
                    eq(chatConversations.participant1Id, user.id),
                    eq(chatConversations.participant2Handle, recipientUser.handle)
                )
            });

            if (!senderConv) {
                const [newConv] = await db.insert(chatConversations).values({
                    participant1Id: user.id,
                    participant2Handle: recipientUser.handle,
                    lastMessageAt: new Date(),
                    lastMessagePreview: '[Encrypted]'
                }).returning();
                senderConv = newConv;
            }

            // Store encrypted message (libsodium format)
            // Include recipientDid so sender can decrypt their own sent messages
            const messageData = {
                senderPublicKey,
                recipientDid, // Add this so sender knows who to decrypt with
                ciphertext,
                nonce,
            };

            // Create message for recipient
            await db.insert(chatMessages).values({
                conversationId: recipientConv.id,
                senderHandle: user.handle,
                senderDisplayName: user.displayName,
                senderAvatarUrl: user.avatarUrl,
                senderNodeDomain: null,
                senderDid: user.did,
                encryptedContent: JSON.stringify(messageData),
                deliveredAt: new Date(),
            });

            // Create message for sender
            await db.insert(chatMessages).values({
                conversationId: senderConv.id,
                senderHandle: user.handle,
                senderDisplayName: user.displayName,
                senderAvatarUrl: user.avatarUrl,
                senderNodeDomain: null,
                senderDid: user.did,
                encryptedContent: JSON.stringify(messageData),
                deliveredAt: new Date(),
            });

            return NextResponse.json({ success: true });
        } else {
            // REMOTE RECIPIENT - not implemented yet
            return NextResponse.json({ error: 'Remote delivery not yet implemented' }, { status: 501 });
        }

    } catch (error: any) {
        console.error('Send failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}