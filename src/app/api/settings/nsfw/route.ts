/**
 * NSFW Settings API
 * 
 * GET: Get current user's NSFW settings
 * POST: Update NSFW settings (requires age verification for enabling)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, users } from '@/db';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

const updateSchema = z.object({
  nsfwEnabled: z.boolean(),
  confirmAge: z.boolean().optional(), // Must be true when enabling NSFW
});

/**
 * GET /api/settings/nsfw
 * 
 * Returns current user's NSFW settings
 */
export async function GET() {
  try {
    const user = await requireAuth();

    return NextResponse.json({
      nsfwEnabled: user.nsfwEnabled,
      ageVerifiedAt: user.ageVerifiedAt?.toISOString() || null,
      isNsfw: user.isNsfw, // Whether their account is marked NSFW
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to get settings' }, { status: 500 });
  }
}

/**
 * POST /api/settings/nsfw
 * 
 * Update NSFW settings. Enabling requires age confirmation.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { nsfwEnabled, confirmAge } = updateSchema.parse(body);

    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    // If enabling NSFW and not already verified, require age confirmation
    if (nsfwEnabled && !user.ageVerifiedAt) {
      if (!confirmAge) {
        return NextResponse.json({
          error: 'Age verification required',
          requiresAgeConfirmation: true,
          message: 'You must confirm you are 18 or older to view NSFW content',
        }, { status: 400 });
      }

      // Record age verification
      await db.update(users)
        .set({
          nsfwEnabled: true,
          ageVerifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      return NextResponse.json({
        success: true,
        nsfwEnabled: true,
        ageVerifiedAt: new Date().toISOString(),
      });
    }

    // Update preference (already verified or disabling)
    await db.update(users)
      .set({
        nsfwEnabled,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return NextResponse.json({
      success: true,
      nsfwEnabled,
      ageVerifiedAt: user.ageVerifiedAt?.toISOString() || null,
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
