/**
 * ActivityPub Outbox / Delivery
 * 
 * Handles sending activities to remote servers.
 */

import { signRequest } from './signatures';
import type { ActivityPubActivity } from './activities';

/**
 * Deliver an activity to a remote inbox
 */
export async function deliverActivity(
    activity: ActivityPubActivity,
    targetInbox: string,
    privateKey: string,
    keyId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const body = JSON.stringify(activity);

        // Sign the request
        const signatureHeaders = await signRequest(
            'POST',
            targetInbox,
            body,
            privateKey,
            keyId
        );

        // Send the activity
        const response = await fetch(targetInbox, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/activity+json',
                'Accept': 'application/activity+json',
                ...signatureHeaders,
            },
            body,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Activity delivery failed:', response.status, errorText);
            return {
                success: false,
                error: `Delivery failed: ${response.status} ${errorText}`
            };
        }

        return { success: true };
    } catch (error) {
        console.error('Activity delivery error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Deliver an activity to multiple inboxes
 */
export async function deliverToFollowers(
    activity: ActivityPubActivity,
    followerInboxes: string[],
    privateKey: string,
    keyId: string
): Promise<{ delivered: number; failed: number }> {
    // Deduplicate inboxes (shared inboxes should only receive once)
    const uniqueInboxes = [...new Set(followerInboxes)];

    let delivered = 0;
    let failed = 0;

    // Deliver in parallel with concurrency limit
    const concurrency = 10;
    for (let i = 0; i < uniqueInboxes.length; i += concurrency) {
        const batch = uniqueInboxes.slice(i, i + concurrency);
        const results = await Promise.allSettled(
            batch.map(inbox => deliverActivity(activity, inbox, privateKey, keyId))
        );

        for (const result of results) {
            if (result.status === 'fulfilled' && result.value.success) {
                delivered++;
            } else {
                failed++;
            }
        }
    }

    return { delivered, failed };
}

/**
 * Get followers' inboxes for delivery
 * Queries the remoteFollowers table for inbox URLs of remote users following this user
 */
export async function getFollowerInboxes(userId: string): Promise<string[]> {
    try {
        const { db, remoteFollowers } = await import('@/db');
        const { eq } = await import('drizzle-orm');

        if (!db) {
            console.warn('[Outbox] Database not available for follower query');
            return [];
        }

        // Get all remote followers of this user
        const followers = await db.query.remoteFollowers.findMany({
            where: eq(remoteFollowers.userId, userId),
        });

        // Prefer shared inbox when available (more efficient)
        const inboxes = followers.map(f => f.sharedInboxUrl || f.inboxUrl);

        // Deduplicate (shared inboxes may appear multiple times)
        return [...new Set(inboxes)];
    } catch (error) {
        console.error('[Outbox] Error fetching follower inboxes:', error);
        return [];
    }
}

