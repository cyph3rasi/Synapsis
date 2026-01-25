/**
 * Property-Based Tests for Rate Limit Enforcement
 * 
 * Feature: bot-system, Property 19: Rate Limit Enforcement
 * 
 * Tests the rate limiting functionality for bot posts using fast-check
 * for property-based testing.
 * 
 * **Validates: Requirements 5.6, 10.1, 10.2, 10.4**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  RATE_LIMITS,
  canPost,
  recordPost,
  canReply,
  recordReply,
  getRemainingQuota,
  getDailyWindowStart,
  getHourlyWindowStart,
  resetRateLimits,
} from './rateLimiter';

// ============================================
// MOCK SETUP
// ============================================

// In-memory storage for mocking database operations
interface MockRateLimitWindow {
  id: string;
  botId: string;
  windowType: 'daily' | 'hourly';
  windowStart: Date;
  postCount: number;
  replyCount: number;
  createdAt: Date;
}

interface MockBot {
  id: string;
  lastPostAt: Date | null;
}

let mockRateLimitWindows: MockRateLimitWindow[] = [];
let mockBots: Map<string, MockBot> = new Map();
let mockActivityLogs: Array<{ botId: string; action: string; details: string; success: boolean; errorMessage?: string }> = [];

// Mock the database module
vi.mock('@/db', () => {
  return {
    db: {
      query: {
        botRateLimits: {
          findFirst: vi.fn(async ({ where }: any) => {
            // Find matching window based on botId, windowType, and windowStart
            const window = mockRateLimitWindows.find(w => {
              // This is a simplified mock - in real tests we'd parse the where clause
              return true; // Will be overridden per test
            });
            return window || null;
          }),
          findMany: vi.fn(async () => mockRateLimitWindows),
        },
        bots: {
          findFirst: vi.fn(async ({ where }: any) => {
            // Return the mock bot
            return null; // Will be overridden per test
          }),
        },
      },
      insert: vi.fn(() => ({
        values: vi.fn((values: any) => ({
          returning: vi.fn(async () => {
            const newWindow: MockRateLimitWindow = {
              id: `rate-limit-${Date.now()}-${Math.random()}`,
              botId: values.botId,
              windowType: values.windowType,
              windowStart: values.windowStart,
              postCount: values.postCount || 0,
              replyCount: values.replyCount || 0,
              createdAt: new Date(),
            };
            mockRateLimitWindows.push(newWindow);
            return [newWindow];
          }),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((updates: any) => ({
          where: vi.fn(async () => {
            // Update would be applied here
          }),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(async () => {
          mockRateLimitWindows = [];
        }),
      })),
    },
    bots: { id: 'id' },
    botRateLimits: {
      id: 'id',
      botId: 'botId',
      windowType: 'windowType',
      windowStart: 'windowStart',
    },
    botActivityLogs: {},
  };
});

// ============================================
// HELPER FUNCTIONS FOR TESTING
// ============================================

/**
 * Reset all mock state before each test.
 */
function resetMockState(): void {
  mockRateLimitWindows = [];
  mockBots = new Map();
  mockActivityLogs = [];
}

/**
 * Configure mock to simulate a bot with a specific post count for the day.
 */
async function configureMockPostCount(botId: string, postCount: number): Promise<void> {
  const { db } = await import('@/db');
  
  vi.mocked(db.query.botRateLimits.findFirst).mockResolvedValue({
    id: 'rate-1',
    botId,
    windowType: 'daily',
    windowStart: getDailyWindowStart(),
    postCount,
    replyCount: 0,
    createdAt: new Date(),
  } as any);
}

/**
 * Configure mock to simulate a bot's last post time.
 */
async function configureMockLastPostAt(botId: string, lastPostAt: Date | null): Promise<void> {
  const { db } = await import('@/db');
  
  vi.mocked(db.query.bots.findFirst).mockResolvedValue({ lastPostAt } as any);
}

/**
 * Configure mock for both post count and last post time.
 */
async function configureMockBotState(
  botId: string,
  postCount: number,
  lastPostAt: Date | null
): Promise<void> {
  const { db } = await import('@/db');
  
  if (postCount === 0) {
    vi.mocked(db.query.botRateLimits.findFirst).mockResolvedValue(null as any);
  } else {
    vi.mocked(db.query.botRateLimits.findFirst).mockResolvedValue({
      id: 'rate-1',
      botId,
      windowType: 'daily',
      windowStart: getDailyWindowStart(),
      postCount,
      replyCount: 0,
      createdAt: new Date(),
    } as any);
  }
  
  vi.mocked(db.query.bots.findFirst).mockResolvedValue({ lastPostAt } as any);
}

/**
 * Configure mock for reply count in the hourly window.
 */
async function configureMockReplyCount(
  botId: string,
  replyCount: number
): Promise<void> {
  const { db } = await import('@/db');
  
  if (replyCount === 0) {
    vi.mocked(db.query.botRateLimits.findFirst).mockResolvedValue(null as any);
  } else {
    vi.mocked(db.query.botRateLimits.findFirst).mockResolvedValue({
      id: 'rate-1',
      botId,
      windowType: 'hourly',
      windowStart: getHourlyWindowStart(),
      postCount: 0,
      replyCount,
      createdAt: new Date(),
    } as any);
  }
}

// ============================================
// GENERATORS
// ============================================

/**
 * Generator for valid bot IDs (UUIDs).
 */
const botIdArb = fc.uuid();

/**
 * Generator for post counts at or above the daily limit (50).
 * These should trigger rate limit rejection.
 */
const atOrAboveDailyLimitArb = fc.integer({ min: RATE_LIMITS.MAX_POSTS_PER_DAY, max: 200 });

/**
 * Generator for post counts below the daily limit.
 * These should be allowed (assuming interval is met).
 */
const belowDailyLimitArb = fc.integer({ min: 0, max: RATE_LIMITS.MAX_POSTS_PER_DAY - 1 });

/**
 * Generator for time intervals in minutes that are below the minimum (< 5 minutes).
 * These should trigger rate limit rejection.
 */
const belowMinIntervalMinutesArb = fc.integer({ min: 0, max: RATE_LIMITS.MIN_POST_INTERVAL_MINUTES - 1 });

/**
 * Generator for time intervals in minutes that meet or exceed the minimum (>= 5 minutes).
 * These should be allowed (assuming daily limit is not reached).
 */
const atOrAboveMinIntervalMinutesArb = fc.integer({ min: RATE_LIMITS.MIN_POST_INTERVAL_MINUTES, max: 1440 });

/**
 * Generator for scenarios that should be rejected:
 * - Daily limit reached (>= 50 posts)
 * - OR interval not met (< 5 minutes since last post)
 */
const rejectionScenarioArb = fc.oneof(
  // Scenario 1: Daily limit reached, regardless of interval
  fc.record({
    postCount: atOrAboveDailyLimitArb,
    minutesSinceLastPost: fc.integer({ min: 0, max: 1440 }),
    reason: fc.constant('daily_limit' as const),
  }),
  // Scenario 2: Interval not met, regardless of post count
  fc.record({
    postCount: belowDailyLimitArb,
    minutesSinceLastPost: belowMinIntervalMinutesArb,
    reason: fc.constant('interval' as const),
  }),
  // Scenario 3: Both limits violated
  fc.record({
    postCount: atOrAboveDailyLimitArb,
    minutesSinceLastPost: belowMinIntervalMinutesArb,
    reason: fc.constant('both' as const),
  })
);

/**
 * Generator for scenarios that should be allowed:
 * - Below daily limit (< 50 posts)
 * - AND interval met (>= 5 minutes since last post OR no previous post)
 */
const allowedScenarioArb = fc.record({
  postCount: belowDailyLimitArb,
  minutesSinceLastPost: fc.oneof(
    atOrAboveMinIntervalMinutesArb,
    fc.constant(null as number | null) // No previous post
  ),
});

/**
 * Generator for a sequence of post attempts to test cumulative rate limiting.
 */
const postSequenceArb = fc.array(
  fc.record({
    delayMinutes: fc.integer({ min: 0, max: 30 }),
  }),
  { minLength: 1, maxLength: 60 }
);

// ============================================
// REPLY RATE LIMITING GENERATORS
// ============================================

/**
 * Generator for reply counts at or above the hourly limit (20).
 * These should trigger rate limit rejection.
 */
const atOrAboveHourlyReplyLimitArb = fc.integer({ min: RATE_LIMITS.MAX_REPLIES_PER_HOUR, max: 200 });

/**
 * Generator for reply counts below the hourly limit.
 * These should be allowed.
 */
const belowHourlyReplyLimitArb = fc.integer({ min: 0, max: RATE_LIMITS.MAX_REPLIES_PER_HOUR - 1 });

// ============================================
// PROPERTY TESTS
// ============================================

describe('Feature: bot-system, Property 19: Rate Limit Enforcement', () => {
  /**
   * Property 19: Rate Limit Enforcement
   * 
   * *For any* bot, posting more than 50 times per day OR posting within 5 minutes 
   * of the last post SHALL be rejected.
   * 
   * **Validates: Requirements 5.6, 10.1, 10.2, 10.4**
   */

  beforeEach(() => {
    vi.clearAllMocks();
    resetMockState();
  });

  describe('Daily limit enforcement (Requirement 10.1)', () => {
    /**
     * Property: For any bot that has posted 50 or more times today,
     * the next post attempt SHALL be rejected.
     */
    it('rejects posting when daily limit of 50 posts is reached', async () => {
      await fc.assert(
        fc.asyncProperty(botIdArb, atOrAboveDailyLimitArb, async (botId, postCount) => {
          // Configure mock: bot has reached or exceeded daily limit
          await configureMockBotState(botId, postCount, null);
          
          const result = await canPost(botId);
          
          expect(result.allowed).toBe(false);
          expect(result.reason).toBeDefined();
          expect(result.reason).toContain('Daily post limit');
          expect(result.reason).toContain('50');
          expect(result.retryAfterSeconds).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: For any bot that has posted fewer than 50 times today
     * and meets the interval requirement, posting SHALL be allowed.
     */
    it('allows posting when below daily limit and interval is met', async () => {
      await fc.assert(
        fc.asyncProperty(botIdArb, belowDailyLimitArb, async (botId, postCount) => {
          // Configure mock: bot is below daily limit and has no recent post
          await configureMockBotState(botId, postCount, null);
          
          const result = await canPost(botId);
          
          expect(result.allowed).toBe(true);
          expect(result.reason).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: The daily limit is exactly 50 posts per day.
     */
    it('enforces exactly 50 posts per day limit', async () => {
      const botId = 'test-bot-exact-limit';
      
      // At 49 posts, should be allowed
      await configureMockBotState(botId, 49, null);
      const resultAt49 = await canPost(botId);
      expect(resultAt49.allowed).toBe(true);
      
      // At 50 posts, should be rejected
      await configureMockBotState(botId, 50, null);
      const resultAt50 = await canPost(botId);
      expect(resultAt50.allowed).toBe(false);
      expect(resultAt50.reason).toContain('Daily post limit');
    });
  });

  describe('Minimum interval enforcement (Requirements 5.6, 10.2)', () => {
    /**
     * Property: For any bot that posted less than 5 minutes ago,
     * the next post attempt SHALL be rejected.
     */
    it('rejects posting within 5 minutes of last post', async () => {
      await fc.assert(
        fc.asyncProperty(botIdArb, belowMinIntervalMinutesArb, async (botId, minutesAgo) => {
          // Configure mock: bot posted recently (within 5 minutes)
          const lastPostAt = new Date(Date.now() - minutesAgo * 60 * 1000);
          await configureMockBotState(botId, 0, lastPostAt);
          
          const result = await canPost(botId);
          
          expect(result.allowed).toBe(false);
          expect(result.reason).toBeDefined();
          expect(result.reason).toContain('Minimum interval');
          expect(result.retryAfterSeconds).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: For any bot that posted 5 or more minutes ago,
     * the interval requirement is satisfied.
     */
    it('allows posting when 5 or more minutes have passed since last post', async () => {
      await fc.assert(
        fc.asyncProperty(botIdArb, atOrAboveMinIntervalMinutesArb, async (botId, minutesAgo) => {
          // Configure mock: bot posted long enough ago
          const lastPostAt = new Date(Date.now() - minutesAgo * 60 * 1000);
          await configureMockBotState(botId, 0, lastPostAt);
          
          const result = await canPost(botId);
          
          expect(result.allowed).toBe(true);
          expect(result.reason).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: The minimum interval is exactly 5 minutes.
     */
    it('enforces exactly 5 minute minimum interval', async () => {
      const botId = 'test-bot-exact-interval';
      
      // At 4 minutes 59 seconds ago, should be rejected
      const justUnder5Min = new Date(Date.now() - (4 * 60 + 59) * 1000);
      await configureMockBotState(botId, 0, justUnder5Min);
      const resultUnder = await canPost(botId);
      expect(resultUnder.allowed).toBe(false);
      
      // At 5 minutes ago, should be allowed
      const exactly5Min = new Date(Date.now() - 5 * 60 * 1000);
      await configureMockBotState(botId, 0, exactly5Min);
      const resultExact = await canPost(botId);
      expect(resultExact.allowed).toBe(true);
    });

    /**
     * Property: Bots with no previous posts have no interval restriction.
     */
    it('allows first post for bots with no posting history', async () => {
      await fc.assert(
        fc.asyncProperty(botIdArb, async (botId) => {
          // Configure mock: bot has never posted
          await configureMockBotState(botId, 0, null);
          
          const result = await canPost(botId);
          
          expect(result.allowed).toBe(true);
          expect(result.reason).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Combined rate limit scenarios', () => {
    /**
     * Property: For any scenario where daily limit is reached OR interval is not met,
     * posting SHALL be rejected.
     */
    it('rejects posting when either limit is violated', async () => {
      await fc.assert(
        fc.asyncProperty(botIdArb, rejectionScenarioArb, async (botId, scenario) => {
          // Configure mock based on scenario
          const lastPostAt = scenario.minutesSinceLastPost !== null
            ? new Date(Date.now() - scenario.minutesSinceLastPost * 60 * 1000)
            : null;
          await configureMockBotState(botId, scenario.postCount, lastPostAt);
          
          const result = await canPost(botId);
          
          expect(result.allowed).toBe(false);
          expect(result.reason).toBeDefined();
          expect(result.retryAfterSeconds).toBeGreaterThan(0);
          
          // Verify the correct reason is given based on which limit was hit first
          // (interval is checked before daily limit in the implementation)
          if (scenario.reason === 'interval' || scenario.reason === 'both') {
            if (lastPostAt !== null) {
              expect(result.reason).toContain('Minimum interval');
            }
          }
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: For any scenario where both limits are satisfied,
     * posting SHALL be allowed.
     */
    it('allows posting when both limits are satisfied', async () => {
      await fc.assert(
        fc.asyncProperty(botIdArb, allowedScenarioArb, async (botId, scenario) => {
          // Configure mock based on scenario
          const lastPostAt = scenario.minutesSinceLastPost !== null
            ? new Date(Date.now() - scenario.minutesSinceLastPost * 60 * 1000)
            : null;
          await configureMockBotState(botId, scenario.postCount, lastPostAt);
          
          const result = await canPost(botId);
          
          expect(result.allowed).toBe(true);
          expect(result.reason).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Rate limit constants validation', () => {
    /**
     * Property: Rate limit constants match the requirements.
     */
    it('has correct rate limit constants per requirements', () => {
      // Requirement 10.1: Maximum 50 posts per day
      expect(RATE_LIMITS.MAX_POSTS_PER_DAY).toBe(50);
      
      // Requirement 10.2: Minimum 5 minute interval
      expect(RATE_LIMITS.MIN_POST_INTERVAL_MINUTES).toBe(5);
      
      // Requirement 7.6: Maximum 20 replies per hour
      expect(RATE_LIMITS.MAX_REPLIES_PER_HOUR).toBe(20);
    });
  });

  describe('Retry-after calculation', () => {
    /**
     * Property: When rate limited, retryAfterSeconds provides a valid wait time.
     */
    it('provides valid retry-after seconds when rate limited', async () => {
      await fc.assert(
        fc.asyncProperty(botIdArb, rejectionScenarioArb, async (botId, scenario) => {
          const lastPostAt = scenario.minutesSinceLastPost !== null
            ? new Date(Date.now() - scenario.minutesSinceLastPost * 60 * 1000)
            : null;
          await configureMockBotState(botId, scenario.postCount, lastPostAt);
          
          const result = await canPost(botId);
          
          if (!result.allowed) {
            expect(result.retryAfterSeconds).toBeDefined();
            expect(result.retryAfterSeconds).toBeGreaterThan(0);
            
            // For interval violations, retry should be <= 5 minutes
            if (scenario.reason === 'interval' && lastPostAt !== null) {
              expect(result.retryAfterSeconds).toBeLessThanOrEqual(5 * 60);
            }
            
            // For daily limit violations, retry should be <= 24 hours
            if (scenario.reason === 'daily_limit') {
              expect(result.retryAfterSeconds).toBeLessThanOrEqual(24 * 60 * 60);
            }
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Remaining quota accuracy', () => {
    /**
     * Property: getRemainingQuota returns accurate remaining posts.
     */
    it('returns accurate remaining daily quota', async () => {
      await fc.assert(
        fc.asyncProperty(botIdArb, belowDailyLimitArb, async (botId, postCount) => {
          await configureMockBotState(botId, postCount, null);
          
          const quota = await getRemainingQuota(botId);
          
          expect(quota.daily).toBe(RATE_LIMITS.MAX_POSTS_PER_DAY - postCount);
          expect(quota.daily).toBeGreaterThanOrEqual(0);
          expect(quota.daily).toBeLessThanOrEqual(RATE_LIMITS.MAX_POSTS_PER_DAY);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: getRemainingQuota returns 0 when limit is reached.
     */
    it('returns 0 remaining quota when daily limit is reached', async () => {
      await fc.assert(
        fc.asyncProperty(botIdArb, atOrAboveDailyLimitArb, async (botId, postCount) => {
          await configureMockBotState(botId, postCount, null);
          
          const quota = await getRemainingQuota(botId);
          
          expect(quota.daily).toBe(0);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: nextPostAllowedInSeconds is accurate based on last post time.
     */
    it('returns accurate next post allowed time', async () => {
      await fc.assert(
        fc.asyncProperty(botIdArb, belowMinIntervalMinutesArb, async (botId, minutesAgo) => {
          const lastPostAt = new Date(Date.now() - minutesAgo * 60 * 1000);
          await configureMockBotState(botId, 0, lastPostAt);
          
          const quota = await getRemainingQuota(botId);
          
          // Should have some wait time remaining
          expect(quota.nextPostAllowedInSeconds).toBeGreaterThan(0);
          
          // Wait time should be approximately (5 - minutesAgo) minutes
          const expectedWaitSeconds = (RATE_LIMITS.MIN_POST_INTERVAL_MINUTES - minutesAgo) * 60;
          // Allow 2 second tolerance for test execution time
          expect(quota.nextPostAllowedInSeconds).toBeGreaterThanOrEqual(expectedWaitSeconds - 2);
          expect(quota.nextPostAllowedInSeconds).toBeLessThanOrEqual(expectedWaitSeconds + 2);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge cases', () => {
    /**
     * Property: Rate limiting works correctly at boundary values.
     */
    it('handles boundary values correctly', async () => {
      const botId = 'test-bot-boundaries';
      
      // Test at exactly 0 posts
      await configureMockBotState(botId, 0, null);
      const resultAt0 = await canPost(botId);
      expect(resultAt0.allowed).toBe(true);
      
      // Test at exactly MAX_POSTS_PER_DAY - 1
      await configureMockBotState(botId, RATE_LIMITS.MAX_POSTS_PER_DAY - 1, null);
      const resultAtMax1 = await canPost(botId);
      expect(resultAtMax1.allowed).toBe(true);
      
      // Test at exactly MAX_POSTS_PER_DAY
      await configureMockBotState(botId, RATE_LIMITS.MAX_POSTS_PER_DAY, null);
      const resultAtMax = await canPost(botId);
      expect(resultAtMax.allowed).toBe(false);
    });

    /**
     * Property: Rate limiting handles very large post counts gracefully.
     */
    it('handles very large post counts gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          botIdArb,
          fc.integer({ min: 1000, max: 1000000 }),
          async (botId, postCount) => {
            await configureMockBotState(botId, postCount, null);
            
            const result = await canPost(botId);
            
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('Daily post limit');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Rate limiting handles posts from far in the past correctly.
     */
    it('allows posting when last post was long ago', async () => {
      await fc.assert(
        fc.asyncProperty(
          botIdArb,
          fc.integer({ min: 60, max: 10080 }), // 1 hour to 1 week in minutes
          async (botId, minutesAgo) => {
            const lastPostAt = new Date(Date.now() - minutesAgo * 60 * 1000);
            await configureMockBotState(botId, 0, lastPostAt);
            
            const result = await canPost(botId);
            
            expect(result.allowed).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

// ============================================
// PROPERTY 25: REPLY RATE LIMITING
// ============================================

describe('Feature: bot-system, Property 25: Reply Rate Limiting', () => {
  /**
   * Property 25: Reply Rate Limiting
   * 
   * *For any* bot, replying more than 20 times per hour SHALL be rejected.
   * 
   * **Validates: Requirements 7.6**
   */

  beforeEach(() => {
    vi.clearAllMocks();
    resetMockState();
  });

  describe('Hourly reply limit enforcement (Requirement 7.6)', () => {
    /**
     * Property: For any bot that has replied 20 or more times this hour,
     * the next reply attempt SHALL be rejected.
     */
    it('rejects replying when hourly limit of 20 replies is reached', async () => {
      await fc.assert(
        fc.asyncProperty(botIdArb, atOrAboveHourlyReplyLimitArb, async (botId, replyCount) => {
          // Configure mock: bot has reached or exceeded hourly reply limit
          await configureMockReplyCount(botId, replyCount);
          
          const result = await canReply(botId);
          
          expect(result.allowed).toBe(false);
          expect(result.reason).toBeDefined();
          expect(result.reason).toContain('Hourly reply limit');
          expect(result.reason).toContain('20');
          expect(result.retryAfterSeconds).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: For any bot that has replied fewer than 20 times this hour,
     * replying SHALL be allowed.
     */
    it('allows replying when below hourly limit', async () => {
      await fc.assert(
        fc.asyncProperty(botIdArb, belowHourlyReplyLimitArb, async (botId, replyCount) => {
          // Configure mock: bot is below hourly reply limit
          await configureMockReplyCount(botId, replyCount);
          
          const result = await canReply(botId);
          
          expect(result.allowed).toBe(true);
          expect(result.reason).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: The hourly reply limit is exactly 20 replies per hour.
     */
    it('enforces exactly 20 replies per hour limit', async () => {
      const botId = 'test-bot-exact-reply-limit';
      
      // At 19 replies, should be allowed
      await configureMockReplyCount(botId, 19);
      const resultAt19 = await canReply(botId);
      expect(resultAt19.allowed).toBe(true);
      
      // At 20 replies, should be rejected
      await configureMockReplyCount(botId, 20);
      const resultAt20 = await canReply(botId);
      expect(resultAt20.allowed).toBe(false);
      expect(resultAt20.reason).toContain('Hourly reply limit');
    });

    /**
     * Property: Bots with no previous replies this hour have no restriction.
     */
    it('allows first reply for bots with no reply history this hour', async () => {
      await fc.assert(
        fc.asyncProperty(botIdArb, async (botId) => {
          // Configure mock: bot has no replies this hour
          await configureMockReplyCount(botId, 0);
          
          const result = await canReply(botId);
          
          expect(result.allowed).toBe(true);
          expect(result.reason).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Retry-after calculation for replies', () => {
    /**
     * Property: When reply rate limited, retryAfterSeconds provides a valid wait time
     * that is at most 1 hour (3600 seconds).
     */
    it('provides valid retry-after seconds when reply rate limited', async () => {
      await fc.assert(
        fc.asyncProperty(botIdArb, atOrAboveHourlyReplyLimitArb, async (botId, replyCount) => {
          await configureMockReplyCount(botId, replyCount);
          
          const result = await canReply(botId);
          
          expect(result.allowed).toBe(false);
          expect(result.retryAfterSeconds).toBeDefined();
          expect(result.retryAfterSeconds).toBeGreaterThan(0);
          // Retry should be at most 1 hour (until next hourly window)
          expect(result.retryAfterSeconds).toBeLessThanOrEqual(60 * 60);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Remaining reply quota accuracy', () => {
    /**
     * Property: getRemainingQuota returns accurate remaining hourly replies.
     */
    it('returns accurate remaining hourly reply quota', async () => {
      await fc.assert(
        fc.asyncProperty(botIdArb, belowHourlyReplyLimitArb, async (botId, replyCount) => {
          await configureMockReplyCount(botId, replyCount);
          
          const quota = await getRemainingQuota(botId);
          
          expect(quota.hourly).toBe(RATE_LIMITS.MAX_REPLIES_PER_HOUR - replyCount);
          expect(quota.hourly).toBeGreaterThanOrEqual(0);
          expect(quota.hourly).toBeLessThanOrEqual(RATE_LIMITS.MAX_REPLIES_PER_HOUR);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: getRemainingQuota returns 0 hourly quota when reply limit is reached.
     */
    it('returns 0 remaining hourly quota when reply limit is reached', async () => {
      await fc.assert(
        fc.asyncProperty(botIdArb, atOrAboveHourlyReplyLimitArb, async (botId, replyCount) => {
          await configureMockReplyCount(botId, replyCount);
          
          const quota = await getRemainingQuota(botId);
          
          expect(quota.hourly).toBe(0);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Reply rate limit edge cases', () => {
    /**
     * Property: Reply rate limiting works correctly at boundary values.
     */
    it('handles boundary values correctly for replies', async () => {
      const botId = 'test-bot-reply-boundaries';
      
      // Test at exactly 0 replies
      await configureMockReplyCount(botId, 0);
      const resultAt0 = await canReply(botId);
      expect(resultAt0.allowed).toBe(true);
      
      // Test at exactly MAX_REPLIES_PER_HOUR - 1
      await configureMockReplyCount(botId, RATE_LIMITS.MAX_REPLIES_PER_HOUR - 1);
      const resultAtMax1 = await canReply(botId);
      expect(resultAtMax1.allowed).toBe(true);
      
      // Test at exactly MAX_REPLIES_PER_HOUR
      await configureMockReplyCount(botId, RATE_LIMITS.MAX_REPLIES_PER_HOUR);
      const resultAtMax = await canReply(botId);
      expect(resultAtMax.allowed).toBe(false);
    });

    /**
     * Property: Reply rate limiting handles very large reply counts gracefully.
     */
    it('handles very large reply counts gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          botIdArb,
          fc.integer({ min: 1000, max: 1000000 }),
          async (botId, replyCount) => {
            await configureMockReplyCount(botId, replyCount);
            
            const result = await canReply(botId);
            
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('Hourly reply limit');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Reply rate limit constants validation', () => {
    /**
     * Property: Reply rate limit constant matches Requirement 7.6.
     */
    it('has correct reply rate limit constant per Requirement 7.6', () => {
      // Requirement 7.6: Maximum 20 replies per hour
      expect(RATE_LIMITS.MAX_REPLIES_PER_HOUR).toBe(20);
    });
  });
});
