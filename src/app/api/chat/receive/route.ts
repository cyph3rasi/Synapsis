
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { chatConversations, chatMessages, users, handleRegistry } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { verifyActionSignature, type SignedAction } from '@/lib/auth/verify-signature';

/**
 * POST /api/chat/receive
 * Endpoint for receiving federated chat messages from other nodes.
 * Expects a SignedAction payload from the sender.
 */
export async function POST(request: NextRequest) {
    try {
        const signedAction: SignedAction = await request.json();
        const { did, handle, data } = signedAction;
        const { recipientDid, content } = data || {};

        if (!did || !handle || !recipientDid || !content) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        console.log(`[Chat Receive] From: ${handle} (DID: ${did}), To: ${recipientDid}`);

        // 1. Resolve Sender Public Key
        let senderUser = await db.query.users.findFirst({
            where: eq(users.did, did)
        });

        let publicKey = senderUser?.publicKey;
        let senderDisplayName = senderUser?.displayName || handle;
        let senderAvatarUrl = senderUser?.avatarUrl;
        let senderNodeDomain: string | null = null;

        if (!senderUser) {
            // Unknown user - likely remote. We need to fetch their profile to get the public key.
            // Derive domain from handle if possible
            if (handle.includes('@')) {
                const parts = handle.split('@');
                senderNodeDomain = parts[parts.length - 1];
            } else {
                // Try handle registry (though we likely don't have it if we don't have the user)
                const registryEntry = await db.query.handleRegistry.findFirst({
                    where: eq(handleRegistry.did, did)
                });
                if (registryEntry) senderNodeDomain = registryEntry.nodeDomain;
            }

            if (senderNodeDomain) {
                try {
                    const protocol = senderNodeDomain.includes('localhost') ? 'http' : 'https';
                    // Fetch profile from remote node
                    // Assuming /api/users/:handle convention
                    const remoteHandle = handle.includes('@') ? handle.split('@')[0] : handle;
                    const res = await fetch(`${protocol}://${senderNodeDomain}/api/users/${remoteHandle}`);

                    if (res.ok) {
                        const profileData = await res.json();
                        const remoteProfile = profileData.user;
                        if (remoteProfile && remoteProfile.publicKey) {
                            if (remoteProfile.did !== did) {
                                console.error('DID mismatch for remote user');
                            } else {
                                publicKey = remoteProfile.publicKey;
                                senderDisplayName = remoteProfile.displayName || handle;
                                senderAvatarUrl = remoteProfile.avatarUrl;
                            }
                        }
                    } else {
                        console.error('Failed to fetch remote profile:', res.status);
                    }
                } catch (e) {
                    console.error('Remote profile fetch failed:', e);
                }
            }
        }

        if (!publicKey) {
            return NextResponse.json({ error: 'Could not resolve sender public key' }, { status: 401 });
        }

        // 2. Verify Signature
        const isValid = await verifyActionSignature(signedAction, publicKey);
        if (!isValid) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
        }

        // 3. Find Local Recipient
        const recipientUser = await db.query.users.findFirst({
            where: eq(users.did, recipientDid)
        });

        if (!recipientUser) {
            return NextResponse.json({ error: 'Recipient not found on this node' }, { status: 404 });
        }

        // 4. Find or Create Conversation
        // For the RECIPIENT, the conversation is with the SENDER
        // Use full handle
        const fullSenderHandle = handle.includes('@') ? handle : (senderNodeDomain ? `${handle}@${senderNodeDomain}` : handle);

        let conversation = await db.query.chatConversations.findFirst({
            where: and(
                eq(chatConversations.participant1Id, recipientUser.id),
                eq(chatConversations.participant2Handle, fullSenderHandle)
            )
        });

        if (!conversation) {
            const [newConv] = await db.insert(chatConversations).values({
                participant1Id: recipientUser.id,
                participant2Handle: fullSenderHandle,
                lastMessageAt: new Date(),
                lastMessagePreview: content.slice(0, 50)
            }).returning();
            conversation = newConv;
        } else {
            // Update preview
            await db.update(chatConversations)
                .set({
                    lastMessageAt: new Date(),
                    lastMessagePreview: content.slice(0, 50),
                    updatedAt: new Date()
                })
                .where(eq(chatConversations.id, conversation.id));
        }

        // 5. Store Message
        await db.insert(chatMessages).values({
            conversationId: conversation.id,
            senderHandle: fullSenderHandle,
            senderDisplayName: senderDisplayName,
            senderAvatarUrl: senderAvatarUrl,
            senderNodeDomain: senderNodeDomain,
            senderDid: did,
            content: content,
            deliveredAt: new Date(),
        });

        // 6. Update Registry (to ensure we can reply efficiently)
        if (senderNodeDomain) {
            await db.insert(handleRegistry).values({
                handle: fullSenderHandle, // user@domain
                did: did,
                nodeDomain: senderNodeDomain
            }).onConflictDoUpdate({
                target: handleRegistry.handle,
                set: {
                    did: did,
                    nodeDomain: senderNodeDomain
                }
            });
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Federated Receive Failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
