import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { nodes } from '@/db';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/admin';

export async function PATCH(req: NextRequest) {
    try {
        await requireAdmin();
        const data = await req.json();

        const domain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';

        let node = await db.query.nodes.findFirst({
            where: eq(nodes.domain, domain),
        });

        if (!node) {
            [node] = await db.insert(nodes).values({
                domain,
                name: data.name || process.env.NEXT_PUBLIC_NODE_NAME || 'Synapsis Node',
                description: data.description,
                longDescription: data.longDescription,
                rules: data.rules,
                bannerUrl: data.bannerUrl,
                accentColor: data.accentColor,
            }).returning();
        } else {
            [node] = await db.update(nodes)
                .set({
                    name: data.name,
                    description: data.description,
                    longDescription: data.longDescription,
                    rules: data.rules,
                    bannerUrl: data.bannerUrl,
                    updatedAt: new Date(),
                })
                .where(eq(nodes.id, node.id))
                .returning();
        }

        return NextResponse.json({ node });
    } catch (error) {
        console.error('Update node settings error:', error);
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }
}
