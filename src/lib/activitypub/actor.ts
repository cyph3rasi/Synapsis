/**
 * ActivityPub Actor Utilities
 * 
 * Handles the serialization of Synapsis users to ActivityPub Actor format.
 * See: https://www.w3.org/TR/activitypub/#actor-objects
 */

import type { users } from '@/db/schema';

type User = typeof users.$inferSelect;

const ACTIVITY_STREAMS_CONTEXT = 'https://www.w3.org/ns/activitystreams';
const SECURITY_CONTEXT = 'https://w3id.org/security/v1';

export interface ActivityPubActor {
    '@context': (string | object)[];
    id: string;
    type: 'Person' | 'Service';
    preferredUsername: string;
    name: string | null;
    summary: string | null;
    url: string;
    inbox: string;
    outbox: string;
    followers: string;
    following: string;
    icon?: {
        type: 'Image';
        mediaType: string;
        url: string;
    };
    image?: {
        type: 'Image';
        mediaType: string;
        url: string;
    };
    publicKey: {
        id: string;
        owner: string;
        publicKeyPem: string;
    };
    endpoints: {
        sharedInbox: string;
    };
    movedTo?: string; // If account has migrated to a new location
    attributedTo?: string; // Bot creator reference
}

/**
 * Convert a Synapsis user to an ActivityPub Actor
 */
export function userToActor(user: User, nodeDomain: string): ActivityPubActor {
    const actorUrl = `https://${nodeDomain}/api/users/${user.handle}`;

    const actor: ActivityPubActor = {
        '@context': [
            ACTIVITY_STREAMS_CONTEXT,
            SECURITY_CONTEXT,
            {
                'manuallyApprovesFollowers': 'as:manuallyApprovesFollowers',
                'toot': 'http://joinmastodon.org/ns#',
                'featured': {
                    '@id': 'toot:featured',
                    '@type': '@id',
                },
            },
        ],
        id: actorUrl,
        type: 'Person',
        preferredUsername: user.handle,
        name: user.displayName,
        summary: user.bio,
        url: actorUrl,
        inbox: `${actorUrl}/inbox`,
        outbox: `${actorUrl}/outbox`,
        followers: `${actorUrl}/followers`,
        following: `${actorUrl}/following`,
        publicKey: {
            id: `${actorUrl}#main-key`,
            owner: actorUrl,
            publicKeyPem: user.publicKey,
        },
        endpoints: {
            sharedInbox: `https://${nodeDomain}/inbox`,
        },
    };

    // Add avatar if present
    if (user.avatarUrl) {
        actor.icon = {
            type: 'Image',
            mediaType: 'image/png', // TODO: detect actual type
            url: user.avatarUrl,
        };
    }

    // Add header if present
    if (user.headerUrl) {
        actor.image = {
            type: 'Image',
            mediaType: 'image/png',
            url: user.headerUrl,
        };
    }

    // Add movedTo if account has migrated
    if (user.movedTo) {
        actor.movedTo = user.movedTo;
    }

    return actor;
}

/**
 * Get the actor URL for a user
 */
export function getActorUrl(handle: string, nodeDomain: string): string {
    return `https://${nodeDomain}/api/users/${handle}`;
}

/**
 * Get the inbox URL for a user
 */
export function getInboxUrl(handle: string, nodeDomain: string): string {
    return `https://${nodeDomain}/api/users/${handle}/inbox`;
}

/**
 * Convert a bot to an ActivityPub Actor (Service type)
 * 
 * Requirements: 9.3, 12.3, 12.4
 */
export function botToActor(
  bot: { handle: string; name: string; bio: string | null; avatarUrl: string | null; publicKey: string },
  creatorHandle: string,
  nodeDomain: string
): ActivityPubActor {
  const actorUrl = `https://${nodeDomain}/api/users/${bot.handle}`;
  const creatorUrl = `https://${nodeDomain}/api/users/${creatorHandle}`;

  const actor: ActivityPubActor = {
    '@context': [
      ACTIVITY_STREAMS_CONTEXT,
      SECURITY_CONTEXT,
      {
        'manuallyApprovesFollowers': 'as:manuallyApprovesFollowers',
        'toot': 'http://joinmastodon.org/ns#',
        'featured': {
          '@id': 'toot:featured',
          '@type': '@id',
        },
      },
    ],
    id: actorUrl,
    type: 'Service', // Bots use Service type
    preferredUsername: bot.handle,
    name: bot.name,
    summary: bot.bio,
    url: actorUrl,
    inbox: `${actorUrl}/inbox`,
    outbox: `${actorUrl}/outbox`,
    followers: `${actorUrl}/followers`,
    following: `${actorUrl}/following`,
    publicKey: {
      id: `${actorUrl}#main-key`,
      owner: actorUrl,
      publicKeyPem: bot.publicKey,
    },
    endpoints: {
      sharedInbox: `https://${nodeDomain}/inbox`,
    },
    attributedTo: creatorUrl, // Reference to bot creator
  };

  // Add avatar if present
  if (bot.avatarUrl) {
    actor.icon = {
      type: 'Image',
      mediaType: 'image/png',
      url: bot.avatarUrl,
    };
  }

  return actor;
}

/**
 * Check if an actor is a bot based on type
 */
export function isBot(actor: ActivityPubActor): boolean {
  return actor.type === 'Service';
}
