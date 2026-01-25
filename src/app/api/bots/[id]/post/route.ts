/**
 * Bot Operations API Routes
 * 
 * POST /api/bots/[id]/post - Manual post trigger
 * 
 * Requirements: 5.4
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';
import {
  getBotById,
  userOwnsBot,
  BotNotFoundError,
} from '@/lib/bots/botManager';
import {
  triggerPost,
  type TriggerPostOptions,
  type PostCreationErrorCode,
} from '@/lib/bots/posting';

type RouteContext = { params: Promise<{ id: string }> };

// Schema for manual post trigger
const triggerPostSchema = z.object({
  sourceContentId: z.string().uuid().optional(),
  context: z.string().max(1000).optional(),
});

/**
 * POST /api/bots/[id]/post - Manually trigger a post
 * 
 * Requires authentication.
 * Triggers a post for the bot if the user owns the bot.
 * 
 * Request body:
 * - sourceContentId (optional): Specific content item ID to post about
 * - context (optional): Additional context for the post
 * 
 * Response:
 * - success: Whether the post was created successfully
 * - post: The created post (if successful)
 * - error: Error message (if failed)
 * - errorCode: Error code (if failed)
 * 
 * Validates: Requirements 5.4
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;
    
    // Parse request body
    const body = await request.json();
    const data = triggerPostSchema.parse(body);

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

    // Build trigger options
    const options: TriggerPostOptions = {
      sourceContentId: data.sourceContentId,
      context: data.context,
    };

    // Trigger the post
    const result = await triggerPost(id, options);

    // Handle result
    if (!result.success) {
      // Map error codes to HTTP status codes
      const statusCode = getStatusCodeForError(result.errorCode);
      
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          errorCode: result.errorCode,
        },
        { status: statusCode }
      );
    }

    // Return success response
    return NextResponse.json({
      success: true,
      post: {
        id: result.post!.id,
        userId: result.post!.userId,
        content: result.post!.content,
        apId: result.post!.apId,
        apUrl: result.post!.apUrl,
        createdAt: result.post!.createdAt,
      },
      contentItem: result.contentItem ? {
        id: result.contentItem.id,
        title: result.contentItem.title,
        url: result.contentItem.url,
      } : undefined,
    });
  } catch (error) {
    console.error('Trigger post error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      );
    }

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
      { error: 'Failed to trigger post' },
      { status: 500 }
    );
  }
}

/**
 * Map error codes to HTTP status codes.
 * 
 * @param errorCode - The error code from post creation
 * @returns HTTP status code
 */
function getStatusCodeForError(errorCode?: PostCreationErrorCode): number {
  switch (errorCode) {
    case 'BOT_NOT_FOUND':
    case 'CONTENT_NOT_FOUND':
      return 404;
    
    case 'BOT_SUSPENDED':
    case 'BOT_INACTIVE':
      return 403;
    
    case 'NO_API_KEY':
    case 'VALIDATION_FAILED':
      return 400;
    
    case 'RATE_LIMITED':
      return 429;
    
    case 'NO_CONTENT':
      return 422; // Unprocessable Entity
    
    case 'GENERATION_FAILED':
    case 'DATABASE_ERROR':
    case 'FEDERATION_ERROR':
    default:
      return 500;
  }
}
