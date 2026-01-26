import { NextResponse } from 'next/server';
import { z } from 'zod';
import { upsertHandleEntries } from '@/lib/federation/handles';

const payloadSchema = z.object({
    handles: z.array(z.object({
        handle: z.string().min(1),
        did: z.string().min(1),
        nodeDomain: z.string().min(1),
        updatedAt: z.string().optional(),
    })).min(1),
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const data = payloadSchema.parse(body);

        const result = await upsertHandleEntries(data.handles);

        return NextResponse.json({
            success: true,
            added: result.added,
            updated: result.updated,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid payload', details: error.issues }, { status: 400 });
        }
        console.error('Handle ingest error:', error);
        return NextResponse.json({ error: 'Failed to ingest handles' }, { status: 500 });
    }
}
