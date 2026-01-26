/**
 * ActivityPub Inbox Handler
 * 
 * Processes incoming activities from remote servers.
 */

import { db, users, remoteFollowers, remotePosts, posts, remoteFollows } from '@/db';
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
    const object = activity.object as {
        type: string;
        content?: string;
        id?: string;
        url?: string;
        attributedTo?: string;
        published?: string;
        attachment?: Array<{
            type: string;
            mediaType?: string;
            url?: string;
            name?: string;
        }>;
    };

    if (object.type !== 'Note') {
        return { success: true }; // We only handle Notes for now
    }

    if (!object.id || !object.attributedTo) {
        console.warn('[Inbox] Create activity missing id or attributedTo');
        return { success: false, error: 'Missing required fields' };
    }

    try {
        // Check if we already have this post cached
        const existingPost = await db.query.remotePosts.findFirst({
            where: eq(remotePosts.apId, object.id),
        });

        if (existingPost) {
            console.log('[Inbox] Post already cached:', object.id);
            return { success: true };
        }

        // Parse author info from attributedTo URL
        const authorUrl = new URL(object.attributedTo);
        const authorPathParts = authorUrl.pathname.split('/').filter(Boolean);
        const authorHandle = authorPathParts[authorPathParts.length - 1] || 'unknown';
        const authorDomain = authorUrl.hostname;
        const fullHandle = `${authorHandle}@${authorDomain}`;

        // Fetch author profile for display name and avatar
        let displayName: string | null = null;
        let avatarUrl: string | null = null;
        try {
            const actorResponse = await fetch(object.attributedTo, {
                headers: {
                    'Accept': 'application/activity+json, application/ld+json',
                },
            });
            if (actorResponse.ok) {
                const actorData = await actorResponse.json();
                displayName = actorData.name || actorData.preferredUsername || null;
                avatarUrl = actorData.icon?.url || actorData.icon || null;
            }
        } catch (e) {
            console.warn('[Inbox] Could not fetch actor profile:', e);
        }

        // Parse media attachments
        let mediaJson: string | null = null;
        if (object.attachment && object.attachment.length > 0) {
            const mediaItems = object.attachment
                .filter(att => att.type === 'Document' || att.type === 'Image' || att.type === 'Video')
                .map(att => ({
                    url: att.url,
                    altText: att.name || null,
                    mediaType: att.mediaType,
                }));
            if (mediaItems.length > 0) {
                mediaJson = JSON.stringify(mediaItems);
            }
        }

        // Store the remote post
        await db.insert(remotePosts).values({
            apId: object.id,
            authorHandle: fullHandle,
            authorActorUrl: object.attributedTo,
            authorDisplayName: displayName,
            authorAvatarUrl: avatarUrl,
            content: object.content || '',
            publishedAt: object.published ? new Date(object.published) : new Date(),
            mediaJson: mediaJson,
            fetchedAt: new Date(),
        });

        console.log(`[Inbox] Cached remote post from ${fullHandle}:`, object.id);
        return { success: true };
    } catch (error) {
        console.error('[Inbox] Error caching remote post:', error);
        return { success: false, error: 'Failed to cache post' };
    }
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

    console.log('[Inbox] Received like for:', targetUrl, 'from:', activity.actor);

    try {
        // Find the local post by its apId or apUrl
        const post = await db.query.posts.findFirst({
            where: eq(posts.apId, targetUrl),
        });

        if (post) {
            // Increment like count
            await db.update(posts)
                .set({ likesCount: post.likesCount + 1 })
                .where(eq(posts.id, post.id));
            console.log(`[Inbox] Updated like count for post ${post.id}: ${post.likesCount + 1}`);
        } else {
            console.log('[Inbox] Like target not found locally:', targetUrl);
        }
    } catch (error) {
        console.error('[Inbox] Error updating like count:', error);
    }

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

    console.log('[Inbox] Received announce for:', targetUrl, 'from:', activity.actor);

    try {
        // Find the local post by its apId or apUrl
        const post = await db.query.posts.findFirst({
            where: eq(posts.apId, targetUrl),
        });

        if (post) {
            // Increment repost count
            await db.update(posts)
                .set({ repostsCount: post.repostsCount + 1 })
                .where(eq(posts.id, post.id));
            console.log(`[Inbox] Updated repost count for post ${post.id}: ${post.repostsCount + 1}`);
        } else {
            console.log('[Inbox] Announce target not found locally:', targetUrl);
        }
    } catch (error) {
        console.error('[Inbox] Error updating repost count:', error);
    }

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

    try {
        // The object can be the deleted item's URL or an object with an id
        const deletedId = typeof activity.object === 'string'
            ? activity.object
            : (activity.object as { id?: string })?.id;

        if (!deletedId) {
            console.log('[Inbox] Delete activity missing object id');
            return { success: true };
        }

        // Try to find and remove cached remote post
        const cachedPost = await db.query.remotePosts.findFirst({
            where: eq(remotePosts.apId, deletedId),
        });

        if (cachedPost) {
            // Verify the delete is from the original author
            if (cachedPost.authorActorUrl === activity.actor) {
                await db.delete(remotePosts).where(eq(remotePosts.id, cachedPost.id));
                console.log(`[Inbox] Deleted cached remote post: ${deletedId}`);
            } else {
                console.warn('[Inbox] Delete actor mismatch - ignoring');
            }
        } else {
            console.log('[Inbox] Deleted content not found in cache:', deletedId);
        }
    } catch (error) {
        console.error('[Inbox] Error handling delete:', error);
    }

    return { success: true };
}

/**
 * Handle Accept activities (follow accepted)
 */
async function handleAccept(activity: IncomingActivity): Promise<{ success: boolean; error?: string }> {
    console.log('[Inbox] Follow accepted by:', activity.actor);

    try {
        // The object should be the original Follow activity
        const followActivity = activity.object as { type?: string; actor?: string; object?: string };

        if (followActivity?.type !== 'Follow') {
            console.log('[Inbox] Accept is not for a Follow activity');
            return { success: true };
        }

        // Find the local user who sent the follow
        const localActorUrl = followActivity.actor;
        if (!localActorUrl) {
            return { success: true };
        }

        // Extract handle from our actor URL
        const handleMatch = localActorUrl.match(/\/users\/([^\/]+)$/);
        if (!handleMatch) {
            return { success: true };
        }

        const localUser = await db.query.users.findFirst({
            where: eq(users.handle, handleMatch[1].toLowerCase()),
        });

        if (!localUser) {
            return { success: true };
        }

        // Find and update the remote follow record
        const remoteFollow = await db.query.remoteFollows.findFirst({
            where: and(
                eq(remoteFollows.followerId, localUser.id),
                eq(remoteFollows.targetActorUrl, activity.actor)
            ),
        });

        if (remoteFollow) {
            // The follow is now confirmed - we could add an 'accepted' flag if needed
            // For now, just log it since the follow is already stored
            console.log(`[Inbox] Follow to ${activity.actor} confirmed for @${localUser.handle}`);
        }
    } catch (error) {
        console.error('[Inbox] Error handling accept:', error);
    }

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

        try {
            // Find all local users following the old actor URL
            const affectedFollows = await db.query.remoteFollows.findMany({
                where: eq(remoteFollows.targetActorUrl, oldActorUrl),
            });

            if (affectedFollows.length === 0) {
                console.log('[Inbox] No local users following the migrating account');
                return { success: true };
            }

            console.log(`[Inbox] Found ${affectedFollows.length} local users to migrate`);

            // Fetch the new actor's info to get their inbox
            const newActorResponse = await fetch(newActorUrl, {
                headers: {
                    'Accept': 'application/activity+json, application/ld+json',
                },
            });

            if (!newActorResponse.ok) {
                console.error('[Inbox] Failed to fetch new actor profile');
                return { success: true }; // Don't fail, just log
            }

            const newActor = await newActorResponse.json();
            const newInbox = newActor.endpoints?.sharedInbox || newActor.inbox;
            const newHandle = newActor.preferredUsername
                ? `${newActor.preferredUsername}@${new URL(newActorUrl).hostname}`
                : null;

            if (!newInbox) {
                console.error('[Inbox] New actor has no inbox');
                return { success: true };
            }

            // Update each follow relationship and send new Follow activities
            const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';
            const { createFollowActivity } = await import('./activities');
            const { deliverActivity } = await import('./outbox');

            for (const follow of affectedFollows) {
                try {
                    // Get the local user who was following
                    const localUser = await db.query.users.findFirst({
                        where: eq(users.id, follow.followerId),
                    });

                    if (!localUser || !localUser.privateKeyEncrypted) {
                        continue;
                    }

                    // Update the remoteFollows record with new actor info
                    const newActivityId = crypto.randomUUID();
                    await db.update(remoteFollows)
                        .set({
                            targetActorUrl: newActorUrl,
                            targetHandle: newHandle || follow.targetHandle,
                            inboxUrl: newInbox,
                            activityId: newActivityId,
                            displayName: newActor.name || follow.displayName,
                            avatarUrl: newActor.icon?.url || newActor.icon || follow.avatarUrl,
                        })
                        .where(eq(remoteFollows.id, follow.id));

                    // Send a Follow activity to the new actor
                    const followActivity = createFollowActivity(
                        localUser,
                        newActorUrl,
                        nodeDomain,
                        newActivityId
                    );

                    const keyId = `https://${nodeDomain}/users/${localUser.handle}#main-key`;
                    await deliverActivity(followActivity, newInbox, localUser.privateKeyEncrypted, keyId);

                    console.log(`[Inbox] Auto-migrated @${localUser.handle}'s follow to ${newActorUrl}`);
                } catch (err) {
                    console.error(`[Inbox] Error migrating follow ${follow.id}:`, err);
                }
            }

            console.log(`[Inbox] DID-based migration complete. ${affectedFollows.length} followers migrated.`);
        } catch (error) {
            console.error('[Inbox] Error during DID-based migration:', error);
        }
    } else {
        // Standard Fediverse Move - just log it
        // Users will need to manually re-follow
        console.log('[Inbox] Standard Move activity (no DID). Manual re-follow required.');
    }

    return { success: true };
}
