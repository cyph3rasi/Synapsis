/**
 * Bot Operations API Route Tests
 * 
 * Tests for POST /api/bots/[id]/post
 * 
 * Requirements: 5.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import * as auth from '@/lib/auth';
import * as botManager from '@/lib/bots/botManager';
import * as posting from '@/lib/bots/posting';

// Mock modules
vi.mock('@/lib/auth');
vi.mock('@/lib/bots/botManager');
vi.mock('@/lib/bots/posting');

describe('POST /api/bots/[id]/post', () => {
  const mockUser = {
    id: 'user-123',
    handle: 'testuser',
    email: 'test@example.com',
  };

  const mockBot = {
    id: 'bot-123',
    userId: 'user-123',
    name: 'Test Bot',
    handle: 'testbot',
    isActive: true,
    isSuspended: false,
  };

  const mockPost = {
    id: 'post-123',
    userId: 'user-123',
    content: 'Test post content',
    apId: 'https://example.com/posts/post-123',
    apUrl: 'https://example.com/posts/post-123',
    createdAt: new Date(),
  };

  const mockContentItem = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    sourceId: '550e8400-e29b-41d4-a716-446655440001',
    title: 'Test Article',
    content: 'Test content',
    url: 'https://example.com/article',
    publishedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.requireAuth).mockResolvedValue(mockUser as any);
  });

  it('should successfully trigger a post', async () => {
    // Mock ownership check
    vi.mocked(botManager.userOwnsBot).mockResolvedValue(true);

    // Mock successful post creation
    vi.mocked(posting.triggerPost).mockResolvedValue({
      success: true,
      post: mockPost as any,
      contentItem: mockContentItem,
    });

    // Create request
    const request = new Request('http://localhost/api/bots/bot-123/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const context = {
      params: Promise.resolve({ id: 'bot-123' }),
    };

    // Call the route
    const response = await POST(request, context);
    const data = await response.json();

    // Verify response
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.post).toBeDefined();
    expect(data.post.id).toBe('post-123');
    expect(data.contentItem).toBeDefined();
    expect(data.contentItem.id).toBe('550e8400-e29b-41d4-a716-446655440000');

    // Verify triggerPost was called correctly
    expect(posting.triggerPost).toHaveBeenCalledWith('bot-123', {
      sourceContentId: undefined,
      context: undefined,
    });
  });

  it('should trigger a post with specific content ID', async () => {
    // Mock ownership check
    vi.mocked(botManager.userOwnsBot).mockResolvedValue(true);

    // Mock successful post creation
    vi.mocked(posting.triggerPost).mockResolvedValue({
      success: true,
      post: mockPost as any,
      contentItem: mockContentItem,
    });

    // Create request with content ID
    const request = new Request('http://localhost/api/bots/bot-123/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceContentId: '550e8400-e29b-41d4-a716-446655440000',
        context: 'Test context',
      }),
    });

    const context = {
      params: Promise.resolve({ id: 'bot-123' }),
    };

    // Call the route
    const response = await POST(request, context);
    const data = await response.json();

    // Verify response
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify triggerPost was called with correct options
    expect(posting.triggerPost).toHaveBeenCalledWith('bot-123', {
      sourceContentId: '550e8400-e29b-41d4-a716-446655440000',
      context: 'Test context',
    });
  });

  it('should return 401 if not authenticated', async () => {
    // Mock authentication failure
    vi.mocked(auth.requireAuth).mockRejectedValue(new Error('Authentication required'));

    // Create request
    const request = new Request('http://localhost/api/bots/bot-123/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const context = {
      params: Promise.resolve({ id: 'bot-123' }),
    };

    // Call the route
    const response = await POST(request, context);
    const data = await response.json();

    // Verify response
    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });

  it('should return 403 if user does not own the bot', async () => {
    // Mock ownership check - user does not own bot
    vi.mocked(botManager.userOwnsBot).mockResolvedValue(false);
    vi.mocked(botManager.getBotById).mockResolvedValue(mockBot as any);

    // Create request
    const request = new Request('http://localhost/api/bots/bot-123/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const context = {
      params: Promise.resolve({ id: 'bot-123' }),
    };

    // Call the route
    const response = await POST(request, context);
    const data = await response.json();

    // Verify response
    expect(response.status).toBe(403);
    expect(data.error).toBe('Not authorized');
  });

  it('should return 404 if bot does not exist', async () => {
    // Mock ownership check - bot not found
    vi.mocked(botManager.userOwnsBot).mockResolvedValue(false);
    vi.mocked(botManager.getBotById).mockResolvedValue(null);

    // Create request
    const request = new Request('http://localhost/api/bots/bot-123/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const context = {
      params: Promise.resolve({ id: 'bot-123' }),
    };

    // Call the route
    const response = await POST(request, context);
    const data = await response.json();

    // Verify response
    expect(response.status).toBe(404);
    expect(data.error).toBe('Bot not found');
  });

  it('should return 429 if rate limited', async () => {
    // Mock ownership check
    vi.mocked(botManager.userOwnsBot).mockResolvedValue(true);

    // Mock rate limit error
    vi.mocked(posting.triggerPost).mockResolvedValue({
      success: false,
      error: 'Rate limit exceeded',
      errorCode: 'RATE_LIMITED',
    });

    // Create request
    const request = new Request('http://localhost/api/bots/bot-123/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const context = {
      params: Promise.resolve({ id: 'bot-123' }),
    };

    // Call the route
    const response = await POST(request, context);
    const data = await response.json();

    // Verify response
    expect(response.status).toBe(429);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Rate limit exceeded');
    expect(data.errorCode).toBe('RATE_LIMITED');
  });

  it('should return 403 if bot is suspended', async () => {
    // Mock ownership check
    vi.mocked(botManager.userOwnsBot).mockResolvedValue(true);

    // Mock suspended bot error
    vi.mocked(posting.triggerPost).mockResolvedValue({
      success: false,
      error: 'Bot is suspended: Violation of terms',
      errorCode: 'BOT_SUSPENDED',
    });

    // Create request
    const request = new Request('http://localhost/api/bots/bot-123/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const context = {
      params: Promise.resolve({ id: 'bot-123' }),
    };

    // Call the route
    const response = await POST(request, context);
    const data = await response.json();

    // Verify response
    expect(response.status).toBe(403);
    expect(data.success).toBe(false);
    expect(data.errorCode).toBe('BOT_SUSPENDED');
  });

  it('should return 422 if no content available', async () => {
    // Mock ownership check
    vi.mocked(botManager.userOwnsBot).mockResolvedValue(true);

    // Mock no content error
    vi.mocked(posting.triggerPost).mockResolvedValue({
      success: false,
      error: 'No content available for posting',
      errorCode: 'NO_CONTENT',
    });

    // Create request
    const request = new Request('http://localhost/api/bots/bot-123/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const context = {
      params: Promise.resolve({ id: 'bot-123' }),
    };

    // Call the route
    const response = await POST(request, context);
    const data = await response.json();

    // Verify response
    expect(response.status).toBe(422);
    expect(data.success).toBe(false);
    expect(data.errorCode).toBe('NO_CONTENT');
  });

  it('should return 400 for invalid input', async () => {
    // Mock ownership check
    vi.mocked(botManager.userOwnsBot).mockResolvedValue(true);

    // Create request with invalid UUID
    const request = new Request('http://localhost/api/bots/bot-123/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceContentId: 'invalid-uuid',
      }),
    });

    const context = {
      params: Promise.resolve({ id: 'bot-123' }),
    };

    // Call the route
    const response = await POST(request, context);
    const data = await response.json();

    // Verify response
    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid input');
    expect(data.details).toBeDefined();
  });

  it('should return 500 for generation failures', async () => {
    // Mock ownership check
    vi.mocked(botManager.userOwnsBot).mockResolvedValue(true);

    // Mock generation failure
    vi.mocked(posting.triggerPost).mockResolvedValue({
      success: false,
      error: 'Failed to generate post content',
      errorCode: 'GENERATION_FAILED',
    });

    // Create request
    const request = new Request('http://localhost/api/bots/bot-123/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const context = {
      params: Promise.resolve({ id: 'bot-123' }),
    };

    // Call the route
    const response = await POST(request, context);
    const data = await response.json();

    // Verify response
    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.errorCode).toBe('GENERATION_FAILED');
  });
});
