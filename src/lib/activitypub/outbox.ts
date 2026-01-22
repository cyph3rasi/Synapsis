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
 * This would query the database for follower inbox URLs
 */
export async function getFollowerInboxes(userId: string): Promise<string[]> {
    // TODO: Query database for followers and their inbox URLs
    // For local followers: use their local inbox
    // For remote followers: use their remote inbox (stored when they followed)
    return [];
}
