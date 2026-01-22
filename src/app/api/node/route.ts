import { NextResponse } from 'next/server';
import { db } from '@/db';
import { nodes } from '@/db';
import { eq } from 'drizzle-orm';

export async function GET() {
    try {
        if (!db) return NextResponse.json({});

        const domain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';
        const node = await db.query.nodes.findFirst({
            where: eq(nodes.domain, domain),
        });

        if (!node) {
            return NextResponse.json({
                name: process.env.NEXT_PUBLIC_NODE_NAME || 'Synapsis Node',
                description: process.env.NEXT_PUBLIC_NODE_DESCRIPTION || 'A federated social network node.',
                accentColor: process.env.NEXT_PUBLIC_ACCENT_COLOR || '#00D4AA',
                domain,
            });
        }

        return NextResponse.json(node);
    } catch (error) {
        console.error('Node info error:', error);
        return NextResponse.json({
            name: process.env.NEXT_PUBLIC_NODE_NAME || 'Synapsis Node',
            description: process.env.NEXT_PUBLIC_NODE_DESCRIPTION || 'A federated social network node.',
        });
    }
}
