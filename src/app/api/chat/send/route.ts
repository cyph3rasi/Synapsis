import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { chatConversations, chatMessages, users, handleRegistry } from '@/db/schema';
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
            // REMOTE RECIPIENT
            const { handleRegistry } = await import('@/db/schema'); // dynamic import or add to top

            // 1. Resolve recipient node
            const registryEntry = await db.query.handleRegistry.findFirst({
                where: eq(handleRegistry.did, recipientDid)
            });

            if (!registryEntry) {
                console.error('Recipient DID not found in registry:', recipientDid);
                return NextResponse.json({ error: 'Recipient not found in registry' }, { status: 404 });
            }

            const targetDomain = registryEntry.nodeDomain;
            // Ensure handle is fully qualified for remote users
            let targetHandle = registryEntry.handle;
            if (!targetHandle.includes('@') && targetDomain) {
                targetHandle = `${targetHandle}@${targetDomain}`;
            }

            console.log(`[Remote Send] Sending to ${targetHandle} at ${targetDomain}`);

            // 2. Prepare Payload
            const messageData = {
                senderPublicKey,
                recipientDid,
                ciphertext,
                nonce,
            };
            const encryptedContent = JSON.stringify(messageData);

            const payload = {
                senderDid: user.did,
                senderHandle: user.handle,
                senderDisplayName: user.displayName,
                senderAvatarUrl: user.avatarUrl,
                senderNodeDomain: process.env.NEXT_PUBLIC_NODE_DOMAIN || 'dev.syn.quest', // Current node domain
                recipientDid,
                encryptedContent,
                sentAt: new Date().toISOString()
            };

            // 3. Send to Remote Node
            try {
                const protocol = targetDomain.includes('localhost') ? 'http' : 'https';
                const res = await fetch(`${protocol}://${targetDomain}/api/chat/receive`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) {
                    const errText = await res.text();
                    console.error('Remote node rejected chat:', errText);
                    return NextResponse.json({ error: `Remote delivery failed: ${res.statusText}` }, { status: 502 });
                }
            } catch (err: any) {
                console.error('Failed to contact remote node:', err);
                return NextResponse.json({ error: 'Failed to contact remote node' }, { status: 504 });
            }

            // 4. Store "Sent" copy locally
            // Ensure conversation exists locally
            let senderConv = await db.query.chatConversations.findFirst({
                where: and(
                    eq(chatConversations.participant1Id, user.id),
                    eq(chatConversations.participant2Handle, targetHandle)
                )
            });

            if (!senderConv) {
                const [newConv] = await db.insert(chatConversations).values({
                    participant1Id: user.id,
                    participant2Handle: targetHandle,
                    lastMessageAt: new Date(),
                    lastMessagePreview: '[Encrypted]'
                }).returning();
                senderConv = newConv;
            }

            await db.insert(chatMessages).values({
                conversationId: senderConv.id,
                senderHandle: user.handle,
                senderDisplayName: user.displayName,
                senderAvatarUrl: user.avatarUrl,
                senderNodeDomain: null, // It's ME, so null
                senderDid: user.did,
                encryptedContent: encryptedContent,
                deliveredAt: new Date(),
            });

            return NextResponse.json({ success: true });
        }

    } catch (error: any) {
        console.error('Send failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}