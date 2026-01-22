import { NextResponse } from 'next/server';
import { db, users, posts } from '@/db';
import { count } from 'drizzle-orm';

export async function GET() {
    const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';
    const nodeName = process.env.NEXT_PUBLIC_NODE_NAME || 'Synapsis Node';
    const nodeDescription = process.env.NEXT_PUBLIC_NODE_DESCRIPTION || 'A Synapsis federated social network node';

    // Get stats
    const [userCount] = await db.select({ count: count() }).from(users);
    const [postCount] = await db.select({ count: count() }).from(posts);

    return NextResponse.json({
        version: '2.1',
        software: {
            name: 'synapsis',
            version: '0.1.0',
            homepage: 'https://github.com/synapsis',
        },
        protocols: ['activitypub'],
        usage: {
            users: {
                total: userCount?.count || 0,
                activeMonth: userCount?.count || 0,
                activeHalfyear: userCount?.count || 0,
            },
            localPosts: postCount?.count || 0,
        },
        openRegistrations: true,
        metadata: {
            nodeName,
            nodeDescription,
        },
    });
}
