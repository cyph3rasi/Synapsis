import { NextResponse } from 'next/server';
import { db, users } from '@/db';
import { eq } from 'drizzle-orm';
import { userToActor } from '@/lib/activitypub/actor';

type RouteContext = { params: Promise<{ handle: string }> };

export async function GET(request: Request, context: RouteContext) {
    try {
        const { handle } = await context.params;
        const cleanHandle = handle.toLowerCase().replace(/^@/, '');

        // Return mock user if no database
        if (!db) {
            return NextResponse.json({
                user: {
                    id: 'demo-user',
                    handle: cleanHandle,
                    displayName: cleanHandle,
                    bio: 'This is a demo profile.',
                    avatarUrl: null,
                    headerUrl: null,
                    followersCount: 0,
                    followingCount: 0,
                    postsCount: 0,
                    createdAt: new Date().toISOString(),
                }
            });
        }

        const user = await db.query.users.findFirst({
            where: eq(users.handle, cleanHandle),
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }
        if (user.isSuspended) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Check if ActivityPub request
        const accept = request.headers.get('accept') || '';
        if (accept.includes('application/activity+json') || accept.includes('application/ld+json')) {
            const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';
            const actor = userToActor(user, nodeDomain);
            return NextResponse.json(actor, {
                headers: {
                    'Content-Type': 'application/activity+json',
                },
            });
        }

        // Return user profile (without sensitive data)
        return NextResponse.json({
            user: {
                id: user.id,
                handle: user.handle,
                displayName: user.displayName,
                bio: user.bio,
                avatarUrl: user.avatarUrl,
                headerUrl: user.headerUrl,
                followersCount: user.followersCount,
                followingCount: user.followingCount,
                postsCount: user.postsCount,
                createdAt: user.createdAt,
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        return NextResponse.json({ error: 'Failed to get user' }, { status: 500 });
    }
}
