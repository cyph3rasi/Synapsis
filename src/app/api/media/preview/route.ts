import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        let url = searchParams.get('url');

        if (!url) {
            return NextResponse.json({ error: 'No URL provided' }, { status: 400 });
        }

        // Normalize URL - handle synapse.social etc
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'SynapsisBot/1.0',
            },
            signal: AbortSignal.timeout(5000), // 5s timeout
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch URL: ${response.status}`);
        }

        const html = await response.text();

        // Simple regex extraction for OG tags
        const getMeta = (property: string) => {
            const regex = new RegExp(`<meta[^>]+(?:property|name)=["'](?:og:)?${property}["'][^>]+content=["']([^"']+)["']`, 'i');
            const match = html.match(regex);
            if (match) return match[1];

            // Try different order
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
