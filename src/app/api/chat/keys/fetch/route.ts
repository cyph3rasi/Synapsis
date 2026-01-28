
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const did = searchParams.get('did');
    const nodeDomain = searchParams.get('nodeDomain');

    if (!did) {
        return NextResponse.json({ error: 'Missing DID' }, { status: 400 });
    }

    // Determine target URL
    let bundleUrl = '';

    // If did:web, extracting domain is easy
    if (did.startsWith('did:web:')) {
        const parts = did.split(':');
        if (parts.length >= 4) {
            const domain = parts[2];
            const protocol = domain.includes('localhost') ? 'http' : 'https';
            bundleUrl = `${protocol}://${domain}/.well-known/synapsis/chat/${did}`;
        }
    }

    // If did:synapsis or did:web without built-in logic, check explicit domain
    if (!bundleUrl && nodeDomain) {
        const protocol = nodeDomain.includes('localhost') ? 'http' : 'https';
        bundleUrl = `${protocol}://${nodeDomain}/.well-known/synapsis/chat/${did}`;
    }

    if (!bundleUrl) {
        return NextResponse.json({ error: 'Cannot determine remote node URL. Missing nodeDomain?' }, { status: 400 });
    }

    try {
        console.log(`[Proxy] Fetching keys from: ${bundleUrl}`);
        const res = await fetch(bundleUrl, {
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!res.ok) {
            const text = await res.text();
            console.error(`[Proxy] Remote fetch failed (${res.status}): ${text}`);
            return NextResponse.json({ error: `Remote error: ${res.status}` }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('[Proxy] Fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch remote keys' }, { status: 500 });
    }
}
