
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { chatInbox } from '@/db/schema';
import { requireSignedAction } from '@/lib/auth/verify-signature';

/**
 * POST /api/chat/send
 * Deliver an encrypted envelope to a local user's inbox.
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

        const { recipientDid, recipientDeviceId, ciphertext } = data;

        if (!recipientDid || !ciphertext) {
            return NextResponse.json({ error: 'Missing required delivery fields' }, { status: 400 });
        }

        // 2. Insert into Inbox
        await db.insert(chatInbox).values({
            senderDid: user.did,
            recipientDid,
            recipientDeviceId: recipientDeviceId || null, // Null = broadcast/all? Or specific? V2.1 says per-device.
            envelope: JSON.stringify(body),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days TTL
        });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Delivery failed:', error);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}
