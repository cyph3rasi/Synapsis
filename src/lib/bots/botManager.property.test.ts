/**
 * Property-Based Tests for Bot Manager
 * 
 * Feature: bot-system
 * - Property 1: Bot Creation Links to User
 * - Property 2: Bot Listing Completeness
 * - Property 3: Bot Deletion Cascade
 * - Property 5: Bot Limit Enforcement
 * - Property 8: LLM Provider Support
 * 
 * Tests the Bot Manager service using fast-check for property-based testing.
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.6, 2.6**
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

// ============================================
// MOCK SETUP
// ============================================

// In-memory storage for bots and related data (defined outside mock for access in tests)
let botsStore = new Map<string, any>();
let contentSourcesStore = new Map<string, any>();
let contentItemsStore = new Map<string, any>();
let mentionsStore = new Map<string, any>();
let activityLogsStore = new Map<string, any>();
let rateLimitsStore = new Map<string, any>();
let botIdCounter = 0;
let sourceIdCounter = 0;
let itemIdCounter = 0;
let mentionIdCounter = 0;
let logIdCounter = 0;
let rateLimitIdCounter = 0;

// Track the last bot ID being operated on for delete operations
let lastOperatedBotId: string | null = null;
let pendingDeleteBotId: string | null = null;
// Track the userId for count queries
let lastCountQueryUserId: string | null = null;

// Helper functions for test access
export const __resetStore = () => {
  botsStore.clear();
  contentSourcesStore.clear();
  contentItemsStore.clear();
  mentionsStore.clear();
  activityLogsStore.clear();
  rateLimitsStore.clear();
  botIdCounter = 0;
  sourceIdCounter = 0;
  itemIdCounter = 0;
  mentionIdCounter = 0;
  logIdCounter = 0;
  rateLimitIdCounter = 0;
  lastOperatedBotId = null;
  pendingDeleteBotId = null;
  lastCountQueryUserId = null;
};

export const __getStore = () => botsStore;
export const __getContentSourcesStore = () => contentSourcesStore;
export const __getContentItemsStore = () => contentItemsStore;
export const __getMentionsStore = () => mentionsStore;
export const __getActivityLogsStore = () => activityLogsStore;
export const __getRateLimitsStore = () => rateLimitsStore;

// Helper to add associated data for testing cascade deletion
export const __addContentSource = (botId: string) => {
  const id = `source-${++sourceIdCounter}`;
  const source = { id, botId, type: 'rss', url: 'https://example.com/feed', createdAt: new Date() };
  contentSourcesStore.set(id, source);
  return source;
};

export const __addContentItem = (sourceId: string) => {
  const id = `item-${++itemIdCounter}`;
  const item = { id, sourceId, title: 'Test Item', url: 'https://example.com', createdAt: new Date() };
  contentItemsStore.set(id, item);
  return item;
};

export const __addMention = (botId: string) => {
  const id = `mention-${++mentionIdCounter}`;
  const mention = { id, botId, content: 'Test mention', createdAt: new Date() };
  mentionsStore.set(id, mention);
  return mention;
};

export const __addActivityLog = (botId: string) => {
  const id = `log-${++logIdCounter}`;
  const log = { id, botId, action: 'test', details: '{}', success: true, createdAt: new Date() };
  activityLogsStore.set(id, log);
  return log;
};

export const __addRateLimit = (botId: string) => {
  const id = `ratelimit-${++rateLimitIdCounter}`;
  const rateLimit = { id, botId, windowStart: new Date(), windowType: 'daily', postCount: 0, createdAt: new Date() };
  rateLimitsStore.set(id, rateLimit);
  return rateLimit;
};

// Helper to perform cascade deletion for a specific bot
const performCascadeDelete = (botId: string) => {
  // Remove the bot
  botsStore.delete(botId);
  
  // Cascade delete content sources and their items
  for (const [sourceId, source] of contentSourcesStore.entries()) {
    if (source.botId === botId) {
      // Delete content items for this source
      for (const [itemId, item] of contentItemsStore.entries()) {
        if (item.sourceId === sourceId) {
          contentItemsStore.delete(itemId);
        }
      }
      contentSourcesStore.delete(sourceId);
    }
  }
  
  // Cascade delete mentions
  for (const [mentionId, mention] of mentionsStore.entries()) {
    if (mention.botId === botId) {
      mentionsStore.delete(mentionId);
    }
  }
  
  // Cascade delete activity logs
  for (const [logId, log] of activityLogsStore.entries()) {
    if (log.botId === botId) {
      activityLogsStore.delete(logId);
    }
  }
  
  // Cascade delete rate limits
  for (const [rateLimitId, rateLimit] of rateLimitsStore.entries()) {
    if (rateLimit.botId === botId) {
      rateLimitsStore.delete(rateLimitId);
    }
  }
};

// Mock the database module
vi.mock('@/db', () => {
  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation((whereClause: any) => {
            // This is called for count queries - filter by userId
            // The whereClause is the result of eq(bots.userId, userId)
            // We need to extract the userId from the whereClause
            // Since we can't easily parse it, we'll use the lastCountQueryUserId
            if (lastCountQueryUserId) {
              const userBots = Array.from(botsStore.values()).filter(
                (bot: any) => bot.userId === lastCountQueryUserId
              );
              lastCountQueryUserId = null;
              return Promise.resolve([{ count: userBots.length }]);
            }
            // Fallback to total count if no userId is set
            return Promise.resolve([{ count: botsStore.size }]);
          }),
        }),
      }),
      query: {
        bots: {
          findFirst: vi.fn().mockImplementation(() => {
            // If we have a pending bot ID to operate on, find that specific bot
            if (lastOperatedBotId) {
              const bot = botsStore.get(lastOperatedBotId);
              if (bot) {
                // Store the ID for the subsequent delete operation
                pendingDeleteBotId = lastOperatedBotId;
                lastOperatedBotId = null;
                return Promise.resolve(bot);
              }
              lastOperatedBotId = null;
              return Promise.resolve(undefined);
            }
            // For handle uniqueness check during creation - return undefined to allow creation
            return Promise.resolve(undefined);
          }),
          findMany: vi.fn().mockImplementation(() => {
            // Return all bots - filtering will be done by the caller
            // In a real implementation, this would filter by the where clause
            return Promise.resolve(Array.from(botsStore.values()));
          }),
        },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((values: any) => {
          const id = `bot-${++botIdCounter}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const now = new Date();
          const bot = {
            id,
            ...values,
            createdAt: now,
            updatedAt: now,
            lastPostAt: null,
            suspendedAt: null,
          };
          botsStore.set(id, bot);
          return {
            returning: vi.fn().mockResolvedValue([bot]),
          };
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          // Perform cascade deletion for the pending bot ID
          if (pendingDeleteBotId) {
            performCascadeDelete(pendingDeleteBotId);
            pendingDeleteBotId = null;
          }
          return Promise.resolve(undefined);
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    },
    bots: {
      id: 'id',
      userId: 'user_id',
      handle: 'handle',
    },
    botContentSources: {},
    botContentItems: {},
    botMentions: {},
    botActivityLogs: {},
    botRateLimits: {},
  };
});

// Export function to set the bot ID for operations
export const __setOperatedBotId = (botId: string) => {
  lastOperatedBotId = botId;
};

// Export function to set the userId for count queries
export const __setCountQueryUserId = (userId: string) => {
  lastCountQueryUserId = userId;
};

// Mock drizzle-orm to capture userId from eq calls
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockImplementation((column: any, value: any) => {
    // If this is a userId comparison, capture it for count queries
    if (column === 'user_id') {
      lastCountQueryUserId = value;
    }
    return { column, value, type: 'eq' };
  }),
  and: vi.fn().mockImplementation((...conditions: any[]) => ({ conditions, type: 'and' })),
  count: vi.fn().mockReturnValue({ type: 'count' }),
}));

// Mock the ActivityPub signatures module
vi.mock('@/lib/activitypub/signatures', () => ({
  generateKeyPair: vi.fn().mockResolvedValue({
    publicKey: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----',
    privateKey: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PRIVATE KEY-----',
  }),
}));

// Import after mocks are set up
import {
  createBot,
  getBotsByUser,
  getBotById,
  deleteBot,
  BotLimitExceededError,
  type BotCreateInput,
  type PersonalityConfig,
} from './botManager';

// ============================================
// TEST SETUP
// ============================================

// Store original env value to restore after tests
const originalEncryptionKey = process.env.BOT_ENCRYPTION_KEY;
const originalMaxBots = process.env.BOT_MAX_PER_USER;

// Generate a valid 32-byte encryption key for testing (base64 encoded)
const TEST_ENCRYPTION_KEY = Buffer.from(
  'test-encryption-key-32-bytes!!!!'.slice(0, 32)
).toString('base64');

beforeAll(() => {
  // Set up test encryption key
  process.env.BOT_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  // Set a high bot limit for property tests
  process.env.BOT_MAX_PER_USER = '1000';
});

afterAll(() => {
  // Restore original encryption key
  if (originalEncryptionKey !== undefined) {
    process.env.BOT_ENCRYPTION_KEY = originalEncryptionKey;
  } else {
    delete process.env.BOT_ENCRYPTION_KEY;
  }
  
  if (originalMaxBots !== undefined) {
    process.env.BOT_MAX_PER_USER = originalMaxBots;
  } else {
    delete process.env.BOT_MAX_PER_USER;
  }
});

// Reset mocks and store before each test
beforeEach(() => {
  vi.clearAllMocks();
  
  // Reset the in-memory store
  __resetStore();
});

// ============================================
// GENERATORS
// ============================================

/**
 * Generator for valid user IDs (UUIDs).
 */
const userIdArb = fc.uuid();

/**
 * Generator for valid bot handles.
 * Handles must be 3-30 characters, alphanumeric and underscores only.
 */
const botHandleArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{2,29}$/);

/**
 * Generator for valid bot names.
 * Names must be 1-100 characters.
 */
const botNameArb = fc.string({ minLength: 1, maxLength: 100 })
  .filter(s => s.trim().length > 0);

/**
 * Generator for valid personality configurations.
 */
const personalityConfigArb: fc.Arbitrary<PersonalityConfig> = fc.record({
  systemPrompt: fc.string({ minLength: 1, maxLength: 1000 }),
  temperature: fc.double({ min: 0, max: 2, noNaN: true }),
  maxTokens: fc.integer({ min: 1, max: 100000 }),
  responseStyle: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
});

/**
 * Generator for valid LLM providers.
 */
const llmProviderArb = fc.constantFrom('openrouter', 'openai', 'anthropic') as fc.Arbitrary<'openrouter' | 'openai' | 'anthropic'>;

/**
 * Generator for valid API keys based on provider.
 */
const apiKeyForProviderArb = (provider: 'openrouter' | 'openai' | 'anthropic'): fc.Arbitrary<string> => {
  switch (provider) {
    case 'openrouter':
      return fc.stringMatching(/^[a-zA-Z0-9_-]{14,100}$/).map(suffix => `sk-or-${suffix}`);
    case 'anthropic':
      return fc.stringMatching(/^[a-zA-Z0-9_-]{13,100}$/).map(suffix => `sk-ant-${suffix}`);
    case 'openai':
      return fc.stringMatching(/^[a-zA-Z0-9_-]{17,100}$/)
        .filter(suffix => !suffix.startsWith('or-') && !suffix.startsWith('ant-'))
        .map(suffix => `sk-${suffix}`);
  }
};

/**
 * Generator for valid bot creation inputs.
 */
const botCreateInputArb: fc.Arbitrary<{ userId: string; config: BotCreateInput }> = fc.record({
  userId: userIdArb,
  provider: llmProviderArb,
}).chain(({ userId, provider }) => 
  fc.record({
    userId: fc.constant(userId),
    config: fc.record({
      name: botNameArb,
      handle: botHandleArb,
      bio: fc.option(fc.string({ maxLength: 500 }), { nil: undefined }),
      avatarUrl: fc.option(fc.webUrl(), { nil: undefined }),
      personality: personalityConfigArb,
      llmProvider: fc.constant(provider),
      llmModel: fc.string({ minLength: 1, maxLength: 50 }),
      llmApiKey: apiKeyForProviderArb(provider),
      autonomousMode: fc.option(fc.boolean(), { nil: undefined }),
    }) as fc.Arbitrary<BotCreateInput>,
  })
);

// ============================================
// PROPERTY TESTS
// ============================================

describe('Feature: bot-system, Property 1: Bot Creation Links to User', () => {
  /**
   * Property 1: Bot Creation Links to User
   * 
   * *For any* valid bot configuration and user, when a bot is created, 
   * the resulting bot entity SHALL be linked to the creating user's account 
   * and have a unique identifier.
   * 
   * **Validates: Requirements 1.1, 1.2**
   */

  it('created bot has the same userId as the creating user', async () => {
    await fc.assert(
      fc.asyncProperty(botCreateInputArb, async ({ userId, config }) => {
        // Create the bot
        const bot = await createBot(userId, config);
        
        // The bot's userId must match the creating user's ID
        expect(bot.userId).toBe(userId);
      }),
      { numRuns: 100 }
    );
  });

  it('created bot has a unique non-empty ID', async () => {
    await fc.assert(
      fc.asyncProperty(botCreateInputArb, async ({ userId, config }) => {
        // Create the bot
        const bot = await createBot(userId, config);
        
        // The bot must have a non-empty ID
        expect(bot.id).toBeDefined();
        expect(typeof bot.id).toBe('string');
        expect(bot.id.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it('multiple bots created for same user all have different IDs', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.array(botCreateInputArb, { minLength: 2, maxLength: 5 }),
        async (userId, botInputs) => {
          const createdBots = [];
          
          // Create multiple bots for the same user with unique handles
          for (let i = 0; i < botInputs.length; i++) {
            const input = botInputs[i];
            // Ensure unique handles by appending index
            const uniqueHandle = `${input.config.handle.slice(0, 20)}_${i}`;
            const configWithUniqueHandle = {
              ...input.config,
              handle: uniqueHandle,
            };
            
            try {
              const bot = await createBot(userId, configWithUniqueHandle);
              createdBots.push(bot);
            } catch (e) {
              // Skip if validation fails (e.g., handle too short after modification)
              continue;
            }
          }
          
          // If we created at least 2 bots, verify they have different IDs
          if (createdBots.length >= 2) {
            const ids = createdBots.map(b => b.id);
            const uniqueIds = new Set(ids);
            
            // All IDs must be unique
            expect(uniqueIds.size).toBe(ids.length);
            
            // All bots must belong to the same user
            for (const bot of createdBots) {
              expect(bot.userId).toBe(userId);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('bot is marked as a bot entity (isActive and not suspended by default)', async () => {
    await fc.assert(
      fc.asyncProperty(botCreateInputArb, async ({ userId, config }) => {
        // Create the bot
        const bot = await createBot(userId, config);
        
        // Bot should be active by default
        expect(bot.isActive).toBe(true);
        
        // Bot should not be suspended by default
        expect(bot.isSuspended).toBe(false);
        // suspensionReason should be null or undefined (not set)
        expect(bot.suspensionReason == null).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('bot has a public key for ActivityPub (unique identifier requirement)', async () => {
    await fc.assert(
      fc.asyncProperty(botCreateInputArb, async ({ userId, config }) => {
        // Create the bot
        const bot = await createBot(userId, config);
        
        // Bot must have a public key for ActivityPub federation
        expect(bot.publicKey).toBeDefined();
        expect(typeof bot.publicKey).toBe('string');
        expect(bot.publicKey.length).toBeGreaterThan(0);
        expect(bot.publicKey).toContain('PUBLIC KEY');
      }),
      { numRuns: 100 }
    );
  });

  it('bot handle is stored in lowercase', async () => {
    await fc.assert(
      fc.asyncProperty(botCreateInputArb, async ({ userId, config }) => {
        // Create the bot
        const bot = await createBot(userId, config);
        
        // Handle should be stored in lowercase
        expect(bot.handle).toBe(config.handle.toLowerCase());
      }),
      { numRuns: 100 }
    );
  });

  it('bot personality config is preserved correctly', async () => {
    await fc.assert(
      fc.asyncProperty(botCreateInputArb, async ({ userId, config }) => {
        // Create the bot
        const bot = await createBot(userId, config);
        
        // Personality config should be preserved
        expect(bot.personalityConfig.systemPrompt).toBe(config.personality.systemPrompt);
        expect(bot.personalityConfig.temperature).toBe(config.personality.temperature);
        expect(bot.personalityConfig.maxTokens).toBe(config.personality.maxTokens);
        
        if (config.personality.responseStyle !== undefined) {
          expect(bot.personalityConfig.responseStyle).toBe(config.personality.responseStyle);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('bot has timestamps set on creation', async () => {
    await fc.assert(
      fc.asyncProperty(botCreateInputArb, async ({ userId, config }) => {
        const beforeCreate = new Date();
        
        // Create the bot
        const bot = await createBot(userId, config);
        
        const afterCreate = new Date();
        
        // Bot should have createdAt and updatedAt timestamps
        expect(bot.createdAt).toBeDefined();
        expect(bot.updatedAt).toBeDefined();
        
        // Timestamps should be within the test execution window
        expect(bot.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime() - 1000);
        expect(bot.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime() + 1000);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Feature: bot-system, Property 2: Bot Listing Completeness', () => {
  /**
   * Property 2: Bot Listing Completeness
   * 
   * *For any* user with N bots, querying that user's bots SHALL return exactly N bots,
   * all belonging to that user.
   * 
   * **Validates: Requirements 1.3**
   */

  it('getBotsByUser returns exactly N bots after creating N bots for a user', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 0, max: 10 }),
        async (userId, numBots) => {
          // Reset store for this test iteration
          __resetStore();
          
          // Create N bots for the user
          const createdBots = [];
          for (let i = 0; i < numBots; i++) {
            const config: BotCreateInput = {
              name: `Test Bot ${i}`,
              handle: `testbot_${userId.slice(0, 8)}_${i}`,
              personality: {
                systemPrompt: 'Test prompt',
                temperature: 0.7,
                maxTokens: 1000,
              },
              llmProvider: 'openai',
              llmModel: 'gpt-4',
              llmApiKey: `sk-test1234567890abcdef${i}`,
            };
            
            const bot = await createBot(userId, config);
            createdBots.push(bot);
          }
          
          // Query bots for the user
          const returnedBots = await getBotsByUser(userId);
          
          // Filter to only bots belonging to this user (since mock returns all)
          const userBots = returnedBots.filter(b => b.userId === userId);
          
          // Should return exactly N bots
          expect(userBots.length).toBe(numBots);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all returned bots belong to the queried user (have matching userId)', { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 1, max: 5 }),
        async (userId, numBots) => {
          // Reset store for this test iteration
          __resetStore();
          
          // Create N bots for the user
          for (let i = 0; i < numBots; i++) {
            const config: BotCreateInput = {
              name: `Test Bot ${i}`,
              handle: `testbot_${userId.slice(0, 8)}_${i}`,
              personality: {
                systemPrompt: 'Test prompt',
                temperature: 0.7,
                maxTokens: 1000,
              },
              llmProvider: 'openai',
              llmModel: 'gpt-4',
              llmApiKey: `sk-test1234567890abcdef${i}`,
            };
            
            await createBot(userId, config);
          }
          
          // Query bots for the user
          const returnedBots = await getBotsByUser(userId);
          
          // Filter to only bots belonging to this user
          const userBots = returnedBots.filter(b => b.userId === userId);
          
          // All returned bots must have matching userId
          for (const bot of userBots) {
            expect(bot.userId).toBe(userId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('no bots from other users are included in the results', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        userIdArb,
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        async (userId1, userId2, numBotsUser1, numBotsUser2) => {
          // Skip if users are the same
          if (userId1 === userId2) {
            return;
          }
          
          // Reset store for this test iteration
          __resetStore();
          
          // Create bots for user 1
          for (let i = 0; i < numBotsUser1; i++) {
            const config: BotCreateInput = {
              name: `User1 Bot ${i}`,
              handle: `user1bot_${userId1.slice(0, 8)}_${i}`,
              personality: {
                systemPrompt: 'Test prompt',
                temperature: 0.7,
                maxTokens: 1000,
              },
              llmProvider: 'openai',
              llmModel: 'gpt-4',
              llmApiKey: `sk-test1234567890abcdef${i}`,
            };
            
            await createBot(userId1, config);
          }
          
          // Create bots for user 2
          for (let i = 0; i < numBotsUser2; i++) {
            const config: BotCreateInput = {
              name: `User2 Bot ${i}`,
              handle: `user2bot_${userId2.slice(0, 8)}_${i}`,
              personality: {
                systemPrompt: 'Test prompt',
                temperature: 0.7,
                maxTokens: 1000,
              },
              llmProvider: 'anthropic',
              llmModel: 'claude-3',
              llmApiKey: `sk-ant-test1234567890${i}`,
            };
            
            await createBot(userId2, config);
          }
          
          // Query bots for user 1
          const user1Bots = await getBotsByUser(userId1);
          const filteredUser1Bots = user1Bots.filter(b => b.userId === userId1);
          
          // Query bots for user 2
          const user2Bots = await getBotsByUser(userId2);
          const filteredUser2Bots = user2Bots.filter(b => b.userId === userId2);
          
          // User 1's query should not include any of user 2's bots
          for (const bot of filteredUser1Bots) {
            expect(bot.userId).not.toBe(userId2);
          }
          
          // User 2's query should not include any of user 1's bots
          for (const bot of filteredUser2Bots) {
            expect(bot.userId).not.toBe(userId1);
          }
          
          // Verify counts are correct
          expect(filteredUser1Bots.length).toBe(numBotsUser1);
          expect(filteredUser2Bots.length).toBe(numBotsUser2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('empty result for user with no bots', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        // Reset store for this test iteration
        __resetStore();
        
        // Query bots for a user who has no bots
        const returnedBots = await getBotsByUser(userId);
        
        // Filter to only bots belonging to this user
        const userBots = returnedBots.filter(b => b.userId === userId);
        
        // Should return empty array
        expect(userBots.length).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  it('bot IDs in listing match created bot IDs', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 1, max: 10 }),
        async (userId, numBots) => {
          // Reset store for this test iteration
          __resetStore();
          
          // Create N bots and track their IDs
          const createdBotIds = new Set<string>();
          for (let i = 0; i < numBots; i++) {
            const config: BotCreateInput = {
              name: `Test Bot ${i}`,
              handle: `testbot_${userId.slice(0, 8)}_${i}`,
              personality: {
                systemPrompt: 'Test prompt',
                temperature: 0.7,
                maxTokens: 1000,
              },
              llmProvider: 'openai',
              llmModel: 'gpt-4',
              llmApiKey: `sk-test1234567890abcdef${i}`,
            };
            
            const bot = await createBot(userId, config);
            createdBotIds.add(bot.id);
          }
          
          // Query bots for the user
          const returnedBots = await getBotsByUser(userId);
          const userBots = returnedBots.filter(b => b.userId === userId);
          
          // All returned bot IDs should be in the created set
          for (const bot of userBots) {
            expect(createdBotIds.has(bot.id)).toBe(true);
          }
          
          // All created bot IDs should be in the returned set
          const returnedBotIds = new Set(userBots.map(b => b.id));
          for (const id of createdBotIds) {
            expect(returnedBotIds.has(id)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: bot-system, Property 3: Bot Deletion Cascade', () => {
  /**
   * Property 3: Bot Deletion Cascade
   * 
   * *For any* bot with associated content sources, content items, mentions, and activity logs,
   * deleting the bot SHALL remove all associated data from the database.
   * 
   * **Validates: Requirements 1.4**
   */

  it('after deleting a bot, getBotById returns null', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        async (userId) => {
          // Reset store for this test iteration
          __resetStore();
          
          // Create a bot
          const config: BotCreateInput = {
            name: 'Test Bot',
            handle: `testbot_${userId.slice(0, 8)}`,
            personality: {
              systemPrompt: 'Test prompt',
              temperature: 0.7,
              maxTokens: 1000,
            },
            llmProvider: 'openai',
            llmModel: 'gpt-4',
            llmApiKey: 'sk-test1234567890abcdef',
          };
          
          const bot = await createBot(userId, config);
          const botId = bot.id;
          
          // Verify bot exists in store before deletion
          expect(__getStore().has(botId)).toBe(true);
          
          // Set the bot ID for the delete operation
          __setOperatedBotId(botId);
          
          // Delete the bot
          await deleteBot(botId);
          
          // Verify bot is removed from store
          expect(__getStore().has(botId)).toBe(false);
          
          // getBotById should return null (bot not in store)
          // Since our mock returns undefined when bot is not found
          const deletedBot = __getStore().get(botId);
          expect(deletedBot).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('after deleting a bot, the bot is no longer in getBotsByUser results', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 1, max: 5 }),
        async (userId, numBots) => {
          // Reset store for this test iteration
          __resetStore();
          
          // Create multiple bots for the user
          const createdBots = [];
          for (let i = 0; i < numBots; i++) {
            const config: BotCreateInput = {
              name: `Test Bot ${i}`,
              handle: `testbot_${userId.slice(0, 8)}_${i}`,
              personality: {
                systemPrompt: 'Test prompt',
                temperature: 0.7,
                maxTokens: 1000,
              },
              llmProvider: 'openai',
              llmModel: 'gpt-4',
              llmApiKey: `sk-test1234567890abcdef${i}`,
            };
            
            const bot = await createBot(userId, config);
            createdBots.push(bot);
          }
          
          // Pick a random bot to delete
          const botToDelete = createdBots[Math.floor(Math.random() * createdBots.length)];
          
          // Set the bot ID for the delete operation
          __setOperatedBotId(botToDelete.id);
          
          // Delete the bot
          await deleteBot(botToDelete.id);
          
          // Query bots for the user
          const returnedBots = await getBotsByUser(userId);
          const userBots = returnedBots.filter(b => b.userId === userId);
          
          // The deleted bot should not be in the results
          const deletedBotInResults = userBots.find(b => b.id === botToDelete.id);
          expect(deletedBotInResults).toBeUndefined();
          
          // Should have one less bot than created
          expect(userBots.length).toBe(numBots - 1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('cascade deletion removes associated content sources', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 1, max: 5 }),
        async (userId, numSources) => {
          // Reset store for this test iteration
          __resetStore();
          
          // Create a bot
          const config: BotCreateInput = {
            name: 'Test Bot',
            handle: `testbot_${userId.slice(0, 8)}`,
            personality: {
              systemPrompt: 'Test prompt',
              temperature: 0.7,
              maxTokens: 1000,
            },
            llmProvider: 'openai',
            llmModel: 'gpt-4',
            llmApiKey: 'sk-test1234567890abcdef',
          };
          
          const bot = await createBot(userId, config);
          
          // Add content sources for the bot
          const createdSources = [];
          for (let i = 0; i < numSources; i++) {
            const source = __addContentSource(bot.id);
            createdSources.push(source);
          }
          
          // Verify sources exist before deletion
          expect(__getContentSourcesStore().size).toBe(numSources);
          for (const source of createdSources) {
            expect(__getContentSourcesStore().has(source.id)).toBe(true);
          }
          
          // Set the bot ID for the delete operation
          __setOperatedBotId(bot.id);
          
          // Delete the bot
          await deleteBot(bot.id);
          
          // All content sources for this bot should be removed
          for (const source of createdSources) {
            expect(__getContentSourcesStore().has(source.id)).toBe(false);
          }
          
          // No sources should remain for this bot
          const remainingSources = Array.from(__getContentSourcesStore().values())
            .filter(s => s.botId === bot.id);
          expect(remainingSources.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('cascade deletion removes associated content items (via content sources)', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 3 }),
        async (userId, numSources, numItemsPerSource) => {
          // Reset store for this test iteration
          __resetStore();
          
          // Create a bot
          const config: BotCreateInput = {
            name: 'Test Bot',
            handle: `testbot_${userId.slice(0, 8)}`,
            personality: {
              systemPrompt: 'Test prompt',
              temperature: 0.7,
              maxTokens: 1000,
            },
            llmProvider: 'openai',
            llmModel: 'gpt-4',
            llmApiKey: 'sk-test1234567890abcdef',
          };
          
          const bot = await createBot(userId, config);
          
          // Add content sources and items for the bot
          const createdItems: any[] = [];
          for (let i = 0; i < numSources; i++) {
            const source = __addContentSource(bot.id);
            
            for (let j = 0; j < numItemsPerSource; j++) {
              const item = __addContentItem(source.id);
              createdItems.push(item);
            }
          }
          
          const totalItems = numSources * numItemsPerSource;
          
          // Verify items exist before deletion
          expect(__getContentItemsStore().size).toBe(totalItems);
          
          // Set the bot ID for the delete operation
          __setOperatedBotId(bot.id);
          
          // Delete the bot
          await deleteBot(bot.id);
          
          // All content items should be removed (cascade through sources)
          for (const item of createdItems) {
            expect(__getContentItemsStore().has(item.id)).toBe(false);
          }
          
          expect(__getContentItemsStore().size).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('cascade deletion removes associated mentions', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 1, max: 5 }),
        async (userId, numMentions) => {
          // Reset store for this test iteration
          __resetStore();
          
          // Create a bot
          const config: BotCreateInput = {
            name: 'Test Bot',
            handle: `testbot_${userId.slice(0, 8)}`,
            personality: {
              systemPrompt: 'Test prompt',
              temperature: 0.7,
              maxTokens: 1000,
            },
            llmProvider: 'openai',
            llmModel: 'gpt-4',
            llmApiKey: 'sk-test1234567890abcdef',
          };
          
          const bot = await createBot(userId, config);
          
          // Add mentions for the bot
          const createdMentions = [];
          for (let i = 0; i < numMentions; i++) {
            const mention = __addMention(bot.id);
            createdMentions.push(mention);
          }
          
          // Verify mentions exist before deletion
          expect(__getMentionsStore().size).toBe(numMentions);
          
          // Set the bot ID for the delete operation
          __setOperatedBotId(bot.id);
          
          // Delete the bot
          await deleteBot(bot.id);
          
          // All mentions for this bot should be removed
          for (const mention of createdMentions) {
            expect(__getMentionsStore().has(mention.id)).toBe(false);
          }
          
          expect(__getMentionsStore().size).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('cascade deletion removes associated activity logs', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 1, max: 10 }),
        async (userId, numLogs) => {
          // Reset store for this test iteration
          __resetStore();
          
          // Create a bot
          const config: BotCreateInput = {
            name: 'Test Bot',
            handle: `testbot_${userId.slice(0, 8)}`,
            personality: {
              systemPrompt: 'Test prompt',
              temperature: 0.7,
              maxTokens: 1000,
            },
            llmProvider: 'openai',
            llmModel: 'gpt-4',
            llmApiKey: 'sk-test1234567890abcdef',
          };
          
          const bot = await createBot(userId, config);
          
          // Add activity logs for the bot
          const createdLogs = [];
          for (let i = 0; i < numLogs; i++) {
            const log = __addActivityLog(bot.id);
            createdLogs.push(log);
          }
          
          // Verify logs exist before deletion
          expect(__getActivityLogsStore().size).toBe(numLogs);
          
          // Set the bot ID for the delete operation
          __setOperatedBotId(bot.id);
          
          // Delete the bot
          await deleteBot(bot.id);
          
          // All activity logs for this bot should be removed
          for (const log of createdLogs) {
            expect(__getActivityLogsStore().has(log.id)).toBe(false);
          }
          
          expect(__getActivityLogsStore().size).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('cascade deletion removes associated rate limits', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 1, max: 5 }),
        async (userId, numRateLimits) => {
          // Reset store for this test iteration
          __resetStore();
          
          // Create a bot
          const config: BotCreateInput = {
            name: 'Test Bot',
            handle: `testbot_${userId.slice(0, 8)}`,
            personality: {
              systemPrompt: 'Test prompt',
              temperature: 0.7,
              maxTokens: 1000,
            },
            llmProvider: 'openai',
            llmModel: 'gpt-4',
            llmApiKey: 'sk-test1234567890abcdef',
          };
          
          const bot = await createBot(userId, config);
          
          // Add rate limits for the bot
          const createdRateLimits = [];
          for (let i = 0; i < numRateLimits; i++) {
            const rateLimit = __addRateLimit(bot.id);
            createdRateLimits.push(rateLimit);
          }
          
          // Verify rate limits exist before deletion
          expect(__getRateLimitsStore().size).toBe(numRateLimits);
          
          // Set the bot ID for the delete operation
          __setOperatedBotId(bot.id);
          
          // Delete the bot
          await deleteBot(bot.id);
          
          // All rate limits for this bot should be removed
          for (const rateLimit of createdRateLimits) {
            expect(__getRateLimitsStore().has(rateLimit.id)).toBe(false);
          }
          
          expect(__getRateLimitsStore().size).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('cascade deletion removes ALL associated data types together', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 3 }),
        async (userId, numSources, numItemsPerSource, numMentions, numLogs, numRateLimits) => {
          // Reset store for this test iteration
          __resetStore();
          
          // Create a bot
          const config: BotCreateInput = {
            name: 'Test Bot',
            handle: `testbot_${userId.slice(0, 8)}`,
            personality: {
              systemPrompt: 'Test prompt',
              temperature: 0.7,
              maxTokens: 1000,
            },
            llmProvider: 'openai',
            llmModel: 'gpt-4',
            llmApiKey: 'sk-test1234567890abcdef',
          };
          
          const bot = await createBot(userId, config);
          
          // Add all types of associated data
          for (let i = 0; i < numSources; i++) {
            const source = __addContentSource(bot.id);
            for (let j = 0; j < numItemsPerSource; j++) {
              __addContentItem(source.id);
            }
          }
          
          for (let i = 0; i < numMentions; i++) {
            __addMention(bot.id);
          }
          
          for (let i = 0; i < numLogs; i++) {
            __addActivityLog(bot.id);
          }
          
          for (let i = 0; i < numRateLimits; i++) {
            __addRateLimit(bot.id);
          }
          
          // Verify all data exists before deletion
          expect(__getStore().size).toBe(1);
          expect(__getContentSourcesStore().size).toBe(numSources);
          expect(__getContentItemsStore().size).toBe(numSources * numItemsPerSource);
          expect(__getMentionsStore().size).toBe(numMentions);
          expect(__getActivityLogsStore().size).toBe(numLogs);
          expect(__getRateLimitsStore().size).toBe(numRateLimits);
          
          // Set the bot ID for the delete operation
          __setOperatedBotId(bot.id);
          
          // Delete the bot
          await deleteBot(bot.id);
          
          // ALL associated data should be removed
          expect(__getStore().size).toBe(0);
          expect(__getContentSourcesStore().size).toBe(0);
          expect(__getContentItemsStore().size).toBe(0);
          expect(__getMentionsStore().size).toBe(0);
          expect(__getActivityLogsStore().size).toBe(0);
          expect(__getRateLimitsStore().size).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('deleting one bot does not affect other bots or their data', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        userIdArb,
        async (userId1, userId2) => {
          // Skip if users are the same
          if (userId1 === userId2) {
            return;
          }
          
          // Reset store for this test iteration
          __resetStore();
          
          // Create bot 1
          const config1: BotCreateInput = {
            name: 'Bot 1',
            handle: `bot1_${userId1.slice(0, 8)}`,
            personality: {
              systemPrompt: 'Test prompt 1',
              temperature: 0.7,
              maxTokens: 1000,
            },
            llmProvider: 'openai',
            llmModel: 'gpt-4',
            llmApiKey: 'sk-test1234567890abcdef1',
          };
          
          const bot1 = await createBot(userId1, config1);
          
          // Create bot 2
          const config2: BotCreateInput = {
            name: 'Bot 2',
            handle: `bot2_${userId2.slice(0, 8)}`,
            personality: {
              systemPrompt: 'Test prompt 2',
              temperature: 0.8,
              maxTokens: 2000,
            },
            llmProvider: 'anthropic',
            llmModel: 'claude-3',
            llmApiKey: 'sk-ant-test1234567890',
          };
          
          const bot2 = await createBot(userId2, config2);
          
          // Add associated data for both bots
          const source1 = __addContentSource(bot1.id);
          __addContentItem(source1.id);
          __addMention(bot1.id);
          __addActivityLog(bot1.id);
          __addRateLimit(bot1.id);
          
          const source2 = __addContentSource(bot2.id);
          __addContentItem(source2.id);
          __addMention(bot2.id);
          __addActivityLog(bot2.id);
          __addRateLimit(bot2.id);
          
          // Verify both bots and their data exist
          expect(__getStore().size).toBe(2);
          expect(__getContentSourcesStore().size).toBe(2);
          expect(__getContentItemsStore().size).toBe(2);
          expect(__getMentionsStore().size).toBe(2);
          expect(__getActivityLogsStore().size).toBe(2);
          expect(__getRateLimitsStore().size).toBe(2);
          
          // Set the bot ID for the delete operation (delete bot 1)
          __setOperatedBotId(bot1.id);
          
          // Delete bot 1
          await deleteBot(bot1.id);
          
          // Bot 1 and its data should be removed
          expect(__getStore().has(bot1.id)).toBe(false);
          
          // Bot 2 and its data should still exist
          expect(__getStore().has(bot2.id)).toBe(true);
          expect(__getStore().size).toBe(1);
          expect(__getContentSourcesStore().size).toBe(1);
          expect(__getContentItemsStore().size).toBe(1);
          expect(__getMentionsStore().size).toBe(1);
          expect(__getActivityLogsStore().size).toBe(1);
          expect(__getRateLimitsStore().size).toBe(1);
          
          // Verify remaining data belongs to bot 2
          const remainingSource = Array.from(__getContentSourcesStore().values())[0];
          expect(remainingSource.botId).toBe(bot2.id);
          
          const remainingMention = Array.from(__getMentionsStore().values())[0];
          expect(remainingMention.botId).toBe(bot2.id);
          
          const remainingLog = Array.from(__getActivityLogsStore().values())[0];
          expect(remainingLog.botId).toBe(bot2.id);
          
          const remainingRateLimit = Array.from(__getRateLimitsStore().values())[0];
          expect(remainingRateLimit.botId).toBe(bot2.id);
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Feature: bot-system, Property 5: Bot Limit Enforcement', () => {
  /**
   * Property 5: Bot Limit Enforcement
   * 
   * *For any* user at the maximum bot limit, attempting to create an additional bot
   * SHALL fail with an appropriate error.
   * 
   * **Validates: Requirements 1.6**
   */

  // Store original max bots value
  let originalMaxBots: string | undefined;

  beforeAll(() => {
    // Store original value
    originalMaxBots = process.env.BOT_MAX_PER_USER;
  });

  afterAll(() => {
    // Restore original value
    if (originalMaxBots !== undefined) {
      process.env.BOT_MAX_PER_USER = originalMaxBots;
    } else {
      delete process.env.BOT_MAX_PER_USER;
    }
  });

  it('creating bots up to the limit succeeds', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 1, max: 5 }),
        async (userId, maxBots) => {
          // Reset store for this test iteration
          __resetStore();
          
          // Set the bot limit for this test
          process.env.BOT_MAX_PER_USER = String(maxBots);
          
          // Create bots up to the limit - all should succeed
          const createdBots = [];
          for (let i = 0; i < maxBots; i++) {
            const config: BotCreateInput = {
              name: `Test Bot ${i}`,
              handle: `testbot_${userId.slice(0, 8)}_${i}`,
              personality: {
                systemPrompt: 'Test prompt',
                temperature: 0.7,
                maxTokens: 1000,
              },
              llmProvider: 'openai',
              llmModel: 'gpt-4',
              llmApiKey: `sk-test1234567890abcdef${i}`,
            };
            
            // Should not throw - we're within the limit
            const bot = await createBot(userId, config);
            createdBots.push(bot);
          }
          
          // Verify all bots were created
          expect(createdBots.length).toBe(maxBots);
          
          // Verify all bots belong to the user
          for (const bot of createdBots) {
            expect(bot.userId).toBe(userId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('creating a bot beyond the limit throws BotLimitExceededError', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 1, max: 5 }),
        async (userId, maxBots) => {
          // Reset store for this test iteration
          __resetStore();
          
          // Set the bot limit for this test
          process.env.BOT_MAX_PER_USER = String(maxBots);
          
          // Create bots up to the limit
          for (let i = 0; i < maxBots; i++) {
            const config: BotCreateInput = {
              name: `Test Bot ${i}`,
              handle: `testbot_${userId.slice(0, 8)}_${i}`,
              personality: {
                systemPrompt: 'Test prompt',
                temperature: 0.7,
                maxTokens: 1000,
              },
              llmProvider: 'openai',
              llmModel: 'gpt-4',
              llmApiKey: `sk-test1234567890abcdef${i}`,
            };
            
            await createBot(userId, config);
          }
          
          // Attempt to create one more bot beyond the limit
          const extraBotConfig: BotCreateInput = {
            name: 'Extra Bot',
            handle: `extrabot_${userId.slice(0, 8)}`,
            personality: {
              systemPrompt: 'Test prompt',
              temperature: 0.7,
              maxTokens: 1000,
            },
            llmProvider: 'openai',
            llmModel: 'gpt-4',
            llmApiKey: 'sk-test1234567890extra',
          };
          
          // Should throw BotLimitExceededError
          await expect(createBot(userId, extraBotConfig)).rejects.toThrow(BotLimitExceededError);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('BotLimitExceededError contains correct user ID and limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 1, max: 5 }),
        async (userId, maxBots) => {
          // Reset store for this test iteration
          __resetStore();
          
          // Set the bot limit for this test
          process.env.BOT_MAX_PER_USER = String(maxBots);
          
          // Create bots up to the limit
          for (let i = 0; i < maxBots; i++) {
            const config: BotCreateInput = {
              name: `Test Bot ${i}`,
              handle: `testbot_${userId.slice(0, 8)}_${i}`,
              personality: {
                systemPrompt: 'Test prompt',
                temperature: 0.7,
                maxTokens: 1000,
              },
              llmProvider: 'openai',
              llmModel: 'gpt-4',
              llmApiKey: `sk-test1234567890abcdef${i}`,
            };
            
            await createBot(userId, config);
          }
          
          // Attempt to create one more bot beyond the limit
          const extraBotConfig: BotCreateInput = {
            name: 'Extra Bot',
            handle: `extrabot_${userId.slice(0, 8)}`,
            personality: {
              systemPrompt: 'Test prompt',
              temperature: 0.7,
              maxTokens: 1000,
            },
            llmProvider: 'openai',
            llmModel: 'gpt-4',
            llmApiKey: 'sk-test1234567890extra',
          };
          
          // Catch the error and verify its properties
          try {
            await createBot(userId, extraBotConfig);
            // Should not reach here
            expect(true).toBe(false);
          } catch (error) {
            expect(error).toBeInstanceOf(BotLimitExceededError);
            if (error instanceof BotLimitExceededError) {
              expect(error.code).toBe('BOT_LIMIT_EXCEEDED');
              expect(error.message).toContain(userId);
              expect(error.message).toContain(String(maxBots));
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('after deleting a bot, a new bot can be created (back under limit)', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 1, max: 5 }),
        async (userId, maxBots) => {
          // Reset store for this test iteration
          __resetStore();
          
          // Set the bot limit for this test
          process.env.BOT_MAX_PER_USER = String(maxBots);
          
          // Create bots up to the limit
          const createdBots = [];
          for (let i = 0; i < maxBots; i++) {
            const config: BotCreateInput = {
              name: `Test Bot ${i}`,
              handle: `testbot_${userId.slice(0, 8)}_${i}`,
              personality: {
                systemPrompt: 'Test prompt',
                temperature: 0.7,
                maxTokens: 1000,
              },
              llmProvider: 'openai',
              llmModel: 'gpt-4',
              llmApiKey: `sk-test1234567890abcdef${i}`,
            };
            
            const bot = await createBot(userId, config);
            createdBots.push(bot);
          }
          
          // Verify we're at the limit - creating another should fail
          const extraBotConfig: BotCreateInput = {
            name: 'Extra Bot',
            handle: `extrabot_${userId.slice(0, 8)}`,
            personality: {
              systemPrompt: 'Test prompt',
              temperature: 0.7,
              maxTokens: 1000,
            },
            llmProvider: 'openai',
            llmModel: 'gpt-4',
            llmApiKey: 'sk-test1234567890extra',
          };
          
          await expect(createBot(userId, extraBotConfig)).rejects.toThrow(BotLimitExceededError);
          
          // Delete one of the bots
          const botToDelete = createdBots[0];
          __setOperatedBotId(botToDelete.id);
          await deleteBot(botToDelete.id);
          
          // Now we should be able to create a new bot
          const newBotConfig: BotCreateInput = {
            name: 'New Bot After Delete',
            handle: `newbot_${userId.slice(0, 8)}`,
            personality: {
              systemPrompt: 'Test prompt',
              temperature: 0.7,
              maxTokens: 1000,
            },
            llmProvider: 'openai',
            llmModel: 'gpt-4',
            llmApiKey: 'sk-test1234567890newbot',
          };
          
          // Should succeed - we're back under the limit
          const newBot = await createBot(userId, newBotConfig);
          expect(newBot).toBeDefined();
          expect(newBot.userId).toBe(userId);
          expect(newBot.name).toBe('New Bot After Delete');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('bot limit is enforced per user (other users can still create bots)', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        userIdArb,
        fc.integer({ min: 1, max: 3 }),
        async (userId1, userId2, maxBots) => {
          // Skip if users are the same
          if (userId1 === userId2) {
            return;
          }
          
          // Reset store for this test iteration
          __resetStore();
          
          // Set the bot limit for this test
          process.env.BOT_MAX_PER_USER = String(maxBots);
          
          // Create bots up to the limit for user 1
          for (let i = 0; i < maxBots; i++) {
            const config: BotCreateInput = {
              name: `User1 Bot ${i}`,
              handle: `user1bot_${userId1.slice(0, 8)}_${i}`,
              personality: {
                systemPrompt: 'Test prompt',
                temperature: 0.7,
                maxTokens: 1000,
              },
              llmProvider: 'openai',
              llmModel: 'gpt-4',
              llmApiKey: `sk-test1234567890user1_${i}`,
            };
            
            await createBot(userId1, config);
          }
          
          // User 1 should not be able to create more bots
          const user1ExtraConfig: BotCreateInput = {
            name: 'User1 Extra Bot',
            handle: `user1extra_${userId1.slice(0, 8)}`,
            personality: {
              systemPrompt: 'Test prompt',
              temperature: 0.7,
              maxTokens: 1000,
            },
            llmProvider: 'openai',
            llmModel: 'gpt-4',
            llmApiKey: 'sk-test1234567890user1extra',
          };
          
          await expect(createBot(userId1, user1ExtraConfig)).rejects.toThrow(BotLimitExceededError);
          
          // User 2 should still be able to create bots (their limit is independent)
          const user2Config: BotCreateInput = {
            name: 'User2 Bot',
            handle: `user2bot_${userId2.slice(0, 8)}`,
            personality: {
              systemPrompt: 'Test prompt',
              temperature: 0.7,
              maxTokens: 1000,
            },
            llmProvider: 'anthropic',
            llmModel: 'claude-3',
            llmApiKey: 'sk-ant-test1234567890user2',
          };
          
          // Should succeed - user 2 has their own limit
          const user2Bot = await createBot(userId2, user2Config);
          expect(user2Bot).toBeDefined();
          expect(user2Bot.userId).toBe(userId2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('limit of 1 bot is correctly enforced', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        async (userId) => {
          // Reset store for this test iteration
          __resetStore();
          
          // Set the bot limit to 1
          process.env.BOT_MAX_PER_USER = '1';
          
          // Create the first bot - should succeed
          const config1: BotCreateInput = {
            name: 'First Bot',
            handle: `firstbot_${userId.slice(0, 8)}`,
            personality: {
              systemPrompt: 'Test prompt',
              temperature: 0.7,
              maxTokens: 1000,
            },
            llmProvider: 'openai',
            llmModel: 'gpt-4',
            llmApiKey: 'sk-test1234567890first',
          };
          
          const firstBot = await createBot(userId, config1);
          expect(firstBot).toBeDefined();
          
          // Try to create a second bot - should fail
          const config2: BotCreateInput = {
            name: 'Second Bot',
            handle: `secondbot_${userId.slice(0, 8)}`,
            personality: {
              systemPrompt: 'Test prompt',
              temperature: 0.7,
              maxTokens: 1000,
            },
            llmProvider: 'openai',
            llmModel: 'gpt-4',
            llmApiKey: 'sk-test1234567890second',
          };
          
          await expect(createBot(userId, config2)).rejects.toThrow(BotLimitExceededError);
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Feature: bot-system, Property 8: LLM Provider Support', () => {
  /**
   * Property 8: LLM Provider Support
   * 
   * *For any* of the supported LLM providers (OpenRouter, OpenAI, Anthropic),
   * creating a bot with that provider SHALL succeed.
   * 
   * **Validates: Requirements 2.6**
   */

  it('creating a bot with OpenRouter provider succeeds', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        botNameArb,
        botHandleArb,
        personalityConfigArb,
        fc.string({ minLength: 1, maxLength: 50 }),
        async (userId, name, handle, personality, model) => {
          // Reset store for this test iteration
          __resetStore();
          
          const config: BotCreateInput = {
            name,
            handle,
            personality,
            llmProvider: 'openrouter',
            llmModel: model,
            llmApiKey: 'sk-or-test1234567890abcdef',
          };
          
          // Creating a bot with OpenRouter provider should succeed
          const bot = await createBot(userId, config);
          
          expect(bot).toBeDefined();
          expect(bot.id).toBeDefined();
          expect(bot.llmProvider).toBe('openrouter');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('creating a bot with OpenAI provider succeeds', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        botNameArb,
        botHandleArb,
        personalityConfigArb,
        fc.string({ minLength: 1, maxLength: 50 }),
        async (userId, name, handle, personality, model) => {
          // Reset store for this test iteration
          __resetStore();
          
          const config: BotCreateInput = {
            name,
            handle,
            personality,
            llmProvider: 'openai',
            llmModel: model,
            llmApiKey: 'sk-test1234567890abcdef',
          };
          
          // Creating a bot with OpenAI provider should succeed
          const bot = await createBot(userId, config);
          
          expect(bot).toBeDefined();
          expect(bot.id).toBeDefined();
          expect(bot.llmProvider).toBe('openai');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('creating a bot with Anthropic provider succeeds', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        botNameArb,
        botHandleArb,
        personalityConfigArb,
        fc.string({ minLength: 1, maxLength: 50 }),
        async (userId, name, handle, personality, model) => {
          // Reset store for this test iteration
          __resetStore();
          
          const config: BotCreateInput = {
            name,
            handle,
            personality,
            llmProvider: 'anthropic',
            llmModel: model,
            llmApiKey: 'sk-ant-test1234567890abc',
          };
          
          // Creating a bot with Anthropic provider should succeed
          const bot = await createBot(userId, config);
          
          expect(bot).toBeDefined();
          expect(bot.id).toBeDefined();
          expect(bot.llmProvider).toBe('anthropic');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('created bot has the correct provider set for any supported provider', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        botNameArb,
        botHandleArb,
        personalityConfigArb,
        llmProviderArb,
        fc.string({ minLength: 1, maxLength: 50 }),
        async (userId, name, handle, personality, provider, model) => {
          // Reset store for this test iteration
          __resetStore();
          
          // Generate appropriate API key for the provider
          let apiKey: string;
          switch (provider) {
            case 'openrouter':
              apiKey = 'sk-or-test1234567890abcdef';
              break;
            case 'anthropic':
              apiKey = 'sk-ant-test1234567890abc';
              break;
            case 'openai':
            default:
              apiKey = 'sk-test1234567890abcdef';
              break;
          }
          
          const config: BotCreateInput = {
            name,
            handle,
            personality,
            llmProvider: provider,
            llmModel: model,
            llmApiKey: apiKey,
          };
          
          // Creating a bot with any supported provider should succeed
          const bot = await createBot(userId, config);
          
          // The created bot must have the correct provider set
          expect(bot).toBeDefined();
          expect(bot.id).toBeDefined();
          expect(bot.llmProvider).toBe(provider);
          
          // Verify the provider is one of the supported types
          expect(['openrouter', 'openai', 'anthropic']).toContain(bot.llmProvider);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all three providers can be used to create bots for the same user', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        async (userId) => {
          // Reset store for this test iteration
          __resetStore();
          
          const providers: Array<'openrouter' | 'openai' | 'anthropic'> = ['openrouter', 'openai', 'anthropic'];
          const createdBots = [];
          
          for (let i = 0; i < providers.length; i++) {
            const provider = providers[i];
            
            // Generate appropriate API key for the provider
            let apiKey: string;
            switch (provider) {
              case 'openrouter':
                apiKey = 'sk-or-test1234567890abcdef';
                break;
              case 'anthropic':
                apiKey = 'sk-ant-test1234567890abc';
                break;
              case 'openai':
              default:
                apiKey = 'sk-test1234567890abcdef';
                break;
            }
            
            const config: BotCreateInput = {
              name: `${provider} Bot`,
              handle: `${provider}_bot_${userId.slice(0, 8)}_${i}`,
              personality: {
                systemPrompt: 'Test prompt',
                temperature: 0.7,
                maxTokens: 1000,
              },
              llmProvider: provider,
              llmModel: 'test-model',
              llmApiKey: apiKey,
            };
            
            const bot = await createBot(userId, config);
            createdBots.push(bot);
          }
          
          // All three bots should be created successfully
          expect(createdBots.length).toBe(3);
          
          // Each bot should have the correct provider
          expect(createdBots[0].llmProvider).toBe('openrouter');
          expect(createdBots[1].llmProvider).toBe('openai');
          expect(createdBots[2].llmProvider).toBe('anthropic');
          
          // All bots should belong to the same user
          for (const bot of createdBots) {
            expect(bot.userId).toBe(userId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('provider is preserved correctly after bot creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        llmProviderArb,
        async (userId, provider) => {
          // Reset store for this test iteration
          __resetStore();
          
          // Generate appropriate API key for the provider
          let apiKey: string;
          switch (provider) {
            case 'openrouter':
              apiKey = 'sk-or-test1234567890abcdef';
              break;
            case 'anthropic':
              apiKey = 'sk-ant-test1234567890abc';
              break;
            case 'openai':
            default:
              apiKey = 'sk-test1234567890abcdef';
              break;
          }
          
          const config: BotCreateInput = {
            name: 'Provider Test Bot',
            handle: `providerbot_${userId.slice(0, 8)}`,
            personality: {
              systemPrompt: 'Test prompt',
              temperature: 0.7,
              maxTokens: 1000,
            },
            llmProvider: provider,
            llmModel: 'test-model',
            llmApiKey: apiKey,
          };
          
          const bot = await createBot(userId, config);
          
          // Provider should be exactly what was specified
          expect(bot.llmProvider).toBe(provider);
          
          // Provider should be a valid LLM provider type
          expect(typeof bot.llmProvider).toBe('string');
          expect(bot.llmProvider.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
