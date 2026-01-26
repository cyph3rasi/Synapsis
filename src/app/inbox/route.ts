/**
 * ActivityPub Shared Inbox Endpoint
 * 
 * Receives incoming activities from remote servers.
 * This is used for batch delivery and public activities.
 * POST /inbox
 */

import { NextResponse } from 'next/server';
import { db, users } from '@/db';
import { eq } from 'drizzle-orm';
import { processIncomingActivity, type IncomingActivity } from '@/lib/activitypub/inbox';

export async function POST(request: Request) {
    try {
        // Parse the activity
        let activity: IncomingActivity;
        try {
            activity = await request.json();
        } catch (e) {
            console.error('[SharedInbox] Invalid JSON body:', e);
            return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
        }

        console.log(`[SharedInbox] Received ${activity.type} activity from ${activity.actor}`);

        if (!db) {
            console.error('[SharedInbox] Database not available');
            return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
        }

        // Extract headers for signature verification
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => {
            headers[key] = value;
        });

        // Get the request path
        const url = new URL(request.url);
        const path = url.pathname;

        // For shared inbox, we need to determine the target user from the activity object
        let targetUser = null;

        // Try to extract target from the activity object
        const objectTarget = typeof activity.object === 'string'
            ? activity.object
            : (activity.object as { id?: string })?.id;

        if (objectTarget) {
            // Extract handle from target URL (e.g., https://domain.com/users/handle)
            const handleMatch = objectTarget.match(/\/users\/([^\/]+)/);
            if (handleMatch) {
                const handle = handleMatch[1].toLowerCase();
                targetUser = await db.query.users.findFirst({
                    where: eq(users.handle, handle),
                });
            }
        }

        // Process the activity
        const result = await processIncomingActivity(activity, headers, path, targetUser ?? null);

        if (!result.success) {
            console.error(`[SharedInbox] Activity processing failed: ${result.error}`);
            // Don't return error for shared inbox - just log and accept
            // This is because shared inbox receives activities for multiple users
        }

        // Return 202 Accepted (standard for ActivityPub)
        return new NextResponse(null, { status: 202 });
    } catch (error) {
        console.error('[SharedInbox] Error processing activity:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// ActivityPub requires the inbox to be discoverable  
export async function GET() {
    return NextResponse.json(
        {
            '@context': 'https://www.w3.org/ns/activitystreams',
            summary: 'Shared inbox',
            type: 'OrderedCollection',
            totalItems: 0,
            orderedItems: [],
        },
        {
            headers: {
                'Content-Type': 'application/activity+json',
            },
        }
    );
}
