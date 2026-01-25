/**
 * Bot API Key Status Route
 * 
 * GET /api/bots/[id]/api-key/status - Check if API key is configured
 * 
 * Requirements: 2.1, 2.2
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  getBotById,
  userOwnsBot,
  getApiKeyStatus,
  BotNotFoundError,
} from '@/lib/bots/botManager';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/bots/[id]/api-key/status - Check if API key is configured
 * 
 * Requires authentication.
 * Returns whether an API key is configured for the bot (not the key itself).
 * 
 * Validates: Requirements 2.1, 2.2
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;

    // Check if user owns the bot
    const isOwner = await userOwnsBot(user.id, id);
    if (!isOwner) {
      // Check if bot exists at all
      const bot = await getBotById(id);
      if (!bot) {
        return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Get API key status
    const status = await getApiKeyStatus(id);

    return NextResponse.json({
      success: true,
      ...status,
    });
  } catch (error) {
    console.error('Get API key status error:', error);

    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (error instanceof BotNotFoundError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to get API key status' },
      { status: 500 }
    );
  }
}
