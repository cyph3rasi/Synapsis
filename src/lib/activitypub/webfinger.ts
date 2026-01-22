/**
 * WebFinger Protocol Implementation
 * 
 * WebFinger is used to discover ActivityPub actors from acct: URIs.
 * See: https://www.rfc-editor.org/rfc/rfc7033
 */

export interface WebFingerResponse {
    subject: string;
    aliases?: string[];
    links: WebFingerLink[];
}

export interface WebFingerLink {
    rel: string;
    type?: string;
    href?: string;
    template?: string;
}

/**
 * Generate a WebFinger response for a local user
 */
export function generateWebFingerResponse(
    handle: string,
    nodeDomain: string
): WebFingerResponse {
    const actorUrl = `https://${nodeDomain}/users/${handle}`;

    return {
        subject: `acct:${handle}@${nodeDomain}`,
        aliases: [actorUrl],
        links: [
            {
                rel: 'self',
                type: 'application/activity+json',
                href: actorUrl,
            },
            {
                rel: 'http://webfinger.net/rel/profile-page',
                type: 'text/html',
                href: actorUrl,
            },
        ],
    };
}

/**
 * Parse a WebFinger resource query
 * @param resource - The resource query (e.g., "acct:user@domain.com")
 * @returns Object with handle and domain, or null if invalid
 */
export function parseWebFingerResource(resource: string): { handle: string; domain: string } | null {
    // Handle acct: URI format
    if (resource.startsWith('acct:')) {
        const parts = resource.slice(5).split('@');
        if (parts.length === 2) {
            return { handle: parts[0], domain: parts[1] };
        }
    }

    // Handle URL format
    try {
        const url = new URL(resource);
        const pathParts = url.pathname.split('/');
        const usersIndex = pathParts.indexOf('users');
        if (usersIndex !== -1 && pathParts[usersIndex + 1]) {
            return { handle: pathParts[usersIndex + 1], domain: url.host };
        }
    } catch {
        // Not a valid URL
    }

    return null;
}

/**
 * Fetch WebFinger data for a remote user
 */
export async function fetchWebFinger(
    handle: string,
    domain: string
): Promise<WebFingerResponse | null> {
    const resource = `acct:${handle}@${domain}`;
    const url = `https://${domain}/.well-known/webfinger?resource=${encodeURIComponent(resource)}`;

    try {
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/jrd+json, application/json',
            },
        });

        if (!response.ok) {
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error('WebFinger fetch failed:', error);
        return null;
    }
}

/**
 * Get the ActivityPub actor URL from a WebFinger response
 */
export function getActorUrlFromWebFinger(webfinger: WebFingerResponse): string | null {
    const selfLink = webfinger.links.find(
        (link) => link.rel === 'self' && link.type === 'application/activity+json'
    );
    return selfLink?.href ?? null;
}
