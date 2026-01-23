import { db, remotePosts } from '@/db';
import { eq } from 'drizzle-orm';

interface RemoteProfile {
    id: string;
    preferredUsername?: string;
    name?: string;
    icon?: string | { url?: string };
    summary?: string;
    outbox?: string;
}

interface OutboxItem {
    type?: string;
    object?: {
        id?: string;
        type?: string;
        content?: string;
        published?: string;
        attachment?: Array<{ url?: string; name?: string }>;
    };
    id?: string;
    published?: string;
}

const decodeEntities = (value: string) =>
    value
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

const sanitizeText = (value?: string | null) => {
    if (!value) return null;
    const withoutTags = value.replace(/<[^>]*>/g, ' ');
    const decoded = decodeEntities(withoutTags);
    return decoded.replace(/\s+/g, ' ').trim() || null;
};

const extractTextAndUrls = (value?: string | null) => {
    if (!value) return { text: '', urls: [] as string[] };
    let html = value;
    html = html.replace(/<br\s*\/?>/gi, ' ');
    html = html.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, (_, href, text) => {
        const cleanedHref = decodeEntities(String(href));
        const cleanedText = decodeEntities(String(text)).replace(/<[^>]*>/g, ' ').trim();
        return cleanedHref || cleanedText;
    });
    const withoutTags = html.replace(/<[^>]*>/g, ' ');
    const decoded = decodeEntities(withoutTags);
    const text = decoded.replace(/\s+/g, ' ').trim();
    const urls = Array.from(text.matchAll(/https?:\/\/[^\s]+/gi)).map((match) => match[0]);
    return { text, urls };
};

const normalizeUrl = (value: string) => value.replace(/[)\].,!?]+$/, '');

const stripFirstUrl = (text: string, url: string) => {
    const idx = text.indexOf(url);
    if (idx === -1) return text;
    const before = text.slice(0, idx).trimEnd();
    const after = text.slice(idx + url.length).trimStart();
    return `${before} ${after}`.trim();
};

const fetchOutboxItems = async (outboxUrl: string, limit: number = 20): Promise<OutboxItem[]> => {
    try {
        const res = await fetch(outboxUrl, {
            headers: {
                'Accept': 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
            },
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return [];
        const data = await res.json();
        const first = data?.first;
        if (first) {
            if (typeof first === 'string') {
                const pageRes = await fetch(first, {
                    headers: {
                        'Accept': 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
                    },
                    signal: AbortSignal.timeout(10000),
                });
                if (!pageRes.ok) return [];
                const page = await pageRes.json();
                return page?.orderedItems || page?.items || [];
            }
            return first?.orderedItems || first?.items || [];
        }
        const items = data?.orderedItems || data?.items || [];
        return items.slice(0, limit);
    } catch (error) {
        console.error('Error fetching outbox:', error);
        return [];
    }
};

export async function cacheRemoteUserPosts(
    remoteProfile: RemoteProfile,
    authorHandle: string, // e.g., user@mastodon.social
    origin: string, // Used for link previews
    limit: number = 20
): Promise<{ cached: number; errors: number }> {
    if (!remoteProfile.outbox) {
        return { cached: 0, errors: 0 };
    }

    const outboxItems = await fetchOutboxItems(remoteProfile.outbox, limit);
    if (outboxItems.length === 0) {
        return { cached: 0, errors: 0 };
    }

    const authorActorUrl = remoteProfile.id;
    const authorDisplayName = remoteProfile.name || remoteProfile.preferredUsername || authorHandle;
    const authorAvatarUrl = typeof remoteProfile.icon === 'string'
        ? remoteProfile.icon
        : remoteProfile.icon?.url;

    let cached = 0;
    let errors = 0;
    const seenIds = new Set<string>();

    for (const item of outboxItems) {
        try {
            const activity = item?.type === 'Create' ? item : null;
            const object = activity?.object;
            if (!object || typeof object === 'string' || object.type !== 'Note') {
                continue;
            }

            const apId = object.id || activity?.id;
            if (!apId || seenIds.has(apId)) {
                continue;
            }
            seenIds.add(apId);

            // Check if already cached
            const existing = await db.query.remotePosts.findFirst({
                where: eq(remotePosts.apId, apId),
            });
            if (existing) {
                continue;
            }

            const attachments = Array.isArray(object.attachment) ? object.attachment : [];
            const { text, urls } = extractTextAndUrls(object.content);
            const normalizedUrl = urls.length > 0 ? normalizeUrl(urls[0]) : null;

            // Fetch link preview if there's a URL
            let linkPreview: { url?: string; title?: string | null; description?: string | null; image?: string | null } | null = null;
            if (normalizedUrl) {
                try {
                    const previewUrl = new URL('/api/media/preview', origin);
                    previewUrl.searchParams.set('url', normalizedUrl);
                    const res = await fetch(previewUrl.toString(), {
                        headers: { 'Accept': 'application/json' },
                        signal: AbortSignal.timeout(4000),
                    });
                    if (res.ok) {
                        const data = await res.json();
                        linkPreview = {
                            url: data?.url || normalizedUrl,
                            title: data?.title || null,
                            description: data?.description || null,
                            image: data?.image || null,
                        };
                    }
                } catch {
                    // Link preview fetch failed, continue without it
                }
            }

            const contentText = linkPreview && normalizedUrl ? stripFirstUrl(text, normalizedUrl) : text;
            const mediaJson = attachments
                .filter((a: { url?: string }) => a?.url)
                .map((a: { url?: string; name?: string }) => ({
                    url: a.url,
                    altText: sanitizeText(a.name) || null,
                }));

            const publishedAt = object.published ? new Date(object.published) : new Date();

            await db.insert(remotePosts).values({
                apId,
                authorHandle,
                authorActorUrl,
                authorDisplayName,
                authorAvatarUrl: authorAvatarUrl || null,
                content: contentText || '',
                publishedAt,
                linkPreviewUrl: linkPreview?.url || normalizedUrl,
                linkPreviewTitle: linkPreview?.title || null,
                linkPreviewDescription: linkPreview?.description || null,
                linkPreviewImage: linkPreview?.image || null,
                mediaJson: mediaJson.length > 0 ? JSON.stringify(mediaJson) : null,
            });

            cached++;
        } catch (error) {
            console.error('Error caching post:', error);
            errors++;
        }
    }

    return { cached, errors };
}
