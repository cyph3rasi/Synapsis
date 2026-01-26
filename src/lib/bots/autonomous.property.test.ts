/**
 * Property-Based Tests for Autonomous Posting Module
 * 
 * Feature: bot-system
 * - Property 20: Autonomous Mode Content Evaluation
 * - Property 21: Autonomous Mode Toggle
 * 
 * Tests that autonomous mode evaluates content interest before posting
 * and that bots with autonomous mode disabled only post on schedule.
 * 
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.5**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { ContentItem } from './contentGenerator';
import { PersonalityConfig } from './personality';
import { LLMProvider } from './encryption';
import {
  calculateInterestScore,
  MIN_INTEREST_SCORE,
  attemptAutonomousPost,
  evaluateContentForPosting,
  canPostAutonomously,
} from './autonomous';

// Mock the botManager module
vi.mock('./botManager', () => ({
  getBotById: vi.fn(),
}));

// Mock the rateLimiter module
vi.mock('./rateLimiter', () => ({
  canPost: vi.fn(),
  recordPost: vi.fn(),
}));

// ============================================
// TEST SETUP
// ============================================

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================
// GENERATORS
// ============================================

/**
 * Generator for valid system prompts.
 */
const systemPromptArb = fc.string({
  minLength: 10,
  maxLength: 500,
}).filter(s => s.trim().length >= 10);

/**
 * Generator for valid temperature values (0-2).
 */
const temperatureArb = fc.double({
  min: 0,
  max: 2,
  noNaN: true,
  noDefaultInfinity: true,
});

/**
 * Generator for valid maxTokens values.
 */
const maxTokensArb = fc.integer({
  min: 1,
  max: 4000,
});

/**
 * Generator for valid personality configurations.
 */
const personalityConfigArb: fc.Arbitrary<PersonalityConfig> = fc.record({
  systemPrompt: systemPromptArb,
  temperature: temperatureArb,
  maxTokens: maxTokensArb,
  responseStyle: fc.option(
    fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
    { nil: undefined }
  ),
});

/**
 * Generator for LLM providers.
 */
const llmProviderArb: fc.Arbitrary<LLMProvider> = fc.constantFrom(
  'openrouter' as LLMProvider,
  'openai' as LLMProvider,
  'anthropic' as LLMProvider
);

/**
 * Generator for LLM model names.
 */
const llmModelArb = fc.oneof(
  fc.constant('gpt-3.5-turbo'),
  fc.constant('gpt-4'),
  fc.constant('claude-3-haiku-20240307'),
  fc.constant('claude-3-sonnet-20240229'),
  fc.constant('openai/gpt-3.5-turbo')
);

/**
 * Generator for content items.
 */
const contentItemArb: fc.Arbitrary<ContentItem> = fc.record({
  id: fc.uuid(),
  sourceId: fc.uuid(),
  title: fc.string({ minLength: 5, maxLength: 200 }),
  content: fc.option(fc.string({ minLength: 10, maxLength: 5000 }), { nil: null }),
  url: fc.webUrl(),
  publishedAt: fc.date(),
});

/**
 * Generator for autonomous mode enabled flag.
 */
const autonomousModeArb = fc.boolean();

/**
 * Generator for bot configurations.
 */
const botArb = fc.record({
  id: fc.uuid(),
  userId: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  handle: fc.string({ minLength: 3, maxLength: 30 }),
  personalityConfig: personalityConfigArb,
  llmProvider: llmProviderArb,
  llmModel: llmModelArb,
  autonomousMode: autonomousModeArb,
  isActive: fc.constant(true),
  isSuspended: fc.constant(false),
});

/**
 * Generator for evaluation reasons.
 */
const evaluationReasonArb = fc.string({ minLength: 10, maxLength: 200 });

// ============================================
// PROPERTY TESTS
// ============================================

describe('Feature: bot-system, Property 20: Autonomous Mode Content Evaluation', () => {
  /**
   * Property 20: Autonomous Mode Content Evaluation
   * 
   * *For any* bot in autonomous mode with new content, the system SHALL evaluate
   * content interest before deciding to post.
   * 
   * **Validates: Requirements 6.1, 6.2, 6.3**
   */

  it('calculateInterestScore returns 0 for non-interesting content (Requirement 6.2)', async () => {
    await fc.assert(
      fc.asyncProperty(
        evaluationReasonArb,
        async (reason) => {
          const score = calculateInterestScore(false, reason);

          // Non-interesting content should always have score 0
          expect(score).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('calculateInterestScore returns positive score for interesting content (Requirement 6.2)', async () => {
    await fc.assert(
      fc.asyncProperty(
        evaluationReasonArb,
        async (reason) => {
          const score = calculateInterestScore(true, reason);

          // Interesting content should have positive score
          expect(score).toBeGreaterThan(0);

          // Score should be in valid range (0-100)
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('calculateInterestScore increases with positive keywords (Requirement 6.2)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          'very interesting',
          'highly relevant',
          'extremely important',
          'excellent content',
          'perfect timing',
          'significant news',
          'valuable information'
        ),
        async (positiveReason) => {
          const scoreWithKeywords = calculateInterestScore(true, positiveReason);
          const scoreWithoutKeywords = calculateInterestScore(true, 'interesting');

          // Score with positive keywords should be higher
          expect(scoreWithKeywords).toBeGreaterThanOrEqual(scoreWithoutKeywords);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('interest score determines posting decision (Requirement 6.2, 6.3)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        evaluationReasonArb,
        async (interesting, reason) => {
          const score = calculateInterestScore(interesting, reason);

          // Verify score correlates with interesting flag
          if (interesting) {
            expect(score).toBeGreaterThan(0);

            // If score is above threshold, content should be posted
            const shouldPost = score >= MIN_INTEREST_SCORE;

            // Verify threshold logic
            if (score >= MIN_INTEREST_SCORE) {
              expect(shouldPost).toBe(true);
            } else {
              expect(shouldPost).toBe(false);
            }
          } else {
            expect(score).toBe(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('MIN_INTEREST_SCORE threshold is reasonable (Requirement 6.3)', async () => {
    // Verify the threshold is in a reasonable range
    expect(MIN_INTEREST_SCORE).toBeGreaterThan(0);
    expect(MIN_INTEREST_SCORE).toBeLessThan(100);

    // Verify it's set to the documented value (60)
    expect(MIN_INTEREST_SCORE).toBe(60);
  });

  it('interest score is deterministic for same inputs (Requirement 6.2)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        evaluationReasonArb,
        async (interesting, reason) => {
          const score1 = calculateInterestScore(interesting, reason);
          const score2 = calculateInterestScore(interesting, reason);

          // Same inputs should produce same score
          expect(score1).toBe(score2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('interest score never exceeds 100 (Requirement 6.2)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate reasons with many positive keywords
        fc.array(
          fc.constantFrom(
            'very', 'highly', 'extremely', 'excellent', 'perfect',
            'important', 'significant', 'valuable', 'relevant', 'timely'
          ),
          { minLength: 5, maxLength: 10 }
        ).map(keywords => keywords.join(' ')),
        async (reason) => {
          const score = calculateInterestScore(true, reason);

          // Score should never exceed 100
          expect(score).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('interest score is case-insensitive for keywords (Requirement 6.2)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          'VERY INTERESTING',
          'Very Interesting',
          'very interesting',
          'VeRy InTeReStInG'
        ),
        async (reason) => {
          const score = calculateInterestScore(true, reason);

          // All variations should produce the same score
          const lowerScore = calculateInterestScore(true, reason.toLowerCase());
          expect(score).toBe(lowerScore);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('base score for interesting content without keywords is above 0 (Requirement 6.2)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate reasons without positive keywords
        fc.string({ minLength: 10, maxLength: 100 })
          .filter(s => !s.toLowerCase().match(/very|highly|extremely|excellent|perfect|important|significant|valuable|relevant|timely/)),
        async (reason) => {
          const score = calculateInterestScore(true, reason);

          // Even without keywords, interesting content should have base score
          expect(score).toBeGreaterThan(0);

          // Base score should be reasonable (at least 50)
          expect(score).toBeGreaterThanOrEqual(50);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('evaluation logic separates interesting from uninteresting content (Requirement 6.1, 6.2)', async () => {
    await fc.assert(
      fc.asyncProperty(
        evaluationReasonArb,
        async (reason) => {
          const interestingScore = calculateInterestScore(true, reason);
          const uninterestingScore = calculateInterestScore(false, reason);

          // Interesting content should always have higher score than uninteresting
          expect(interestingScore).toBeGreaterThan(uninterestingScore);

          // Uninteresting should be 0
          expect(uninterestingScore).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('multiple positive keywords accumulate score (Requirement 6.2)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 5 }),
        async (keywordCount) => {
          const keywords = ['very', 'highly', 'extremely', 'excellent', 'perfect'];
          const reason = keywords.slice(0, keywordCount).join(' ') + ' interesting';

          const score = calculateInterestScore(true, reason);

          // More keywords should generally mean higher score (up to cap)
          // Base score is 70, each keyword adds 5
          const expectedMinScore = 70 + (keywordCount * 5);
          const cappedExpectedScore = Math.min(100, expectedMinScore);

          expect(score).toBe(cappedExpectedScore);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: bot-system, Property 21: Autonomous Mode Toggle', () => {
  /**
   * Property 21: Autonomous Mode Toggle
   * 
   * *For any* bot with autonomous mode disabled, the bot SHALL only create posts
   * on schedule, not autonomously.
   * 
   * **Validates: Requirements 6.5**
   */

  it('attemptAutonomousPost returns not posted when autonomous mode is disabled (Requirement 6.5)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (botId) => {
          // Import the mocked module
          const { getBotById } = await import('./botManager');

          // Mock getBotById to return a bot with autonomous mode disabled
          const mockBot = {
            id: botId,
            userId: fc.sample(fc.uuid(), 1)[0],

            name: 'Test Bot',
            handle: 'testbot',
            ownerId: 'test-owner',
            headerUrl: null,
            user: {
              handle: 'testbot',
            },
            bio: null,
            avatarUrl: null,
            personalityConfig: {
              systemPrompt: 'You are a helpful bot',
              temperature: 0.7,
              maxTokens: 500,
            },
            llmProvider: 'openrouter' as LLMProvider,
            llmModel: 'gpt-3.5-turbo',
            scheduleConfig: null,
            autonomousMode: false, // Disabled
            isActive: true,
            isSuspended: false,
            suspensionReason: null,
            suspendedAt: null,
            publicKey: 'test-key',
            lastPostAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          vi.mocked(getBotById).mockResolvedValue(mockBot);

          // Attempt autonomous post
          const result = await attemptAutonomousPost(botId);

          // Should not post when autonomous mode is disabled
          expect(result.posted).toBe(false);
          expect(result.reason).toContain('Autonomous mode is disabled');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('evaluateContentForPosting returns shouldPost false when autonomous mode is disabled (Requirement 6.5)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        contentItemArb,
        async (botId, contentItem) => {
          // Import the mocked module
          const { getBotById } = await import('./botManager');

          // Mock getBotById to return a bot with autonomous mode disabled
          const mockBot = {
            id: botId,
            userId: fc.sample(fc.uuid(), 1)[0],
            name: 'Test Bot',

            handle: 'testbot',
            ownerId: 'test-owner',
            headerUrl: null,
            user: {
              handle: 'testbot',
            },
            bio: null,
            avatarUrl: null,
            personalityConfig: {
              systemPrompt: 'You are a helpful bot',
              temperature: 0.7,
              maxTokens: 500,
            },
            llmProvider: 'openrouter' as LLMProvider,
            llmModel: 'gpt-3.5-turbo',
            scheduleConfig: null,
            autonomousMode: false, // Disabled
            isActive: true,
            isSuspended: false,
            suspensionReason: null,
            suspendedAt: null,
            publicKey: 'test-key',
            lastPostAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          vi.mocked(getBotById).mockResolvedValue(mockBot);

          // Evaluate content
          const evaluation = await evaluateContentForPosting(botId, contentItem);

          // Should not post when autonomous mode is disabled
          expect(evaluation.shouldPost).toBe(false);
          expect(evaluation.reason).toContain('Autonomous mode is disabled');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('canPostAutonomously returns false when autonomous mode is disabled (Requirement 6.5)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (botId) => {
          // Import the mocked module
          const { getBotById } = await import('./botManager');

          // Mock getBotById to return a bot with autonomous mode disabled
          const mockBot = {
            id: botId,
            userId: fc.sample(fc.uuid(), 1)[0],
            name: 'Test Bot',
            handle: 'testbot',
            ownerId: 'test-owner',
            headerUrl: null,
            user: {
              handle: 'testbot',
            },
            bio: null,
            avatarUrl: null,
            personalityConfig: {
              systemPrompt: 'You are a helpful bot',
              temperature: 0.7,
              maxTokens: 500,
            },
            llmProvider: 'openrouter' as LLMProvider,
            llmModel: 'gpt-3.5-turbo',
            scheduleConfig: null,
            autonomousMode: false, // Disabled
            isActive: true,
            isSuspended: false,
            suspensionReason: null,
            suspendedAt: null,
            publicKey: 'test-key',
            lastPostAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          vi.mocked(getBotById).mockResolvedValue(mockBot);

          // Check if can post autonomously
          const result = await canPostAutonomously(botId);

          // Should not be able to post autonomously when mode is disabled
          expect(result.canPost).toBe(false);
          expect(result.reason).toContain('Autonomous mode is disabled');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('autonomous mode disabled prevents evaluation of content interest (Requirement 6.5)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        contentItemArb,
        async (botId, contentItem) => {
          // Import the mocked module
          const { getBotById } = await import('./botManager');

          // Mock getBotById to return a bot with autonomous mode disabled
          const mockBot = {
            id: botId,
            userId: fc.sample(fc.uuid(), 1)[0],
            name: 'Test Bot',

            handle: 'testbot',
            ownerId: 'test-owner',
            headerUrl: null,
            user: {
              handle: 'testbot',
            },
            bio: null,
            avatarUrl: null,
            personalityConfig: {
              systemPrompt: 'You are a helpful bot',
              temperature: 0.7,
              maxTokens: 500,
            },
            llmProvider: 'openrouter' as LLMProvider,
            llmModel: 'gpt-3.5-turbo',
            scheduleConfig: null,
            autonomousMode: false, // Disabled
            isActive: true,
            isSuspended: false,
            suspensionReason: null,
            suspendedAt: null,
            publicKey: 'test-key',
            lastPostAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          vi.mocked(getBotById).mockResolvedValue(mockBot);

          // Spy on ContentGenerator to ensure it's not called
          const { ContentGenerator } = await import('./contentGenerator');
          const evaluateSpy = vi.spyOn(ContentGenerator.prototype, 'evaluateContentInterest');

          // Evaluate content
          const evaluation = await evaluateContentForPosting(botId, contentItem);

          // Should return early without calling LLM
          expect(evaluation.shouldPost).toBe(false);
          expect(evaluateSpy).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('autonomous mode state is consistent across all autonomous functions (Requirement 6.5)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        contentItemArb,
        async (botId, contentItem) => {
          // Import the mocked module
          const { getBotById } = await import('./botManager');

          // Mock getBotById to return a bot with autonomous mode disabled
          const mockBot = {
            id: botId,
            userId: fc.sample(fc.uuid(), 1)[0],
            name: 'Test Bot',

            handle: 'testbot',
            ownerId: 'test-owner',
            headerUrl: null,
            user: {
              handle: 'testbot',
            },
            bio: null,
            avatarUrl: null,
            personalityConfig: {
              systemPrompt: 'You are a helpful bot',
              temperature: 0.7,
              maxTokens: 500,
            },
            llmProvider: 'openrouter' as LLMProvider,
            llmModel: 'gpt-3.5-turbo',
            scheduleConfig: null,
            autonomousMode: false, // Disabled
            isActive: true,
            isSuspended: false,
            suspensionReason: null,
            suspendedAt: null,
            publicKey: 'test-key',
            lastPostAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          vi.mocked(getBotById).mockResolvedValue(mockBot);

          // Check all autonomous functions
          const canPostResult = await canPostAutonomously(botId);
          const attemptResult = await attemptAutonomousPost(botId);
          const evaluateResult = await evaluateContentForPosting(botId, contentItem);

          // All should consistently report autonomous mode is disabled
          expect(canPostResult.canPost).toBe(false);
          expect(canPostResult.reason).toContain('Autonomous mode is disabled');

          expect(attemptResult.posted).toBe(false);
          expect(attemptResult.reason).toContain('Autonomous mode is disabled');

          expect(evaluateResult.shouldPost).toBe(false);
          expect(evaluateResult.reason).toContain('Autonomous mode is disabled');
        }
      ),
      { numRuns: 100 }
    );
  });
});
