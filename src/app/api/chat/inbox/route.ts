
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { chatInbox } from '@/db/schema';
import { eq, and, or, isNull } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

/**
 * GET /api/chat/inbox
 * Poll for new encrypted envelopes for this device.
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.did) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { did } = session.user;
        const { searchParams } = new URL(request.url);
        const deviceId = searchParams.get('deviceId');

        if (!deviceId) {
            return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
        }

        // Fetch messages for this user AND (this device OR all devices)
        const messages = await db.select().from(chatInbox).where(
            and(
                eq(chatInbox.recipientDid, did),
                or(
                    eq(chatInbox.recipientDeviceId, deviceId),
                    isNull(chatInbox.recipientDeviceId) // Broadcasts (if any)
                ),
                eq(chatInbox.isRead, false)
            )
        );

        // TODO: Mark them as read immediately? 
        // Or client must ACK?
        // For now, we return them. Client deals with idempotency.
        // If we mark read, checking on another tab might miss them if race condition.
        // But uniqueness is (id).

        return NextResponse.json({ messages });

    } catch (error: any) {
        console.error('Inbox poll fail:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * DELETE /api/chat/inbox
 * Acknowledge/Delete processed messages
 */
export async function DELETE(request: NextRequest) {
    // ... Implement ACK cleaning
    return NextResponse.json({ success: true });
}
