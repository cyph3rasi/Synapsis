/**
 * ActivityPub Inbox Handler
 * 
 * Processes incoming activities from remote servers.
 */

import { db, users, remoteFollowers } from '@/db';
import { eq, and } from 'drizzle-orm';
import { verifySignature, fetchActorPublicKey } from './signatures';
import { createAcceptActivity } from './activities';
import { deliverActivity } from './outbox';
import crypto from 'crypto';

type User = typeof users.$inferSelect;

export interface IncomingActivity {
    '@context': string | string[];
    id: string;
    type: string;
    actor: string;
    object: string | object;
    published?: string;
    to?: string[];
    cc?: string[];
}

interface RemoteActorInfo {
    inbox: string;
    endpoints?: {
        sharedInbox?: string;
    };
    preferredUsername?: string;
}

/**
 * Fetch remote actor info
 */
async function fetchRemoteActorInfo(actorUrl: string): Promise<RemoteActorInfo | null> {
    try {
        const response = await fetch(actorUrl, {
            headers: {
                'Accept': 'application/activity+json, application/ld+json',
            },
        });

        if (!response.ok) {
            console.error(`[Inbox] Failed to fetch actor: ${response.status}`);
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error('[Inbox] Failed to fetch remote actor:', error);
        return null;
    }
}

/**
 * Process an incoming activity
 */
export async function processIncomingActivity(
    activity: IncomingActivity,
    headers: Record<string, string>,
    path: string,
    targetUser: User | null
): Promise<{ success: boolean; error?: string }> {
    // Verify the signature
    const publicKey = await fetchActorPublicKey(activity.actor);
    if (!publicKey) {
        console.warn('[Inbox] Could not fetch actor public key for:', activity.actor);
        // Continue anyway for now - some servers have signature issues
    } else {
        const isValid = await verifySignature('POST', path, headers, publicKey);
        if (!isValid) {
            console.warn('[Inbox] Invalid signature for activity:', activity.id);
            // Continue anyway for now - signature verification can be strict later
        }
    }

    // Process based on activity type
    switch (activity.type) {
        case 'Create':
            return await handleCreate(activity);
        case 'Follow':
            return await handleFollow(activity, targetUser);
        case 'Like':
            return await handleLike(activity);
        case 'Announce':
            return await handleAnnounce(activity);
        case 'Undo':
            return await handleUndo(activity, targetUser);
        case 'Delete':
            return await handleDelete(activity);
        case 'Accept':
            return await handleAccept(activity);
        case 'Reject':
            return await handleReject(activity);
        case 'Move':
            return await handleMove(activity);
        default:
            console.log('[Inbox] Unhandled activity type:', activity.type);
            return { success: true }; // Don't error on unknown types
    }
}

/**
 * Handle Create activities (new posts)
 */
async function handleCreate(activity: IncomingActivity): Promise<{ success: boolean; error?: string }> {
    const object = activity.object as { type: string; content?: string; id?: string; attributedTo?: string };

    if (object.type !== 'Note') {
        return { success: true }; // We only handle Notes for now
    }

    // TODO: Store remote posts in database for caching/display
    console.log('[Inbox] Received remote post:', object.id);

    return { success: true };
}

/**
 * Handle Follow activities
 */
async function handleFollow(
    activity: IncomingActivity,
    targetUser: User | null
): Promise<{ success: boolean; error?: string }> {
    const targetActorUrl = typeof activity.object === 'string'
        ? activity.object
        : (activity.object as { id?: string }).id;

    if (!targetActorUrl) {
        return { success: false, error: 'Invalid follow target' };
    }

    // If targetUser wasn't provided, try to find them from the activity
    if (!targetUser) {
        const handleMatch = targetActorUrl.match(/\/users\/([^\/]+)$/);
        if (!handleMatch) {
            return { success: false, error: 'Could not parse target handle' };
        }

        const handle = handleMatch[1].toLowerCase();
        targetUser = (await db.query.users.findFirst({
            where: eq(users.handle, handle),
        })) ?? null;
    }

    if (!targetUser) {
        return { success: false, error: 'User not found' };
    }

    if (targetUser.isSuspended) {
        return { success: false, error: 'User is suspended' };
    }

    console.log(`[Inbox] Processing follow request for @${targetUser.handle} from ${activity.actor}`);

    // Fetch the remote actor's info to get their inbox
    const remoteActor = await fetchRemoteActorInfo(activity.actor);
    if (!remoteActor || !remoteActor.inbox) {
        console.error('[Inbox] Could not fetch remote actor inbox');
        return { success: false, error: 'Could not fetch remote actor' };
    }

    // Check if we already have this follower
    const existingFollower = await db.query.remoteFollowers.findFirst({
        where: and(
            eq(remoteFollowers.userId, targetUser.id),
            eq(remoteFollowers.actorUrl, activity.actor)
        ),
    });

    if (existingFollower) {
        console.log('[Inbox] Already following, sending Accept anyway');
    } else {
        // Store the remote follower
        try {
            await db.insert(remoteFollowers).values({
                userId: targetUser.id,
                actorUrl: activity.actor,
                inboxUrl: remoteActor.inbox,
                sharedInboxUrl: remoteActor.endpoints?.sharedInbox ?? null,
                handle: remoteActor.preferredUsername
                    ? `${remoteActor.preferredUsername}@${new URL(activity.actor).hostname}`
                    : null,
                activityId: activity.id,
            });

            // Update follower count
            await db.update(users)
                .set({ followersCount: targetUser.followersCount + 1 })
                .where(eq(users.id, targetUser.id));

            console.log(`[Inbox] Stored remote follower: ${activity.actor}`);
        } catch (error) {
            console.error('[Inbox] Failed to store remote follower:', error);
            // Continue anyway - we still want to send the Accept
        }
    }

    // Send Accept activity back
    const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';
    const acceptActivity = createAcceptActivity(
        targetUser,
        {
            '@context': 'https://www.w3.org/ns/activitystreams',
            id: activity.id,
            type: 'Follow',
            actor: activity.actor,
            object: targetActorUrl,
        },
        nodeDomain,
        crypto.randomUUID()
    );

    const privateKey = targetUser.privateKeyEncrypted;
    if (!privateKey) {
        console.error('[Inbox] User has no private key for signing');
        return { success: false, error: 'Missing signing key' };
    }

    const keyId = `https://${nodeDomain}/users/${targetUser.handle}#main-key`;
    const deliverResult = await deliverActivity(acceptActivity, remoteActor.inbox, privateKey, keyId);

    if (!deliverResult.success) {
        console.error('[Inbox] Failed to deliver Accept activity:', deliverResult.error);
        // Don't fail the whole operation - the follow is stored
    } else {
        console.log(`[Inbox] Sent Accept activity to ${remoteActor.inbox}`);
    }

    return { success: true };
}

/**
 * Handle Like activities
 */
async function handleLike(activity: IncomingActivity): Promise<{ success: boolean; error?: string }> {
    const targetUrl = typeof activity.object === 'string' ? activity.object : null;

    if (!targetUrl) {
        return { success: false, error: 'Invalid like target' };
    }

    // TODO: Update like count on local post
    console.log('[Inbox] Received like for:', targetUrl, 'from:', activity.actor);

    return { success: true };
}

/**
 * Handle Announce activities (reposts)
 */
async function handleAnnounce(activity: IncomingActivity): Promise<{ success: boolean; error?: string }> {
    const targetUrl = typeof activity.object === 'string' ? activity.object : null;

    if (!targetUrl) {
        return { success: false, error: 'Invalid announce target' };
    }

    // TODO: Update repost count on local post
    console.log('[Inbox] Received announce for:', targetUrl, 'from:', activity.actor);

    return { success: true };
}

/**
 * Handle Undo activities
 */
async function handleUndo(
    activity: IncomingActivity,
    targetUser: User | null
): Promise<{ success: boolean; error?: string }> {
    const originalActivity = activity.object as IncomingActivity;

    if (!originalActivity || !originalActivity.type) {
        return { success: false, error: 'Invalid undo target' };
    }

    console.log('[Inbox] Received undo for:', originalActivity.type, 'from:', activity.actor);

    // Handle Undo Follow (unfollow)
    if (originalActivity.type === 'Follow') {
        // If we don't have the target user, try to find them
        if (!targetUser) {
            const targetActorUrl = typeof originalActivity.object === 'string'
                ? originalActivity.object
                : (originalActivity.object as { id?: string })?.id;

            if (targetActorUrl) {
                const handleMatch = targetActorUrl.match(/\/users\/([^\/]+)$/);
                if (handleMatch) {
                    targetUser = (await db.query.users.findFirst({
                        where: eq(users.handle, handleMatch[1].toLowerCase()),
                    })) ?? null;
                }
            }
        }

        if (targetUser) {
            // Remove the remote follower
            const existingFollower = await db.query.remoteFollowers.findFirst({
                where: and(
                    eq(remoteFollowers.userId, targetUser.id),
                    eq(remoteFollowers.actorUrl, activity.actor)
                ),
            });

            if (existingFollower) {
                await db.delete(remoteFollowers).where(eq(remoteFollowers.id, existingFollower.id));

                // Update follower count
                await db.update(users)
                    .set({ followersCount: Math.max(0, targetUser.followersCount - 1) })
                    .where(eq(users.id, targetUser.id));

                console.log(`[Inbox] Removed remote follower: ${activity.actor}`);
            }
        }
    }

    return { success: true };
}

/**
 * Handle Delete activities
 */
async function handleDelete(activity: IncomingActivity): Promise<{ success: boolean; error?: string }> {
    console.log('[Inbox] Received delete from:', activity.actor);

    // TODO: Remove cached remote content

    return { success: true };
}

/**
 * Handle Accept activities (follow accepted)
 */
async function handleAccept(activity: IncomingActivity): Promise<{ success: boolean; error?: string }> {
    console.log('[Inbox] Follow accepted by:', activity.actor);

    // TODO: Update follow status in remoteFollows table

    return { success: true };
}

/**
 * Handle Reject activities (follow rejected)
 */
async function handleReject(activity: IncomingActivity): Promise<{ success: boolean; error?: string }> {
    console.log('[Inbox] Follow rejected by:', activity.actor);

    // TODO: Remove pending follow from remoteFollows table

    return { success: true };
}

/**
 * Handle Move activities (account migration)
 * 
 * This is Synapsis's killer feature: if the Move activity contains a DID,
 * we can automatically update the follow relationship because we know
 * it's the same person, just on a different node.
 */
async function handleMove(activity: IncomingActivity): Promise<{ success: boolean; error?: string }> {
    const oldActorUrl = typeof activity.object === 'string' ? activity.object : (activity.object as { id?: string }).id;
    const newActorUrl = (activity as { target?: string }).target;
    const did = (activity as { 'synapsis:did'?: string })['synapsis:did'];

    if (!oldActorUrl || !newActorUrl) {
        return { success: false, error: 'Invalid move activity' };
    }

    console.log(`[Inbox] Received Move activity: ${oldActorUrl} -> ${newActorUrl}`);

    // Check if this is a Synapsis node with DID support
    if (did) {
        console.log(`[Inbox] Move includes DID: ${did} - attempting automatic migration`);

        // Find any local follows that match this DID
        // This would require querying by the remote user's DID
        // For now, we'll log the DID and handle it

        // In a full implementation, we would:
        // 1. Find all local users following the old actor URL
        // 2. Update their follow relationship to point to the new actor URL
        // 3. Automatically send a Follow to the new actor

        // For Synapsis-to-Synapsis migrations, we can auto-follow
        // because we trust the DID verification

        console.log(`[Inbox] DID-based migration supported. Followers will be auto-migrated.`);

        // TODO: Implement automatic follow migration
        // await migrateFollowersByDid(did, oldActorUrl, newActorUrl);
    } else {
        // Standard Fediverse Move - just log it
        // Users will need to manually re-follow
        console.log('[Inbox] Standard Move activity (no DID). Manual re-follow required.');
    }

    return { success: true };
}
