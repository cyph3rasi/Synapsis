
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const did = searchParams.get('did');
    const nodeDomain = searchParams.get('nodeDomain');

    if (!did) {
        return NextResponse.json({ error: 'Missing DID' }, { status: 400 });
    }

    const handle = searchParams.get('handle');

    // Helper to fetch and check
    const tryFetch = async (url: string) => {
        console.log(`[Proxy] Fetching keys from: ${url}`);
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (res.ok) return await res.json();
        const text = await res.text();
        console.warn(`[Proxy] Fetch failed for ${url} (${res.status}): ${text}`);
        return null;
    };

    // 1. Try Primary DID
    let primaryUrl = '';
    // If did:web, extracting domain is easy
    if (did.startsWith('did:web:')) {
        const parts = did.split(':');
        if (parts.length >= 4) {
            const domain = parts[2];
            const protocol = domain.includes('localhost') ? 'http' : 'https';
            primaryUrl = `${protocol}://${domain}/.well-known/synapsis/chat/${did}`;
        }
    } else if (nodeDomain) {
        const protocol = nodeDomain.includes('localhost') ? 'http' : 'https';
        primaryUrl = `${protocol}://${nodeDomain}/.well-known/synapsis/chat/${did}`;
    }

    if (primaryUrl) {
        const data = await tryFetch(primaryUrl);
        if (data) return NextResponse.json(data);
    }

    // 2. Try Fallback: did:web (if handle and domain provided)
    // The remote user might be indexed by did:web even if we know them as did:synapsis
    if (nodeDomain && handle) {
        const didWeb = `did:web:${nodeDomain}:${handle}`;
        const protocol = nodeDomain.includes('localhost') ? 'http' : 'https';
        const fallbackUrl = `${protocol}://${nodeDomain}/.well-known/synapsis/chat/${didWeb}`;

        console.log(`[Proxy] Primary failed. Trying fallback: ${didWeb}`);
        const data = await tryFetch(fallbackUrl);
        if (data) return NextResponse.json(data);
    }

    return NextResponse.json({ error: 'Remote keys not found (checked primary and fallback)' }, { status: 404 });
}
