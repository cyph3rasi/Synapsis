/**
 * Content Source Detail API Routes
 * 
 * PUT /api/bots/[id]/sources/[sid] - Update content source
 * DELETE /api/bots/[id]/sources/[sid] - Remove content source
 * 
 * Requirements: 4.1, 4.6
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';
import { userOwnsBot, getBotById } from '@/lib/bots/botManager';
import {
  updateSource,
  removeSource,
  getSourceById,
  botOwnsSource,
  ContentSourceValidationError,
  ContentSourceNotFoundError,
  MAX_KEYWORDS,
  MAX_KEYWORD_LENGTH,
} from '@/lib/bots/contentSource';

type RouteContext = { params: Promise<{ id: string; sid: string }> };

// Schema for updating a content source
const updateSourceSchema = z.object({
  url: z.string().url('URL must be a valid HTTP or HTTPS URL').max(2048, 'URL is too long').optional(),
  keywords: z.array(
    z.string()
      .min(1, 'Keyword cannot be empty')
      .max(MAX_KEYWORD_LENGTH, `Keyword is too long (maximum ${MAX_KEYWORD_LENGTH} characters)`)
  )
    .max(MAX_KEYWORDS, `Maximum ${MAX_KEYWORDS} keywords allowed`)
    .optional()
    .nullable(),
  isActive: z.boolean().optional(),
});

/**
 * PUT /api/bots/[id]/sources/[sid] - Update content source
 * 
 * Requires authentication.
 * Updates the content source if the user owns the bot.
 * 
 * Validates: Requirements 4.1
 */
export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: botId, sid: sourceId } = await context.params;
    const body = await request.json();
    const data = updateSourceSchema.parse(body);

    // Check if user owns the bot
    const isOwner = await userOwnsBot(user.id, botId);
    if (!isOwner) {
      // Check if bot exists at all
      const bot = await getBotById(botId);
      if (!bot) {
        return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Check if the source belongs to this bot
    const sourceOwned = await botOwnsSource(botId, sourceId);
    if (!sourceOwned) {
      // Check if source exists at all
      const source = await getSourceById(sourceId);
      if (!source) {
        return NextResponse.json({ error: 'Content source not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Build update object
    const updates: Parameters<typeof updateSource>[1] = {};
    if (data.url !== undefined) updates.url = data.url;
    if (data.keywords !== undefined) updates.keywords = data.keywords ?? undefined;
    if (data.isActive !== undefined) updates.isActive = data.isActive;

    // Update the source
    const updatedSource = await updateSource(sourceId, updates);

    return NextResponse.json({
      success: true,
      source: {
        id: updatedSource.id,
        botId: updatedSource.botId,
        type: updatedSource.type,
        url: updatedSource.url,
        subreddit: updatedSource.subreddit,
        keywords: updatedSource.keywords,
        isActive: updatedSource.isActive,
        lastFetchAt: updatedSource.lastFetchAt,
        lastError: updatedSource.lastError,
        consecutiveErrors: updatedSource.consecutiveErrors,
        createdAt: updatedSource.createdAt,
        updatedAt: updatedSource.updatedAt,
      },
    });
  } catch (error) {
    console.error('Update content source error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (error instanceof ContentSourceNotFoundError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 404 }
      );
    }

    if (error instanceof ContentSourceValidationError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update content source' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/bots/[id]/sources/[sid] - Remove content source
 * 
 * Requires authentication.
 * Removes the content source if the user owns the bot.
 * 
 * Validates: Requirements 4.1
 */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: botId, sid: sourceId } = await context.params;

    // Check if user owns the bot
    const isOwner = await userOwnsBot(user.id, botId);
    if (!isOwner) {
      // Check if bot exists at all
      const bot = await getBotById(botId);
      if (!bot) {
        return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Check if the source belongs to this bot
    const sourceOwned = await botOwnsSource(botId, sourceId);
    if (!sourceOwned) {
      // Check if source exists at all
      const source = await getSourceById(sourceId);
      if (!source) {
        return NextResponse.json({ error: 'Content source not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Remove the source
    await removeSource(sourceId);

    return NextResponse.json({
      success: true,
      message: 'Content source removed successfully',
    });
  } catch (error) {
    console.error('Remove content source error:', error);

    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (error instanceof ContentSourceNotFoundError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to remove content source' },
      { status: 500 }
    );
  }
}
