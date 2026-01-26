/**
 * Account NSFW Setting API
 * 
 * POST: Mark/unmark your account as NSFW (content creator setting)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, users } from '@/db';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

const updateSchema = z.object({
  isNsfw: z.boolean(),
});

/**
 * POST /api/settings/account-nsfw
 * 
 * Mark your account as producing NSFW content.
 * All your posts will be treated as NSFW.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { isNsfw } = updateSchema.parse(body);

    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    await db.update(users)
      .set({
        isNsfw,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return NextResponse.json({
      success: true,
      isNsfw,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
