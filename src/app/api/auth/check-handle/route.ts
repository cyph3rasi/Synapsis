import { NextRequest, NextResponse } from 'next/server';
import { db, users } from '@/db';
import { eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const handle = searchParams.get('handle')?.toLowerCase().trim();

        if (!handle || handle.length < 3) {
            return NextResponse.json({ available: false, error: 'Handle too short' });
        }

        if (!/^[a-zA-Z0-9_]+$/.test(handle)) {
            return NextResponse.json({ available: false, error: 'Invalid characters' });
        }

        const existingUser = await db.query.users.findFirst({
            where: eq(users.handle, handle),
        });

        return NextResponse.json({
            available: !existingUser,
            handle
        });
    } catch (error) {
        console.error('Check handle error:', error);
        return NextResponse.json({ error: 'Failed to check handle' }, { status: 500 });
    }
}
