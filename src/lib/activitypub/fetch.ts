
import { fetchWebFinger, getActorUrlFromWebFinger } from './webfinger';

export interface ActivityPubProfile {
    id: string;
    type: string;
    preferredUsername: string;
    name?: string;
    summary?: string;
    url?: string;
    inbox?: string;
    outbox?: string;
    followers?: string;
    following?: string;
    endpoints?: {
        sharedInbox?: string;
    };
    icon?: {
        url: string;
    } | string;
    image?: {
        url: string;
    } | string;
    publicKey?: {
        id: string;
        owner: string;
        publicKeyPem: string;
    };
}

/**
 * Fetch a remote ActivityPub actor
 */
export async function fetchRemoteActor(url: string): Promise<ActivityPubProfile | null> {
    try {
        const res = await fetch(url, {
            headers: {
                'Accept': 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
                'User-Agent': 'Synapsis/1.0 (+https://synapsis.social)',
            },
        });

        if (!res.ok) {
            console.error(`Failed to fetch actor: ${res.status} ${res.statusText}`);
            return null;
        }

        const data = await res.json();

        // Basic validation
        if (!data.id || !data.type) {
            return null;
        }

        return data as ActivityPubProfile;
    } catch (error) {
        console.error('Error fetching remote actor:', error);
        return null;
    }
}

/**
 * Resolve a remote user via WebFinger and fetch their profile
 * @param handle The username (without domain)
 * @param domain The domain name
 */
export async function resolveRemoteUser(handle: string, domain: string): Promise<ActivityPubProfile | null> {
    // 1. WebFinger lookup
    const webfinger = await fetchWebFinger(handle, domain);
    if (!webfinger) {
        return null;
    }

    // 2. Get Actor URL
    const actorUrl = getActorUrlFromWebFinger(webfinger);
    if (!actorUrl) {
        return null;
    }

    // 3. Fetch Actor Profile
    return await fetchRemoteActor(actorUrl);
}
