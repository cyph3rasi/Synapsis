import { NextResponse } from 'next/server';
import { db } from '@/db';
import { getSession } from '@/lib/auth';
import { isAdminUser } from '@/lib/auth/admin';

export async function GET() {
    try {
        if (!db) {
            return NextResponse.json({ isAdmin: false, user: null });
        }

        const session = await getSession();

        if (!session) {
            return NextResponse.json({ isAdmin: false, user: null });
        }

        return NextResponse.json({
            isAdmin: isAdminUser(session.user),
            user: {
                id: session.user.id,
                handle: session.user.handle,
                displayName: session.user.displayName,
            },
        });
    } catch (error) {
        console.error('Admin status error:', error);
        return NextResponse.json({ isAdmin: false, user: null });
    }
}
