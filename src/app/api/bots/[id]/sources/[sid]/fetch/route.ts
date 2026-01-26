/**
 * Content Source Fetch API Route
 * 
 * POST /api/bots/[id]/sources/[sid]/fetch - Manually trigger fetch
 * 
 * Requirements: 4.1, 4.6
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { userOwnsBot, getBotById } from '@/lib/bots/botManager';
import {
  getSourceById,
  botOwnsSource,
  ContentSourceNotFoundError,
} from '@/lib/bots/contentSource';
import {
  fetchContentWithRetry,
  FetchResult,
} from '@/lib/bots/contentFetcher';

type RouteContext = { params: Promise<{ id: string; sid: string }> };

/**
 * POST /api/bots/[id]/sources/[sid]/fetch - Manually trigger fetch
 * 
 * Requires authentication.
 * Triggers a manual content fetch for the source if the user owns the bot.
 * 
 * Validates: Requirements 4.1, 4.6
 */
export async function POST(_request: Request, context: RouteContext) {
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

    // Get the source to check if it's active
    const source = await getSourceById(sourceId);
    if (!source) {
      return NextResponse.json({ error: 'Content source not found' }, { status: 404 });
    }

    // Trigger the fetch with retry logic
    const result: FetchResult = await fetchContentWithRetry(sourceId, 3, {
      maxItems: 50,
      timeout: 30000,
    });

    // Get updated source state
    const updatedSource = await getSourceById(sourceId);

    return NextResponse.json({
      success: result.success,
      result: {
        sourceId: result.sourceId,
        itemsFetched: result.itemsFetched,
        itemsStored: result.itemsStored,
        error: result.error,
        warnings: result.warnings,
      },
      source: updatedSource ? {
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
      } : null,
    });
  } catch (error) {
    console.error('Manual fetch error:', error);

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
      { error: 'Failed to fetch content' },
      { status: 500 }
    );
  }
}
