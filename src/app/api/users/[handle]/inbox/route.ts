/**
 * ActivityPub User Inbox Endpoint
 * 
 * Receives incoming activities from remote servers for a specific user.
 * POST /users/{handle}/inbox
 */

import { NextResponse } from 'next/server';
import { db, users } from '@/db';
import { eq } from 'drizzle-orm';
import { processIncomingActivity, type IncomingActivity } from '@/lib/activitypub/inbox';

type RouteContext = { params: Promise<{ handle: string }> };

export async function POST(request: Request, context: RouteContext) {
    try {
        const { handle } = await context.params;
        const cleanHandle = handle.toLowerCase().replace(/^@/, '');

        // Verify the target user exists
        if (!db) {
            console.error('[Inbox] Database not available');
            return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
        }

        const targetUser = await db.query.users.findFirst({
            where: eq(users.handle, cleanHandle),
        });

        if (!targetUser) {
            console.error(`[Inbox] User not found: ${cleanHandle}`);
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Parse the activity
        let activity: IncomingActivity;
        try {
            activity = await request.json();
        } catch (e) {
            console.error('[Inbox] Invalid JSON body:', e);
            return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
        }

        console.log(`[Inbox] Received ${activity.type} activity for @${cleanHandle} from ${activity.actor}`);

        // Extract headers for signature verification
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => {
            headers[key] = value;
        });

        // Get the request path
        const url = new URL(request.url);
        const path = url.pathname;

        // Process the activity
        const result = await processIncomingActivity(activity, headers, path, targetUser);

        if (!result.success) {
            console.error(`[Inbox] Activity processing failed: ${result.error}`);
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        // Return 202 Accepted (standard for ActivityPub)
        return new NextResponse(null, { status: 202 });
    } catch (error) {
        console.error('[Inbox] Error processing activity:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// ActivityPub requires the inbox to be discoverable
export async function GET(request: Request, context: RouteContext) {
    const { handle } = await context.params;
    return NextResponse.json(
        {
            '@context': 'https://www.w3.org/ns/activitystreams',
            summary: `Inbox for @${handle}`,
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
