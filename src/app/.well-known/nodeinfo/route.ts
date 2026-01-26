import { NextResponse } from 'next/server';

export async function GET() {
    const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';
    const nodeName = process.env.NEXT_PUBLIC_NODE_NAME || 'Synapsis Node';
    const nodeDescription = process.env.NEXT_PUBLIC_NODE_DESCRIPTION || 'A Synapsis federated social network node';

    return NextResponse.json({
        links: [
            {
                rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1',
                href: `https://${nodeDomain}/nodeinfo/2.1`,
            },
        ],
    });
}
