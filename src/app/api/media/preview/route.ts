import { NextRequest, NextResponse } from 'next/server';

/**
 * Check if a URL is from Reddit.
 */
function isRedditUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.hostname.endsWith('reddit.com') || parsed.hostname === 'redd.it';
    } catch {
        return false;
    }
}

/**
 * Fetch preview for Reddit URLs using their oEmbed API.
 */
async function fetchRedditPreview(url: string): Promise<{
    url: string;
    title: string | null;
    description: string | null;
    image: string | null;
} | null> {
    try {
        const oembedUrl = `https://www.reddit.com/oembed?url=${encodeURIComponent(url)}`;
        
        const response = await fetch(oembedUrl, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000),
        });
        
        if (!response.ok) {
            return null;
        }
        
        const data = await response.json();
        
        // Extract title - try title field first, then parse from HTML
        let title = data.title || null;
        if (!title && data.html) {
            const titleMatch = data.html.match(/href="[^"]+">([^<]+)<\/a>/);
            if (titleMatch && titleMatch[1] && titleMatch[1] !== 'Comment') {
                title = titleMatch[1];
            }
        }
        
        // Build description from subreddit info
        let description = null;
        if (data.author_name) {
            description = `Posted by ${data.author_name}`;
        } else if (data.html) {
            const subredditMatch = data.html.match(/r\/([a-zA-Z0-9_]+)/);
            if (subredditMatch) {
                description = `r/${subredditMatch[1]}`;
            }
        }
        
        return {
            url,
            title,
            description,
            image: data.thumbnail_url || null,
        };
    } catch {
        return null;
    }
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        let url = searchParams.get('url');

        if (!url) {
            return NextResponse.json({ error: 'No URL provided' }, { status: 400 });
        }

        // Normalize URL
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        // Use Reddit-specific handler
        if (isRedditUrl(url)) {
            const preview = await fetchRedditPreview(url);
            if (preview) {
                return NextResponse.json(preview);
            }
            // Fall back to URL-only response if oEmbed fails
            return NextResponse.json({
                url,
                title: 'Reddit',
                description: null,
                image: null,
            });
        }

        // Generic OG tag scraping for other sites
        let response;
        try {
            response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; SynapsisBot/1.0; +https://synapsis.social)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                },
                signal: AbortSignal.timeout(5000),
            });
        } catch (fetchError) {
            console.warn(`Fetch failed for URL: ${url}`, fetchError);
            return NextResponse.json({ error: 'Could not reach the URL' }, { status: 404 });
        }

        if (!response.ok) {
            return NextResponse.json({ error: `URL returned status ${response.status}` }, { status: 404 });
        }

        const html = await response.text();

        const getMeta = (property: string) => {
            const regex = new RegExp(`<meta[^>]+(?:property|name)=["'](?:og:)?${property}["'][^>]+content=["']([^"']+)["']`, 'i');
            const match = html.match(regex);
            if (match) return match[1];

            const regexRev = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:)?${property}["']`, 'i');
            const matchRev = html.match(regexRev);
            return matchRev ? matchRev[1] : null;
        };

        const title = getMeta('title') || html.match(/<title>([^<]+)<\/title>/i)?.[1];
        const description = getMeta('description');
        const image = getMeta('image');

        return NextResponse.json({
            url,
            title: title?.trim() || url,
            description: description?.trim() || null,
            image: image?.trim() || null,
        });
    } catch (error) {
        console.error('Link preview error:', error);
        return NextResponse.json({ error: 'Failed to fetch preview' }, { status: 500 });
    }
}
