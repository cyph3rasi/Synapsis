/**
 * ActivityPub Activities
 * 
 * Handles creation of ActivityPub activity objects for federation.
 * See: https://www.w3.org/TR/activitypub/#overview
 */

import type { posts, users } from '@/db/schema';

type Post = typeof posts.$inferSelect;
type User = typeof users.$inferSelect;

const ACTIVITY_STREAMS_CONTEXT = 'https://www.w3.org/ns/activitystreams';

export interface ActivityPubNote {
    '@context': string;
    id: string;
    type: 'Note';
    attributedTo: string;
    content: string;
    published: string;
    to: string[];
    cc: string[];
    inReplyTo?: string | null;
    url: string;
    attachment?: {
        type: string;
        mediaType: string;
        url: string;
        name?: string;
    }[];
}

export interface ActivityPubActivity {
    '@context': string;
    id: string;
    type: 'Create' | 'Follow' | 'Like' | 'Announce' | 'Undo' | 'Accept' | 'Reject' | 'Delete';
    actor: string;
    object: string | ActivityPubNote | object;
    published?: string;
    to?: string[];
    cc?: string[];
}

/**
 * Convert a Synapsis post to an ActivityPub Note
 */
export function postToNote(post: Post, author: User, nodeDomain: string): ActivityPubNote {
    const postUrl = `https://${nodeDomain}/posts/${post.id}`;
    const actorUrl = `https://${nodeDomain}/users/${author.handle}`;

    return {
        '@context': ACTIVITY_STREAMS_CONTEXT,
        id: postUrl,
        type: 'Note',
        attributedTo: actorUrl,
        content: escapeHtml(post.content),
        published: post.createdAt.toISOString(),
        to: ['https://www.w3.org/ns/activitystreams#Public'],
        cc: [`${actorUrl}/followers`],
        inReplyTo: post.replyToId ? `https://${nodeDomain}/posts/${post.replyToId}` : null,
        url: postUrl,
    };
}

/**
 * Create a Create activity for a new post
 */
export function createCreateActivity(
    post: Post,
    author: User,
    nodeDomain: string
): ActivityPubActivity {
    const actorUrl = `https://${nodeDomain}/users/${author.handle}`;
    const note = postToNote(post, author, nodeDomain);

    return {
        '@context': ACTIVITY_STREAMS_CONTEXT,
        id: `https://${nodeDomain}/activities/${post.id}`,
        type: 'Create',
        actor: actorUrl,
        published: post.createdAt.toISOString(),
        to: note.to,
        cc: note.cc,
        object: note,
    };
}

/**
 * Create a Follow activity
 */
export function createFollowActivity(
    follower: User,
    targetActorUrl: string,
    nodeDomain: string,
    activityId: string
): ActivityPubActivity {
    const actorUrl = `https://${nodeDomain}/users/${follower.handle}`;

    return {
        '@context': ACTIVITY_STREAMS_CONTEXT,
        id: `https://${nodeDomain}/activities/${activityId}`,
        type: 'Follow',
        actor: actorUrl,
        object: targetActorUrl,
    };
}

/**
 * Create a Like activity
 */
export function createLikeActivity(
    user: User,
    targetPostUrl: string,
    nodeDomain: string,
    activityId: string
): ActivityPubActivity {
    const actorUrl = `https://${nodeDomain}/users/${user.handle}`;

    return {
        '@context': ACTIVITY_STREAMS_CONTEXT,
        id: `https://${nodeDomain}/activities/${activityId}`,
        type: 'Like',
        actor: actorUrl,
        object: targetPostUrl,
    };
}

/**
 * Create an Announce (repost) activity
 */
export function createAnnounceActivity(
    user: User,
    targetPostUrl: string,
    nodeDomain: string,
    activityId: string
): ActivityPubActivity {
    const actorUrl = `https://${nodeDomain}/users/${user.handle}`;

    return {
        '@context': ACTIVITY_STREAMS_CONTEXT,
        id: `https://${nodeDomain}/activities/${activityId}`,
        type: 'Announce',
        actor: actorUrl,
        object: targetPostUrl,
        to: ['https://www.w3.org/ns/activitystreams#Public'],
        cc: [`${actorUrl}/followers`],
    };
}

/**
 * Create an Undo activity (for unfollowing, unliking, etc.)
 */
export function createUndoActivity(
    user: User,
    originalActivity: ActivityPubActivity,
    nodeDomain: string,
    activityId: string
): ActivityPubActivity {
    const actorUrl = `https://${nodeDomain}/users/${user.handle}`;

    return {
        '@context': ACTIVITY_STREAMS_CONTEXT,
        id: `https://${nodeDomain}/activities/${activityId}`,
        type: 'Undo',
        actor: actorUrl,
        object: originalActivity,
    };
}

/**
 * Create an Accept activity (for accepting follow requests)
 */
export function createAcceptActivity(
    user: User,
    followActivity: ActivityPubActivity,
    nodeDomain: string,
    activityId: string
): ActivityPubActivity {
    const actorUrl = `https://${nodeDomain}/users/${user.handle}`;

    return {
        '@context': ACTIVITY_STREAMS_CONTEXT,
        id: `https://${nodeDomain}/activities/${activityId}`,
        type: 'Accept',
        actor: actorUrl,
        object: followActivity,
    };
}

/**
 * Escape HTML in content for safety
 */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\n/g, '<br>');
}
