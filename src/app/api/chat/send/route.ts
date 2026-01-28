
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { chatInbox, chatConversations, users } from '@/db/schema';
import { requireSignedAction } from '@/lib/auth/verify-signature';
import { eq, and } from 'drizzle-orm';
import { signedFetch } from '@/lib/api/signed-fetch';

/**
 * POST /api/chat/send
 * Deliver an encrypted envelope to a local or remote user's inbox.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // 1. Verify Envelope Signature (Anti-Spoofing & Replay)
        const user = await requireSignedAction(body);

        const { action, data } = body;
        if (action !== 'chat.deliver') {
            return NextResponse.json({ error: 'Invalid action type' }, { status: 400 });
        }

        const { recipientDid, recipientDeviceId, ciphertext, nodeDomain, recipientHandle } = data;

        if (!recipientDid || !ciphertext) {
            return NextResponse.json({ error: 'Missing required delivery fields' }, { status: 400 });
        }

        // 2. Check if recipient is local or remote
        const recipientUser = await db.query.users.findFirst({
            where: eq(users.did, recipientDid)
        });

        if (recipientUser) {
            // LOCAL RECIPIENT - Store in local inbox
            
            // Ensure conversation exists for recipient
            let conversation = await db.query.chatConversations.findFirst({
                where: and(
                    eq(chatConversations.participant1Id, recipientUser.id),
                    eq(chatConversations.participant2Handle, user.handle)
                )
            });

            if (!conversation) {
                const [newConv] = await db.insert(chatConversations).values({
                    participant1Id: recipientUser.id,
                    participant2Handle: user.handle,
                    lastMessageAt: new Date(),
                    lastMessagePreview: '[Encrypted Message]'
                }).returning();
                conversation = newConv;
            }

            // Ensure conversation exists for sender
            let senderConversation = await db.query.chatConversations.findFirst({
                where: and(
                    eq(chatConversations.participant1Id, user.id),
                    eq(chatConversations.participant2Handle, recipientUser.handle)
                )
            });

            if (!senderConversation) {
                await db.insert(chatConversations).values({
                    participant1Id: user.id,
                    participant2Handle: recipientUser.handle,
                    lastMessageAt: new Date(),
                    lastMessagePreview: '[Encrypted Message]'
                });
            }

            // Insert into local inbox
            await db.insert(chatInbox).values({
                senderDid: user.did,
                recipientDid,
                recipientDeviceId: recipientDeviceId || null,
                envelope: JSON.stringify(body),
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            });

            return NextResponse.json({ success: true, local: true });

        } else {
            // REMOTE RECIPIENT - Forward to their node
            
            let targetNodeDomain = nodeDomain;
            
            if (!targetNodeDomain) {
                // Try to extract from DID
                if (recipientDid.startsWith('did:web:')) {
                    targetNodeDomain = recipientDid.replace('did:web:', '');
                } else {
                    return NextResponse.json({ 
                        error: 'Remote delivery requires node domain' 
                    }, { status: 400 });
                }
            }

            // Forward the signed envelope to the remote node
            const remoteUrl = `https://${targetNodeDomain}/api/swarm/chat/inbox`;
            
            try {
                const response = await fetch(remoteUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    console.error('[Chat Send] Remote delivery failed:', errorData);
                    return NextResponse.json({ 
                        error: 'Remote delivery failed',
                        details: errorData 
                    }, { status: response.status });
                }

                // Create local conversation for sender if we have recipient handle
                if (recipientHandle) {
                    const existingConv = await db.query.chatConversations.findFirst({
                        where: and(
                            eq(chatConversations.participant1Id, user.id),
                            eq(chatConversations.participant2Handle, recipientHandle)
                        )
                    });

                    if (!existingConv) {
                        await db.insert(chatConversations).values({
                            participant1Id: user.id,
                            participant2Handle: recipientHandle,
                            lastMessageAt: new Date(),
                            lastMessagePreview: '[Encrypted Message]'
                        });
                    }
                }
                
                return NextResponse.json({ success: true, remote: true });

            } catch (error: any) {
                console.error('[Chat Send] Remote delivery error:', error);
                return NextResponse.json({ 
                    error: 'Failed to reach remote node',
                    details: error.message 
                }, { status: 500 });
            }
        }

    } catch (error: any) {
        console.error('Delivery failed:', error);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}
