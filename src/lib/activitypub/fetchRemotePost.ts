import { db, remotePosts } from '@/db';
import { eq } from 'drizzle-orm';

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

function parsePostIdFromUrl(url: string): string | null {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(Boolean);

        const postsIndex = pathParts.indexOf('posts');
        if (postsIndex !== -1 && pathParts[postsIndex + 1]) {
            return pathParts[postsIndex + 1];
        }

        const objectsIndex = pathParts.indexOf('objects');
        if (objectsIndex !== -1 && pathParts[objectsIndex + 1]) {
            return pathParts[objectsIndex + 1];
        }

        if (pathParts.includes('objects') && pathParts.includes('users')) {
            const lastPart = pathParts[pathParts.length - 1];
            return lastPart;
        }

        return null;
    } catch {
        return null;
    }
}

async function fetchRemotePostFromUrl(url: string): Promise<ActivityPubNote | null> {
    try {
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
                'User-Agent': 'Synapsis/1.0 (+https://synapsis.social)',
            },
        });

        if (!response.ok) {
            console.error(`Failed to fetch remote post: ${response.status}`);
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching remote post:', error);
        return null;
    }
}

async function cacheRemotePost(apNote: ActivityPubNote, nodeDomain: string): Promise<boolean> {
    try {
        const postId = parsePostIdFromUrl(apNote.url);
        if (!postId) {
            console.error('Could not parse post ID from:', apNote.url);
            return false;
        }

        const existing = await db.query.remotePosts.findFirst({
            where: eq(remotePosts.apId, apNote.id),
        });

        if (existing) {
            console.log('Remote post already cached:', postId);
            return true;
        }

        let mediaJson: string | null = null;
        if (apNote.attachment && apNote.attachment.length > 0) {
            mediaJson = JSON.stringify(apNote.attachment);
        }

        const authorUrl = new URL(apNote.attributedTo);
        const authorHandle = authorUrl.pathname.split('/').pop() || apNote.attributedTo;
        const authorDomain = authorUrl.hostname;

        await db.insert(remotePosts).values({
            id: crypto.randomUUID(),
            apId: apNote.id,
            authorHandle: authorHandle,
            authorActorUrl: apNote.attributedTo,
            authorDisplayName: apNote.attributedTo === authorHandle ? null : authorHandle,
            authorAvatarUrl: null,
            content: apNote.content || '',
            publishedAt: apNote.published ? new Date(apNote.published) : new Date(),
            linkPreviewUrl: null,
            linkPreviewTitle: null,
            linkPreviewDescription: null,
            linkPreviewImage: null,
            mediaJson: mediaJson,
            fetchedAt: new Date(),
        });

        console.log('Cached remote post:', postId);
        return true;
    } catch (error) {
        console.error('Error caching remote post:', error);
        return false;
    }
}

function cachedRemotePostToFrontend(remotePost: any) {
    let media = null;
    try {
        if (remotePost.mediaJson) {
            media = JSON.parse(remotePost.mediaJson);
        }
    } catch {
    }

    return {
        id: remotePost.id,
        content: remotePost.content,
        createdAt: remotePost.publishedAt.toISOString(),
        likesCount: 0,
        repostsCount: 0,
        repliesCount: 0,
        author: {
            id: remotePost.authorHandle,
            handle: remotePost.authorHandle,
            displayName: remotePost.authorDisplayName || remotePost.authorHandle,
            avatarUrl: remotePost.authorAvatarUrl,
            bio: null,
            isRemote: true,
        },
        media: media || undefined,
        linkPreviewUrl: remotePost.linkPreviewUrl,
        linkPreviewTitle: remotePost.linkPreviewTitle,
        linkPreviewDescription: remotePost.linkPreviewDescription,
        linkPreviewImage: remotePost.linkPreviewImage,
        isLiked: false,
        isReposted: false,
    };
}

export async function fetchRemotePost(postUrl: string, nodeDomain: string): Promise<{ post: any | null; isCached: boolean }> {
    const apNote = await fetchRemotePostFromUrl(postUrl);
    if (!apNote) {
        return { post: null, isCached: false };
    }

    const cached = await cacheRemotePost(apNote, nodeDomain);
    if (!cached) {
        return { post: null, isCached: false };
    }

    const frontendPost = cachedRemotePostToFrontend(apNote);

    return { post: frontendPost, isCached: true };
}
