import { NextResponse } from 'next/server';
import { db, posts, users } from '@/db';
import { eq, desc, and } from 'drizzle-orm';
import { resolveRemoteUser } from '@/lib/activitypub/fetch';

type RouteContext = { params: Promise<{ handle: string }> };

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
    // Replace <br> with spaces to avoid words running together.
    html = html.replace(/<br\s*\/?>/gi, ' ');
    // Replace anchor tags with their hrefs (preferred) or inner text.
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

const fetchLinkPreview = async (url: string, origin: string) => {
    try {
        const previewUrl = new URL('/api/media/preview', origin);
        previewUrl.searchParams.set('url', url);
        const res = await fetch(previewUrl.toString(), {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return {
            url: data?.url || url,
            title: data?.title || null,
            description: data?.description || null,
            image: data?.image || null,
        };
    } catch {
        return null;
    }
};

const stripFirstUrl = (text: string, url: string) => {
    const idx = text.indexOf(url);
    if (idx === -1) return text;
    const before = text.slice(0, idx).trimEnd();
    const after = text.slice(idx + url.length).trimStart();
    return `${before} ${after}`.trim();
};

// Normalize content for deduplication (strip HTML entities, URLs, whitespace)
const normalizeForDedup = (content: string): string => {
    return content
        .replace(/&[a-z]+;/gi, '') // Remove HTML entities like &lsquo;
        .replace(/&#\d+;/g, '') // Remove numeric entities
        .replace(/https?:\/\/[^\s]+/gi, '') // Remove URLs
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .replace(/\s+/g, ' ') // Normalize whitespace
        .toLowerCase()
        .trim()
        .slice(0, 100); // Compare first 100 chars
};

const parseRemoteHandle = (handle: string) => {
    const clean = handle.toLowerCase().replace(/^@/, '');
    const parts = clean.split('@').filter(Boolean);
    if (parts.length === 2) {
        return { handle: parts[0], domain: parts[1] };
    }
    return null;
};

const fetchOutboxItems = async (outboxUrl: string, limit: number) => {
    const res = await fetch(outboxUrl, {
        headers: {
            'Accept': 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
        },
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
            });
            if (!pageRes.ok) return [];
            const page = await pageRes.json();
            return page?.orderedItems || page?.items || [];
        }
        return first?.orderedItems || first?.items || [];
    }
    const items = data?.orderedItems || data?.items || [];
    return items.slice(0, limit);
};

export async function GET(request: Request, context: RouteContext) {
    try {
        const { handle } = await context.params;
        const cleanHandle = handle.toLowerCase().replace(/^@/, '');
        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 50);

        const remote = parseRemoteHandle(handle);

        if (!db) {
            if (!remote) {
                return NextResponse.json({ posts: [], nextCursor: null });
            }
            const remoteProfile = await resolveRemoteUser(remote.handle, remote.domain);
            if (!remoteProfile?.outbox) {
                return NextResponse.json({ posts: [] });
            }
            const outboxItems = await fetchOutboxItems(remoteProfile.outbox, limit);
            const authorHandle = `${remoteProfile.preferredUsername || remote.handle}@${remote.domain}`;
            const author = {
                id: remoteProfile.id || `remote:${authorHandle}`,
                handle: authorHandle,
                displayName: sanitizeText(remoteProfile.name) || remoteProfile.preferredUsername || remote.handle,
                avatarUrl: typeof remoteProfile.icon === 'string' ? remoteProfile.icon : remoteProfile.icon?.url,
                bio: sanitizeText(remoteProfile.summary),
            };
            const posts = [];
            const seenIds = new Set<string>();
            const seenContentKeys = new Set<string>(); // For content-based dedup
            const origin = new URL(request.url).origin;
            for (const item of outboxItems) {
                const activity = item?.type === 'Create' ? item : null;
                const object = activity?.object;
                if (!object || typeof object === 'string' || object.type !== 'Note') {
                    continue;
                }
                // Deduplicate by object ID
                const postId = object.id || activity.id;
                if (seenIds.has(postId)) {
                    continue;
                }

                // Content-based dedup: similar content = skip
                const contentKey = normalizeForDedup(object.content || '');
                if (seenContentKeys.has(contentKey)) {
                    continue;
                }

                seenIds.add(postId);
                seenContentKeys.add(contentKey);

                const attachments = Array.isArray(object.attachment) ? object.attachment : [];
                const { text, urls } = extractTextAndUrls(object.content);
                const normalizedUrl = urls.length > 0 ? normalizeUrl(urls[0]) : null;
                const linkPreview = normalizedUrl ? await fetchLinkPreview(normalizedUrl, origin) : null;
                const contentText = linkPreview && normalizedUrl ? stripFirstUrl(text, normalizedUrl) : text;
                posts.push({
                    id: postId,
                    content: contentText || '',
                    createdAt: object.published || activity.published || new Date().toISOString(),
                    likesCount: 0,
                    repostsCount: 0,
                    repliesCount: 0,
                    author,
                    media: attachments
                        .filter((attachment: any) => attachment?.url)
                        .map((attachment: any, index: number) => ({
                            id: `${postId || 'media'}-${index}`,
                            url: attachment.url,
                            altText: sanitizeText(attachment.name) || null,
                        })),
                    linkPreviewUrl: linkPreview?.url || normalizedUrl,
                    linkPreviewTitle: linkPreview?.title || null,
                    linkPreviewDescription: linkPreview?.description || null,
                    linkPreviewImage: linkPreview?.image || null,
                });
            }
            return NextResponse.json({ posts, nextCursor: null });
        }

        // Find the user
        const user = await db.query.users.findFirst({
            where: eq(users.handle, cleanHandle),
        });

        if (!user) {
            if (!remote) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 });
            }
            const remoteProfile = await resolveRemoteUser(remote.handle, remote.domain);
            if (!remoteProfile?.outbox) {
                return NextResponse.json({ posts: [] });
            }

            const outboxItems = await fetchOutboxItems(remoteProfile.outbox, limit);
            const authorHandle = `${remoteProfile.preferredUsername || remote.handle}@${remote.domain}`;
            const author = {
                id: remoteProfile.id || `remote:${authorHandle}`,
                handle: authorHandle,
                displayName: sanitizeText(remoteProfile.name) || remoteProfile.preferredUsername || remote.handle,
                avatarUrl: typeof remoteProfile.icon === 'string' ? remoteProfile.icon : remoteProfile.icon?.url,
                bio: sanitizeText(remoteProfile.summary),
            };
            const posts = [];
            const seenIds = new Set<string>();
            const seenContentKeys = new Set<string>(); // For content-based dedup
            const origin = new URL(request.url).origin;
            for (const item of outboxItems) {
                const activity = item?.type === 'Create' ? item : null;
                const object = activity?.object;
                if (!object || typeof object === 'string' || object.type !== 'Note') {
                    continue;
                }
                // Deduplicate by object ID
                const postId = object.id || activity.id;
                if (seenIds.has(postId)) {
                    continue;
                }

                // Content-based dedup: similar content = skip
                const contentKey = normalizeForDedup(object.content || '');
                if (seenContentKeys.has(contentKey)) {
                    continue;
                }

                seenIds.add(postId);
                seenContentKeys.add(contentKey);

                const attachments = Array.isArray(object.attachment) ? object.attachment : [];
                const { text, urls } = extractTextAndUrls(object.content);
                const normalizedUrl = urls.length > 0 ? normalizeUrl(urls[0]) : null;
                const linkPreview = normalizedUrl ? await fetchLinkPreview(normalizedUrl, origin) : null;
                const contentText = linkPreview && normalizedUrl ? stripFirstUrl(text, normalizedUrl) : text;
                posts.push({
                    id: postId,
                    content: contentText || '',
                    createdAt: object.published || activity.published || new Date().toISOString(),
                    likesCount: 0,
                    repostsCount: 0,
                    repliesCount: 0,
                    author,
                    media: attachments
                        .filter((attachment: any) => attachment?.url)
                        .map((attachment: any, index: number) => ({
                            id: `${postId || 'media'}-${index}`,
                            url: attachment.url,
                            altText: sanitizeText(attachment.name) || null,
                        })),
                    linkPreviewUrl: linkPreview?.url || normalizedUrl,
                    linkPreviewTitle: linkPreview?.title || null,
                    linkPreviewDescription: linkPreview?.description || null,
                    linkPreviewImage: linkPreview?.image || null,
                });
            }

            return NextResponse.json({
                posts,
                nextCursor: null,
            });
        }
        if (user.isSuspended) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Get user's posts
        const userPosts = await db.query.posts.findMany({
            where: and(eq(posts.userId, user.id), eq(posts.isRemoved, false)),
            with: {
                author: true,
                media: true,
                replyTo: {
                    with: { author: true },
                },
            },
            orderBy: [desc(posts.createdAt)],
            limit,
        });

        return NextResponse.json({
            posts: userPosts,
            nextCursor: userPosts.length === limit ? userPosts[userPosts.length - 1]?.id : null,
        });
    } catch (error) {
        console.error('Get user posts error:', error);
        return NextResponse.json({ error: 'Failed to get posts' }, { status: 500 });
    }
}
