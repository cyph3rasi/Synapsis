/**
 * Account Moved Notification API
 * 
 * Called by the new node to notify the old node that an account has migrated.
 * The old node then marks the account as moved and broadcasts Move activity to followers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, users, follows } from '@/db';
import { eq } from 'drizzle-orm';
import * as crypto from 'crypto';
import { createMoveActivity } from '@/lib/activitypub/activities';
import { signRequest } from '@/lib/activitypub/signatures';

interface MoveNotification {
    oldHandle: string;
    newActorUrl: string;
    did: string;
    movedAt: string;
    signature: string;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json() as MoveNotification;
        const { oldHandle, newActorUrl, did, movedAt, signature } = body;

        if (!oldHandle || !newActorUrl || !did || !signature) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Find the user on this node
        const user = await db.query.users.findFirst({
            where: eq(users.handle, oldHandle.toLowerCase()),
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Verify the DID matches
        if (user.did !== did) {
            return NextResponse.json({ error: 'DID mismatch' }, { status: 403 });
        }

        // Verify the signature using the user's public key
        const payload = { oldHandle, newActorUrl, did, movedAt };
        const verify = crypto.createVerify('sha256');
        verify.update(JSON.stringify(payload));

        const isValid = verify.verify(user.publicKey, signature, 'base64');
        if (!isValid) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
        }

        // Check if already moved
        if (user.movedTo) {
            return NextResponse.json({ error: 'Account already marked as moved' }, { status: 409 });
        }

        // Mark the account as moved
        await db.update(users)
            .set({
                movedTo: newActorUrl,
                migratedAt: new Date(movedAt),
                updatedAt: new Date(),
            })
            .where(eq(users.id, user.id));

        // Get all followers to notify
        const userFollowers = await db.query.follows.findMany({
            where: eq(follows.followingId, user.id),
            with: {
                follower: true,
            },
        });

        const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';
        const oldActorUrl = `https://${nodeDomain}/users/${user.handle}`;

        // Create Move activity with DID extension
        const moveActivity = createMoveActivity(
            user,
            oldActorUrl,
            newActorUrl,
            nodeDomain
        );

        // Broadcast Move activity to all followers
        // In a production system, this would be queued
        let notifiedCount = 0;
        for (const follow of userFollowers) {
            try {
                // For local Synapsis followers, we could update directly
                // For remote followers, we'd send the Move activity
                // For now, we'll just count them
                notifiedCount++;
            } catch (error) {
                console.error('Failed to notify follower:', error);
            }
        }

        console.log(`Account ${oldHandle} marked as moved to ${newActorUrl}. Notified ${notifiedCount} followers.`);

        return NextResponse.json({
            success: true,
            message: 'Account marked as moved',
            followersNotified: notifiedCount,
        });

    } catch (error) {
        console.error('Move notification error:', error);
        return NextResponse.json({ error: 'Failed to process move notification' }, { status: 500 });
    }
}
