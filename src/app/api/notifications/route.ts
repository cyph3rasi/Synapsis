import { NextResponse } from 'next/server';
import { db, notifications } from '@/db';
import { requireAuth } from '@/lib/auth';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';

const markSchema = z.object({
    ids: z.array(z.string().uuid()).optional(),
    all: z.boolean().optional(),
});

export async function GET(request: Request) {
    try {
        const user = await requireAuth();

        if (!db) {
            return NextResponse.json({ notifications: [] });
        }

        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 50);
        const unreadOnly = searchParams.get('unread') === 'true';

        const conditions = [eq(notifications.userId, user.id)];
        if (unreadOnly) {
            conditions.push(isNull(notifications.readAt));
        }

        const rows = await db.query.notifications.findMany({
            where: and(...conditions),
            with: {
                actor: true,
                post: true,
            },
            orderBy: [desc(notifications.createdAt)],
            limit,
        });

        type ActorInfo = { id: string; handle: string; displayName: string | null; avatarUrl: string | null };
        type PostInfo = { id: string; content: string };

        const payload = rows.map((row) => {
            const actor = row.actor as ActorInfo | null;
            const post = row.post as PostInfo | null;
            return {
                id: row.id,
                type: row.type,
                createdAt: row.createdAt,
                readAt: row.readAt,
                actor: actor ? {
                    id: actor.id,
                    handle: actor.handle,
                    displayName: actor.displayName,
                    avatarUrl: actor.avatarUrl,
                } : null,
                post: post ? {
                    id: post.id,
                    content: post.content,
                } : null,
            };
        });

        return NextResponse.json({ notifications: payload });
    } catch (error) {
        if (error instanceof Error && error.message === 'Authentication required') {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        console.error('Notifications fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const user = await requireAuth();

        if (!db) {
            return NextResponse.json({ error: 'Database not available' }, { status: 503 });
        }

        const body = await request.json();
        const data = markSchema.parse(body);

        if (!data.all && (!data.ids || data.ids.length === 0)) {
            return NextResponse.json({ error: 'No notifications specified' }, { status: 400 });
        }

        const where = data.all
            ? eq(notifications.userId, user.id)
            : and(
                eq(notifications.userId, user.id),
                inArray(notifications.id, data.ids || [])
            );

        await db.update(notifications)
            .set({ readAt: new Date() })
            .where(where);

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
        }
        if (error instanceof Error && error.message === 'Authentication required') {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        console.error('Notifications update error:', error);
        return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
    }
}
