import { NextResponse } from 'next/server';
import { db, users } from '@/db';
import { eq } from 'drizzle-orm';
import { generateWebFingerResponse, parseWebFingerResource } from '@/lib/activitypub/webfinger';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const resource = searchParams.get('resource');

    if (!resource) {
        return NextResponse.json(
            { error: 'Missing resource parameter' },
            { status: 400 }
        );
    }

    const parsed = parseWebFingerResource(resource);

    if (!parsed) {
        return NextResponse.json(
            { error: 'Invalid resource format' },
            { status: 400 }
        );
    }

    const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';

    // Check if this is our domain
    if (parsed.domain !== nodeDomain && parsed.domain !== nodeDomain.replace(/:\d+$/, '')) {
        return NextResponse.json(
            { error: 'Resource not found' },
            { status: 404 }
        );
    }

    // Find the user
    const user = await db.query.users.findFirst({
        where: eq(users.handle, parsed.handle.toLowerCase()),
    });

    if (!user) {
        return NextResponse.json(
            { error: 'User not found' },
            { status: 404 }
        );
    }

    const response = generateWebFingerResponse(user.handle, nodeDomain);

    return NextResponse.json(response, {
        headers: {
            'Content-Type': 'application/jrd+json',
            'Access-Control-Allow-Origin': '*',
        },
    });
}
