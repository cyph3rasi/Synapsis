/**
 * Unit Tests for Rate Limiter Service
 * 
 * Tests the rate limiting functionality for bot posts and replies.
 * 
 * Requirements: 5.6, 7.6, 10.1, 10.2, 10.4
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  RATE_LIMITS,
  getDailyWindowStart,
  getHourlyWindowStart,
  canPost,
  canReply,
  recordPost,
  recordReply,
  getRemainingQuota,
  getPostCount,
  resetRateLimits,
} from './rateLimiter';

// Mock the database module
vi.mock('@/db', () => {
  const mockBotRateLimits: Record<string, any> = {};
  const mockBots: Record<string, any> = {};
  const mockActivityLogs: any[] = [];
  
  return {
    db: {
      query: {
        botRateLimits: {
          findFirst: vi.fn(async ({ where }: any) => {
            // Return mock data based on the query
            return null;
          }),
          findMany: vi.fn(async () => []),
        },
        bots: {
          findFirst: vi.fn(async ({ where }: any) => {
            return { lastPostAt: null };
          }),
        },
      },
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => [{
            id: 'rate-limit-1',
            botId: 'bot-1',
            windowType: 'daily',
            windowStart: new Date(),
            postCount: 0,
            replyCount: 0,
          }]),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => {}),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(async () => {}),
      })),
    },
    bots: { id: 'id' },
    botRateLimits: { 
      id: 'id', 
      botId: 'botId', 
      windowType: 'windowType', 
      windowStart: 'windowStart' 
    },
    botActivityLogs: {},
  };
});

describe('Rate Limiter Constants', () => {
  it('should have correct rate limit values', () => {
    expect(RATE_LIMITS.MAX_POSTS_PER_DAY).toBe(50);
    expect(RATE_LIMITS.MIN_POST_INTERVAL_MINUTES).toBe(5);
    expect(RATE_LIMITS.MAX_REPLIES_PER_HOUR).toBe(20);
  });
});

describe('Window Start Calculations', () => {
  describe('getDailyWindowStart', () => {
    it('should return midnight UTC for the given date', () => {
      const testDate = new Date('2024-03-15T14:30:45.123Z');
      const windowStart = getDailyWindowStart(testDate);
      
      expect(windowStart.getUTCHours()).toBe(0);
      expect(windowStart.getUTCMinutes()).toBe(0);
      expect(windowStart.getUTCSeconds()).toBe(0);
      expect(windowStart.getUTCMilliseconds()).toBe(0);
      expect(windowStart.getUTCDate()).toBe(15);
      expect(windowStart.getUTCMonth()).toBe(2); // March (0-indexed)
    });
    
    it('should use current date when no date provided', () => {
      const windowStart = getDailyWindowStart();
      const now = new Date();
      
      expect(windowStart.getUTCDate()).toBe(now.getUTCDate());
      expect(windowStart.getUTCHours()).toBe(0);
    });
    
    it('should handle dates near midnight correctly', () => {
      const nearMidnight = new Date('2024-03-15T23:59:59.999Z');
      const windowStart = getDailyWindowStart(nearMidnight);
      
      expect(windowStart.getUTCDate()).toBe(15);
      expect(windowStart.getUTCHours()).toBe(0);
    });
  });
  
  describe('getHourlyWindowStart', () => {
    it('should return the start of the hour for the given date', () => {
      const testDate = new Date('2024-03-15T14:30:45.123Z');
      const windowStart = getHourlyWindowStart(testDate);
      
      expect(windowStart.getUTCHours()).toBe(14);
      expect(windowStart.getUTCMinutes()).toBe(0);
      expect(windowStart.getUTCSeconds()).toBe(0);
      expect(windowStart.getUTCMilliseconds()).toBe(0);
    });
    
    it('should use current date when no date provided', () => {
      const windowStart = getHourlyWindowStart();
      const now = new Date();
      
      expect(windowStart.getUTCHours()).toBe(now.getUTCHours());
      expect(windowStart.getUTCMinutes()).toBe(0);
    });
    
    it('should handle times near the hour boundary', () => {
      const nearHour = new Date('2024-03-15T14:59:59.999Z');
      const windowStart = getHourlyWindowStart(nearHour);
      
      expect(windowStart.getUTCHours()).toBe(14);
      expect(windowStart.getUTCMinutes()).toBe(0);
    });
  });
});

describe('canPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('should allow posting when no previous posts exist', async () => {
    const { db } = await import('@/db');
    
    // Mock: no rate limit window exists, no last post
    vi.mocked(db.query.botRateLimits.findFirst).mockResolvedValue(undefined);
    vi.mocked(db.query.bots.findFirst).mockResolvedValue({ lastPostAt: null } as any);
    
    const result = await canPost('bot-1');
    
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });
  
  it('should deny posting when daily limit is reached', async () => {
    const { db } = await import('@/db');
    
    // Mock: daily limit reached
    vi.mocked(db.query.botRateLimits.findFirst).mockResolvedValue({
      id: 'rate-1',
      botId: 'bot-1',
      windowType: 'daily',
      windowStart: getDailyWindowStart(),
      postCount: 50,
      replyCount: 0,
      createdAt: new Date(),
    } as any);
    vi.mocked(db.query.bots.findFirst).mockResolvedValue({ lastPostAt: null } as any);
    
    const result = await canPost('bot-1');
    
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Daily post limit');
    expect(result.reason).toContain('50');
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });
  
  it('should deny posting when minimum interval not met', async () => {
    const { db } = await import('@/db');
    
    // Mock: last post was 2 minutes ago
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    vi.mocked(db.query.botRateLimits.findFirst).mockResolvedValue(undefined);
    vi.mocked(db.query.bots.findFirst).mockResolvedValue({ lastPostAt: twoMinutesAgo } as any);
    
    const result = await canPost('bot-1');
    
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Minimum interval');
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(3 * 60); // Should be ~3 minutes
  });
  
  it('should allow posting when minimum interval has passed', async () => {
    const { db } = await import('@/db');
    
    // Mock: last post was 6 minutes ago
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
    vi.mocked(db.query.botRateLimits.findFirst).mockResolvedValue(undefined);
    vi.mocked(db.query.bots.findFirst).mockResolvedValue({ lastPostAt: sixMinutesAgo } as any);
    
    const result = await canPost('bot-1');
    
    expect(result.allowed).toBe(true);
  });
});

describe('canReply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('should allow replying when no previous replies exist', async () => {
    const { db } = await import('@/db');
    
    vi.mocked(db.query.botRateLimits.findFirst).mockResolvedValue(undefined);
    
    const result = await canReply('bot-1');
    
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });
  
  it('should deny replying when hourly limit is reached', async () => {
    const { db } = await import('@/db');
    
    // Mock: hourly limit reached
    vi.mocked(db.query.botRateLimits.findFirst).mockResolvedValue({
      id: 'rate-1',
      botId: 'bot-1',
      windowType: 'hourly',
      windowStart: getHourlyWindowStart(),
      postCount: 0,
      replyCount: 20,
      createdAt: new Date(),
    } as any);
    
    const result = await canReply('bot-1');
    
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Hourly reply limit');
    expect(result.reason).toContain('20');
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });
  
  it('should allow replying when under hourly limit', async () => {
    const { db } = await import('@/db');
    
    vi.mocked(db.query.botRateLimits.findFirst).mockResolvedValue({
      id: 'rate-1',
      botId: 'bot-1',
      windowType: 'hourly',
      windowStart: getHourlyWindowStart(),
      postCount: 0,
      replyCount: 10,
      createdAt: new Date(),
    } as any);
    
    const result = await canReply('bot-1');
    
    expect(result.allowed).toBe(true);
  });
});

describe('recordPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('should create a new window and increment post count', async () => {
    const { db } = await import('@/db');
    
    vi.mocked(db.query.botRateLimits.findFirst).mockResolvedValue(undefined);
    
    await recordPost('bot-1');
    
    // Should have called insert to create window
    expect(db.insert).toHaveBeenCalled();
    // Should have called update to increment count
    expect(db.update).toHaveBeenCalled();
  });
  
  it('should increment existing window post count', async () => {
    const { db } = await import('@/db');
    
    vi.mocked(db.query.botRateLimits.findFirst).mockResolvedValue({
      id: 'rate-1',
      botId: 'bot-1',
      windowType: 'daily',
      windowStart: getDailyWindowStart(),
      postCount: 5,
      replyCount: 0,
      createdAt: new Date(),
    } as any);
    
    await recordPost('bot-1');
    
    // Should have called update to increment count
    expect(db.update).toHaveBeenCalled();
  });
});

describe('recordReply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('should create a new window and increment reply count', async () => {
    const { db } = await import('@/db');
    
    vi.mocked(db.query.botRateLimits.findFirst).mockResolvedValue(undefined);
    
    await recordReply('bot-1');
    
    // Should have called insert to create window
    expect(db.insert).toHaveBeenCalled();
    // Should have called update to increment count
    expect(db.update).toHaveBeenCalled();
  });
});

describe('getRemainingQuota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('should return full quota when no posts or replies exist', async () => {
    const { db } = await import('@/db');
    
    vi.mocked(db.query.botRateLimits.findFirst).mockResolvedValue(undefined);
    vi.mocked(db.query.bots.findFirst).mockResolvedValue({ lastPostAt: null } as any);
    
    const quota = await getRemainingQuota('bot-1');
    
    expect(quota.daily).toBe(50);
    expect(quota.hourly).toBe(20);
    expect(quota.nextPostAllowedInSeconds).toBe(0);
  });
  
  it('should return reduced quota based on usage', async () => {
    const { db } = await import('@/db');
    
    // First call for daily, second for hourly
    vi.mocked(db.query.botRateLimits.findFirst)
      .mockResolvedValueOnce({
        id: 'rate-1',
        botId: 'bot-1',
        windowType: 'daily',
        windowStart: getDailyWindowStart(),
        postCount: 10,
        replyCount: 0,
        createdAt: new Date(),
      } as any)
      .mockResolvedValueOnce({
        id: 'rate-2',
        botId: 'bot-1',
        windowType: 'hourly',
        windowStart: getHourlyWindowStart(),
        postCount: 0,
        replyCount: 5,
        createdAt: new Date(),
      } as any);
    vi.mocked(db.query.bots.findFirst).mockResolvedValue({ lastPostAt: null } as any);
    
    const quota = await getRemainingQuota('bot-1');
    
    expect(quota.daily).toBe(40);
    expect(quota.hourly).toBe(15);
  });
  
  it('should return wait time when minimum interval not met', async () => {
    const { db } = await import('@/db');
    
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    vi.mocked(db.query.botRateLimits.findFirst).mockResolvedValue(undefined);
    vi.mocked(db.query.bots.findFirst).mockResolvedValue({ lastPostAt: twoMinutesAgo } as any);
    
    const quota = await getRemainingQuota('bot-1');
    
    expect(quota.nextPostAllowedInSeconds).toBeGreaterThan(0);
    expect(quota.nextPostAllowedInSeconds).toBeLessThanOrEqual(3 * 60);
  });
});

describe('getPostCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('should return 0 when no windows exist', async () => {
    const { db } = await import('@/db');
    
    vi.mocked(db.query.botRateLimits.findMany).mockResolvedValue([]);
    
    const count = await getPostCount('bot-1', 24);
    
    expect(count).toBe(0);
  });
  
  it('should sum post counts from multiple windows', async () => {
    const { db } = await import('@/db');
    
    vi.mocked(db.query.botRateLimits.findMany).mockResolvedValue([
      { postCount: 10 } as any,
      { postCount: 15 } as any,
    ]);
    
    const count = await getPostCount('bot-1', 48);
    
    expect(count).toBe(25);
  });
});

describe('resetRateLimits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('should delete all rate limit records for a bot', async () => {
    const { db } = await import('@/db');
    
    await resetRateLimits('bot-1');
    
    expect(db.delete).toHaveBeenCalled();
  });
});
