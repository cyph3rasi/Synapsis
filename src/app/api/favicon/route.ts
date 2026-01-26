import { NextResponse } from 'next/server';
import { db, nodes } from '@/db';
import { eq } from 'drizzle-orm';

export async function GET() {
    try {
        if (!db) {
            // Redirect to default favicon
            return NextResponse.redirect(new URL('/favicon.png', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'));
        }

        const domain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';
        const node = await db.query.nodes.findFirst({
            where: eq(nodes.domain, domain),
            columns: { faviconUrl: true },
        });

        if (node?.faviconUrl) {
            // Redirect to custom favicon
            return NextResponse.redirect(node.faviconUrl);
        }

        // Redirect to default favicon
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `https://${domain}`;
        return NextResponse.redirect(new URL('/favicon.png', baseUrl));
    } catch (error) {
        console.error('Favicon error:', error);
        return NextResponse.redirect(new URL('/favicon.png', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'));
    }
}
