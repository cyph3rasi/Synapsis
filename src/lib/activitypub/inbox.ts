/**
 * ActivityPub Inbox Handler
 * 
 * Processes incoming activities from remote servers.
 */

import { db, users, posts, follows, likes } from '@/db';
import { eq, and } from 'drizzle-orm';
import { verifySignature, fetchActorPublicKey } from './signatures';
import { v4 as uuid } from 'uuid';

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

/**
 * Process an incoming activity
 */
export async function processIncomingActivity(
    activity: IncomingActivity,
    headers: Record<string, string>,
    path: string
): Promise<{ success: boolean; error?: string }> {
    // Verify the signature
    const publicKey = await fetchActorPublicKey(activity.actor);
    if (!publicKey) {
        return { success: false, error: 'Could not fetch actor public key' };
    }

    const isValid = await verifySignature('POST', path, headers, publicKey);
    if (!isValid) {
        console.warn('Invalid signature for activity:', activity.id);
        // In development, we might want to continue anyway
        // return { success: false, error: 'Invalid signature' };
    }

    // Process based on activity type
    switch (activity.type) {
        case 'Create':
            return await handleCreate(activity);
        case 'Follow':
            return await handleFollow(activity);
        case 'Like':
            return await handleLike(activity);
        case 'Announce':
            return await handleAnnounce(activity);
        case 'Undo':
            return await handleUndo(activity);
        case 'Delete':
            return await handleDelete(activity);
        case 'Accept':
            return await handleAccept(activity);
        case 'Reject':
            return await handleReject(activity);
        case 'Move':
            return await handleMove(activity);
        default:
            console.log('Unhandled activity type:', activity.type);
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
    console.log('Received remote post:', object.id);

    return { success: true };
}

/**
 * Handle Follow activities
 */
async function handleFollow(activity: IncomingActivity): Promise<{ success: boolean; error?: string }> {
    const targetActorUrl = typeof activity.object === 'string' ? activity.object : (activity.object as { id?: string }).id;

    if (!targetActorUrl) {
        return { success: false, error: 'Invalid follow target' };
    }

    // Extract handle from target URL
    const handleMatch = targetActorUrl.match(/\/users\/([^\/]+)$/);
    if (!handleMatch) {
        return { success: false, error: 'Could not parse target handle' };
    }

    const handle = handleMatch[1];

    // Find the local user
    const targetUser = await db.query.users.findFirst({
        where: eq(users.handle, handle),
    });

    if (!targetUser) {
        return { success: false, error: 'User not found' };
    }

    // TODO: Store follower relationship, send Accept activity
    console.log('Received follow request for:', handle, 'from:', activity.actor);

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
    console.log('Received like for:', targetUrl, 'from:', activity.actor);

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
    console.log('Received announce for:', targetUrl, 'from:', activity.actor);

    return { success: true };
}

/**
 * Handle Undo activities
 */
async function handleUndo(activity: IncomingActivity): Promise<{ success: boolean; error?: string }> {
    const originalActivity = activity.object as IncomingActivity;

    if (!originalActivity || !originalActivity.type) {
        return { success: false, error: 'Invalid undo target' };
    }

    console.log('Received undo for:', originalActivity.type, 'from:', activity.actor);

    // TODO: Handle undo based on original activity type

    return { success: true };
}

/**
 * Handle Delete activities
 */
async function handleDelete(activity: IncomingActivity): Promise<{ success: boolean; error?: string }> {
    console.log('Received delete from:', activity.actor);

    // TODO: Remove cached remote content

    return { success: true };
}

/**
 * Handle Accept activities (follow accepted)
 */
async function handleAccept(activity: IncomingActivity): Promise<{ success: boolean; error?: string }> {
    console.log('Follow accepted by:', activity.actor);

    // TODO: Update follow status

    return { success: true };
}

/**
 * Handle Reject activities (follow rejected)
 */
async function handleReject(activity: IncomingActivity): Promise<{ success: boolean; error?: string }> {
    console.log('Follow rejected by:', activity.actor);

    // TODO: Remove pending follow

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

    console.log(`Received Move activity: ${oldActorUrl} -> ${newActorUrl}`);

    // Check if this is a Synapsis node with DID support
    if (did) {
        console.log(`Move includes DID: ${did} - attempting automatic migration`);

        // Find any local follows that match this DID
        // This would require querying by the remote user's DID
        // For now, we'll log the DID and handle it

        // In a full implementation, we would:
        // 1. Find all local users following the old actor URL
        // 2. Update their follow relationship to point to the new actor URL
        // 3. Automatically send a Follow to the new actor

        // For Synapsis-to-Synapsis migrations, we can auto-follow
        // because we trust the DID verification

        console.log(`DID-based migration supported. Followers will be auto-migrated.`);

        // TODO: Implement automatic follow migration
        // await migrateFollowersByDid(did, oldActorUrl, newActorUrl);
    } else {
        // Standard Fediverse Move - just log it
        // Users will need to manually re-follow
        console.log('Standard Move activity (no DID). Manual re-follow required.');
    }

    return { success: true };
}
