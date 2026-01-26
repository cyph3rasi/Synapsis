import { NextResponse } from 'next/server';
import { db, users } from '@/db';
import { count, sql } from 'drizzle-orm';

const requiredEnv = [
    'DATABASE_URL',
    'AUTH_SECRET',
    'NEXT_PUBLIC_NODE_DOMAIN',
    'NEXT_PUBLIC_NODE_NAME',
    'ADMIN_EMAILS',
];

const optionalEnv: string[] = [];

export async function GET() {
    try {
        const envStatus = {
            required: requiredEnv.reduce<Record<string, boolean>>((acc, key) => {
                acc[key] = Boolean(process.env[key]);
                return acc;
            }, {}),
            optional: optionalEnv.reduce<Record<string, boolean>>((acc, key) => {
                acc[key] = Boolean(process.env[key]);
                return acc;
            }, {}),
        };

        if (!db) {
            return NextResponse.json({
                env: envStatus,
                db: { connected: false, schemaReady: false, usersCount: 0 },
            });
        }

        let schemaReady = true;
        let usersCount = 0;

        try {
            await db.execute(sql`select 1 from users limit 1`);
            const [result] = await db.select({ count: count() }).from(users);
            usersCount = Number(result?.count || 0);
        } catch {
            schemaReady = false;
        }

        return NextResponse.json({
            env: envStatus,
            db: { connected: true, schemaReady, usersCount },
        });
    } catch (error) {
        console.error('Install status error:', error);
        return NextResponse.json({ error: 'Failed to check status' }, { status: 500 });
    }
}
