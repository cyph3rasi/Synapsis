import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { chatConversations, chatMessages, users, handleRegistry, follows } from '@/db/schema';
import { requireSignedAction } from '@/lib/auth/verify-signature';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const chatSendSchema = z.object({
    recipientDid: z.string(),
    recipientHandle: z.string(),
    content: z.string().min(1).max(5000),
});

/**
 * POST /api/chat/send
 * Send a signed chat message (verified with DID)
 * Stores plain text content.
 */
export async function POST(request: NextRequest) {
    try {
        // Parse the signed action from the request body
        const signedAction = await request.json();

        // Strictly verify the signature and get the user
        const user = await requireSignedAction(signedAction);

        // Extract message data
        const data = chatSendSchema.parse(signedAction.data);
        const { recipientDid, recipientHandle, content } = data;

        // Check if recipient is local
        const recipientUser = await db.query.users.findFirst({
            where: eq(users.did, recipientDid)
        });

        if (recipientUser) {
            // Reject if recipient is a bot
            if (recipientUser.isBot) {
                return NextResponse.json({ error: 'Cannot DM a bot account' }, { status: 400 });
            }

            // Check DM privacy settings
            if (recipientUser.dmPrivacy === 'none') {
                return NextResponse.json({ error: 'This user does not accept direct messages' }, { status: 403 });
            } else if (recipientUser.dmPrivacy === 'following') {
                // Check if recipient follows the sender
                const isFollowingSender = await db.query.follows.findFirst({
                    where: and(
                        eq(follows.followerId, recipientUser.id),
                        eq(follows.followingId, user.id)
                    )
                });
                if (!isFollowingSender) {
                    return NextResponse.json({ error: 'This user only accepts messages from accounts they follow' }, { status: 403 });
                }
            }
            // LOCAL RECIPIENT

            // Ensure conversations exist for both sides
            // 1. Recipient's Inbox (Recipient -> User)
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
                    lastMessagePreview: content.slice(0, 50)
                }).returning();
                recipientConv = newConv;
            } else {
                // Update preview
                await db.update(chatConversations)
                    .set({
                        lastMessageAt: new Date(),
                        lastMessagePreview: content.slice(0, 50),
                        updatedAt: new Date()
                    })
                    .where(eq(chatConversations.id, recipientConv.id));
            }

            // 2. Sender's Sent Box (User -> Recipient)
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
                    lastMessagePreview: content.slice(0, 50)
                }).returning();
                senderConv = newConv;
            } else {
                await db.update(chatConversations)
                    .set({
                        lastMessageAt: new Date(),
                        lastMessagePreview: content.slice(0, 50),
                        updatedAt: new Date()
                    })
                    .where(eq(chatConversations.id, senderConv.id));
            }

            // Create message for recipient (Inbox)
            await db.insert(chatMessages).values({
                conversationId: recipientConv.id,
                senderHandle: user.handle,
                senderDisplayName: user.displayName,
                senderAvatarUrl: user.avatarUrl,
                senderNodeDomain: null,
                senderDid: user.did,
                content: content,
                deliveredAt: new Date(),
            });

            // Create message for sender (Sent)
            await db.insert(chatMessages).values({
                conversationId: senderConv.id,
                senderHandle: user.handle,
                senderDisplayName: user.displayName,
                senderAvatarUrl: user.avatarUrl,
                senderNodeDomain: null,
                senderDid: user.did,
                content: content,
                deliveredAt: new Date(),
                readAt: new Date() // Sender has read their own message
            });

            return NextResponse.json({ success: true });
        } else {
            // REMOTE RECIPIENT

            // 1. Resolve recipient node
            const registryEntry = await db.query.handleRegistry.findFirst({
                where: eq(handleRegistry.did, recipientDid)
            });

            // If not in registry, try to parse from handle if it has domain
            let targetDomain: string | null = registryEntry?.nodeDomain || null;
            let targetHandle = recipientHandle;

            if (!targetDomain && recipientHandle.includes('@')) {
                const parts = recipientHandle.split('@');
                targetDomain = parts[parts.length - 1];
            }

            if (!targetDomain) {
                console.error('Recipient node domain not found for:', recipientHandle);
                return NextResponse.json({ error: 'Recipient node not found' }, { status: 404 });
            }

            console.log(`[Remote Send] Sending to ${targetHandle} at ${targetDomain}`);

            // 2. Send to Remote Node (Forward the Signed Action)
            try {
                const protocol = targetDomain.includes('localhost') ? 'http' : 'https';
                const res = await fetch(`${protocol}://${targetDomain}/api/chat/receive`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(signedAction) // Forward the user's signed intent
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

            // 3. Store "Sent" copy locally
            // Ensure conversation exists locally
            let senderConv = await db.query.chatConversations.findFirst({
                where: and(
                    eq(chatConversations.participant1Id, user.id),
                    eq(chatConversations.participant2Handle, recipientHandle)
                )
            });

            if (!senderConv) {
                const [newConv] = await db.insert(chatConversations).values({
                    participant1Id: user.id,
                    participant2Handle: recipientHandle,
                    lastMessageAt: new Date(),
                    lastMessagePreview: content.slice(0, 50)
                }).returning();
                senderConv = newConv;
            } else {
                await db.update(chatConversations)
                    .set({
                        lastMessageAt: new Date(),
                        lastMessagePreview: content.slice(0, 50),
                        updatedAt: new Date()
                    })
                    .where(eq(chatConversations.id, senderConv.id));
            }

            await db.insert(chatMessages).values({
                conversationId: senderConv.id,
                senderHandle: user.handle,
                senderDisplayName: user.displayName,
                senderAvatarUrl: user.avatarUrl,
                senderNodeDomain: null,
                senderDid: user.did,
                content: content,
                deliveredAt: new Date(),
                readAt: new Date()
            });

            return NextResponse.json({ success: true });
        }

    } catch (error: any) {
        console.error('Send chat failed:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
        }

        return NextResponse.json({ error: error.message || 'Failed to send message' }, { status: 500 });
    }
}