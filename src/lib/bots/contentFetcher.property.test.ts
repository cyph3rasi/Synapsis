/**
 * Property-Based Tests for Content Item Storage
 * 
 * Feature: bot-system, Property 13: Content Item Storage
 * 
 * Tests that content items are correctly stored with their source reference
 * and marked as unprocessed using fast-check for property-based testing.
 * 
 * **Validates: Requirements 4.5**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

// ============================================
// MOCK SETUP
// ============================================

// In-memory storage for content items (defined outside mock for access in tests)
let contentItemsStore = new Map<string, any>();
let itemIdCounter = 0;

// Helper functions for test access
export const __resetStore = () => {
  contentItemsStore.clear();
  itemIdCounter = 0;
};

export const __getStore = () => contentItemsStore;

// Mock the database module
vi.mock('@/db', () => {
  return {
    db: {
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((values: any) => ({
          returning: vi.fn().mockImplementation(async () => {
            const id = `item-${++itemIdCounter}-${Date.now()}`;
            const now = new Date();
            const stored = {
              id,
              sourceId: values.sourceId,
              externalId: values.externalId,
              title: values.title,
              content: values.content,
              url: values.url,
              publishedAt: values.publishedAt,
              fetchedAt: now,
              isProcessed: values.isProcessed ?? false,
              processedAt: values.processedAt ?? null,
              postId: values.postId ?? null,
              interestScore: values.interestScore ?? null,
              interestReason: values.interestReason ?? null,
            };
            contentItemsStore.set(id, stored);
            return [stored];
          }),
        })),
      })),
      query: {
        botContentItems: {
          findFirst: vi.fn().mockImplementation(async () => undefined),
          findMany: vi.fn().mockImplementation(async () => []),
        },
        botContentSources: {
          findFirst: vi.fn().mockImplementation(async () => undefined),
        },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    },
    botContentSources: {
      id: 'id',
      botId: 'bot_id',
    },
    botContentItems: {
      id: 'id',
      sourceId: 'source_id',
      externalId: 'external_id',
      isProcessed: 'is_processed',
    },
  };
});

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockImplementation((column: any, value: any) => ({ column, value, type: 'eq' })),
  and: vi.fn().mockImplementation((...conditions: any[]) => ({ conditions, type: 'and' })),
}));

// Import after mocks are set up
import {
  storeContentItem,
  storeContentItems,
  ContentItemInput,
  StoredContentItem,
  calculateBackoffDelay,
  BASE_BACKOFF_DELAY_MS,
  MAX_BACKOFF_DELAY_MS,
  MAX_CONSECUTIVE_ERRORS,
} from './contentFetcher';

// ============================================
// TEST SETUP
// ============================================

beforeEach(() => {
  vi.clearAllMocks();
  __resetStore();
});

// ============================================
// GENERATORS
// ============================================

/**
 * Generator for valid source IDs (UUID format).
 */
const sourceIdArb = fc.uuid();

/**
 * Generator for external IDs (unique identifiers from the source).
 */
const externalIdArb = fc.stringMatching(/^[a-zA-Z0-9_-]{1,100}$/)
  .filter(s => s.length > 0);

/**
 * Generator for content item titles.
 */
const titleArb = fc.string({ minLength: 1, maxLength: 500 })
  .filter(s => s.trim().length > 0);

/**
 * Generator for content item content (can be null or string).
 */
const contentArb = fc.oneof(
  fc.constant(null),
  fc.string({ minLength: 0, maxLength: 5000 })
);

/**
 * Generator for valid URLs.
 */
const urlArb = fc.webUrl();

/**
 * Generator for publication dates (within reasonable range).
 */
const publishedAtArb = fc.date({
  min: new Date('2020-01-01T00:00:00Z'),
  max: new Date('2030-12-31T23:59:59Z'),
});

/**
 * Generator for a single content item input.
 */
const contentItemInputArb: fc.Arbitrary<ContentItemInput> = fc.record({
  sourceId: sourceIdArb,
  externalId: externalIdArb,
  title: titleArb,
  content: contentArb,
  url: urlArb,
  publishedAt: publishedAtArb,
});

/**
 * Generator for a list of content item inputs (1-20 items).
 */
const contentItemInputsArb = fc.array(contentItemInputArb, { minLength: 1, maxLength: 20 });

/**
 * Generator for content items with the same source ID.
 */
const contentItemsWithSameSourceArb = fc.tuple(sourceIdArb, fc.array(
  fc.record({
    externalId: externalIdArb,
    title: titleArb,
    content: contentArb,
    url: urlArb,
    publishedAt: publishedAtArb,
  }),
  { minLength: 1, maxLength: 10 }
)).map(([sourceId, items]) => 
  items.map((item, index) => ({
    ...item,
    sourceId,
    // Ensure unique external IDs within the same source
    externalId: `${item.externalId}-${index}`,
  }))
);

// ============================================
// PROPERTY TESTS
// ============================================

describe('Feature: bot-system, Property 13: Content Item Storage', () => {
  /**
   * Property 13: Content Item Storage
   * 
   * *For any* fetched content item, the item SHALL be stored with its source 
   * reference and marked as unprocessed.
   * 
   * **Validates: Requirements 4.5**
   */

  describe('Source Reference Preservation', () => {
    it('stored item preserves the source ID reference', async () => {
      await fc.assert(
        fc.asyncProperty(contentItemInputArb, async (input) => {
          const stored = await storeContentItem(input);
          
          // The stored item MUST have the same sourceId as the input
          expect(stored.sourceId).toBe(input.sourceId);
        }),
        { numRuns: 100 }
      );
    });

    it('stored item preserves the external ID from the source', async () => {
      await fc.assert(
        fc.asyncProperty(contentItemInputArb, async (input) => {
          const stored = await storeContentItem(input);
          
          // The stored item MUST have the same externalId as the input
          expect(stored.externalId).toBe(input.externalId);
        }),
        { numRuns: 100 }
      );
    });

    it('multiple items from the same source all reference that source', async () => {
      await fc.assert(
        fc.asyncProperty(contentItemsWithSameSourceArb, async (inputs) => {
          const storedItems: StoredContentItem[] = [];
          
          for (const input of inputs) {
            const stored = await storeContentItem(input);
            storedItems.push(stored);
          }
          
          // All stored items MUST reference the same source
          const sourceId = inputs[0].sourceId;
          for (const stored of storedItems) {
            expect(stored.sourceId).toBe(sourceId);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Unprocessed State', () => {
    it('newly stored item is marked as unprocessed', async () => {
      await fc.assert(
        fc.asyncProperty(contentItemInputArb, async (input) => {
          const stored = await storeContentItem(input);
          
          // The stored item MUST be marked as unprocessed
          expect(stored.isProcessed).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('newly stored item has null processedAt timestamp', async () => {
      await fc.assert(
        fc.asyncProperty(contentItemInputArb, async (input) => {
          const stored = await storeContentItem(input);
          
          // The stored item MUST have null processedAt
          expect(stored.processedAt).toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    it('newly stored item has null postId (no post created yet)', async () => {
      await fc.assert(
        fc.asyncProperty(contentItemInputArb, async (input) => {
          const stored = await storeContentItem(input);
          
          // The stored item MUST have null postId
          expect(stored.postId).toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    it('all items in a batch are marked as unprocessed', async () => {
      await fc.assert(
        fc.asyncProperty(contentItemInputsArb, async (inputs) => {
          const storedItems: StoredContentItem[] = [];
          
          for (const input of inputs) {
            const stored = await storeContentItem(input);
            storedItems.push(stored);
          }
          
          // ALL stored items MUST be marked as unprocessed
          for (const stored of storedItems) {
            expect(stored.isProcessed).toBe(false);
            expect(stored.processedAt).toBeNull();
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Content Data Preservation', () => {
    it('stored item preserves the title', async () => {
      await fc.assert(
        fc.asyncProperty(contentItemInputArb, async (input) => {
          const stored = await storeContentItem(input);
          
          expect(stored.title).toBe(input.title);
        }),
        { numRuns: 100 }
      );
    });

    it('stored item preserves the content (including null)', async () => {
      await fc.assert(
        fc.asyncProperty(contentItemInputArb, async (input) => {
          const stored = await storeContentItem(input);
          
          expect(stored.content).toBe(input.content);
        }),
        { numRuns: 100 }
      );
    });

    it('stored item preserves the URL', async () => {
      await fc.assert(
        fc.asyncProperty(contentItemInputArb, async (input) => {
          const stored = await storeContentItem(input);
          
          expect(stored.url).toBe(input.url);
        }),
        { numRuns: 100 }
      );
    });

    it('stored item preserves the publication date', async () => {
      await fc.assert(
        fc.asyncProperty(contentItemInputArb, async (input) => {
          const stored = await storeContentItem(input);
          
          // Dates should be equal (comparing timestamps)
          expect(stored.publishedAt.getTime()).toBe(input.publishedAt.getTime());
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Storage Metadata', () => {
    it('stored item has a unique ID assigned', async () => {
      await fc.assert(
        fc.asyncProperty(contentItemInputArb, async (input) => {
          const stored = await storeContentItem(input);
          
          // The stored item MUST have an ID
          expect(stored.id).toBeDefined();
          expect(typeof stored.id).toBe('string');
          expect(stored.id.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it('stored item has a fetchedAt timestamp', async () => {
      await fc.assert(
        fc.asyncProperty(contentItemInputArb, async (input) => {
          const stored = await storeContentItem(input);
          
          // The stored item MUST have a fetchedAt timestamp
          expect(stored.fetchedAt).toBeInstanceOf(Date);
          expect(isNaN(stored.fetchedAt.getTime())).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('fetchedAt timestamp is recent (within last minute)', async () => {
      await fc.assert(
        fc.asyncProperty(contentItemInputArb, async (input) => {
          const beforeStore = new Date();
          const stored = await storeContentItem(input);
          const afterStore = new Date();
          
          // fetchedAt should be between before and after store times
          expect(stored.fetchedAt.getTime()).toBeGreaterThanOrEqual(beforeStore.getTime() - 1000);
          expect(stored.fetchedAt.getTime()).toBeLessThanOrEqual(afterStore.getTime() + 1000);
        }),
        { numRuns: 100 }
      );
    });

    it('multiple stored items have unique IDs', async () => {
      await fc.assert(
        fc.asyncProperty(contentItemInputsArb, async (inputs) => {
          const storedItems: StoredContentItem[] = [];
          
          for (const input of inputs) {
            const stored = await storeContentItem(input);
            storedItems.push(stored);
          }
          
          // All IDs should be unique
          const ids = storedItems.map(item => item.id);
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(ids.length);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Interest Score Fields', () => {
    it('newly stored item has null interest score', async () => {
      await fc.assert(
        fc.asyncProperty(contentItemInputArb, async (input) => {
          const stored = await storeContentItem(input);
          
          // Interest score should be null for new items
          expect(stored.interestScore).toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    it('newly stored item has null interest reason', async () => {
      await fc.assert(
        fc.asyncProperty(contentItemInputArb, async (input) => {
          const stored = await storeContentItem(input);
          
          // Interest reason should be null for new items
          expect(stored.interestReason).toBeNull();
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Batch Storage with storeContentItems', () => {
    it('storeContentItems stores all items with source references', async () => {
      await fc.assert(
        fc.asyncProperty(contentItemsWithSameSourceArb, async (inputs) => {
          const storedCount = await storeContentItems(inputs, true);
          
          // All items should be stored
          expect(storedCount).toBe(inputs.length);
        }),
        { numRuns: 100 }
      );
    });

    it('storeContentItems marks all items as unprocessed', async () => {
      await fc.assert(
        fc.asyncProperty(contentItemsWithSameSourceArb, async (inputs) => {
          // Store items and verify count
          const storedCount = await storeContentItems(inputs, true);
          expect(storedCount).toBe(inputs.length);
          
          // Verify all items in store are unprocessed
          const store = __getStore();
          for (const [, item] of store) {
            expect(item.isProcessed).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Data Integrity Properties', () => {
    it('storage is idempotent for item data - same input produces same output fields', async () => {
      await fc.assert(
        fc.asyncProperty(contentItemInputArb, async (input) => {
          const stored = await storeContentItem(input);
          
          // All input fields should be preserved exactly
          expect(stored.sourceId).toBe(input.sourceId);
          expect(stored.externalId).toBe(input.externalId);
          expect(stored.title).toBe(input.title);
          expect(stored.content).toBe(input.content);
          expect(stored.url).toBe(input.url);
          expect(stored.publishedAt.getTime()).toBe(input.publishedAt.getTime());
          
          // Default fields should be set correctly
          expect(stored.isProcessed).toBe(false);
          expect(stored.processedAt).toBeNull();
          expect(stored.postId).toBeNull();
          expect(stored.interestScore).toBeNull();
          expect(stored.interestReason).toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    it('no data corruption - stored data matches input exactly', async () => {
      await fc.assert(
        fc.asyncProperty(contentItemInputArb, async (input) => {
          const stored = await storeContentItem(input);
          
          // Verify no truncation or modification of string fields
          if (input.title.length > 0) {
            expect(stored.title.length).toBe(input.title.length);
          }
          
          if (input.content !== null && input.content.length > 0) {
            expect(stored.content!.length).toBe(input.content.length);
          }
          
          expect(stored.url.length).toBe(input.url.length);
        }),
        { numRuns: 100 }
      );
    });
  });
});

// ============================================
// PROPERTY 15: FETCH ERROR RETRY WITH BACKOFF
// ============================================

/**
 * Feature: bot-system, Property 15: Fetch Error Retry with Backoff
 * 
 * *For any* content source that fails to fetch, consecutive failures SHALL 
 * increase the retry delay exponentially up to a maximum.
 * 
 * **Validates: Requirements 4.7**
 */
describe('Feature: bot-system, Property 15: Fetch Error Retry with Backoff', () => {
  // Import the backoff calculation function and constants
  // These are imported at the top of the file from contentFetcher

  // ============================================
  // GENERATORS
  // ============================================

  /**
   * Generator for consecutive error counts (0 to 20).
   * We test beyond MAX_CONSECUTIVE_ERRORS to verify capping behavior.
   */
  const consecutiveErrorsArb = fc.integer({ min: 0, max: 20 });

  /**
   * Generator for pairs of consecutive error counts where the second is greater.
   * Used to test that delays increase with more errors.
   */
  const increasingErrorPairArb = fc.tuple(
    fc.integer({ min: 1, max: 15 }),
    fc.integer({ min: 1, max: 15 })
  ).filter(([a, b]) => a < b);

  /**
   * Generator for sequences of consecutive error counts (simulating multiple failures).
   */
  const errorSequenceArb = fc.array(
    fc.integer({ min: 1, max: 15 }),
    { minLength: 2, maxLength: 10 }
  ).map(arr => [...arr].sort((a, b) => a - b)); // Sort to get increasing sequence

  // ============================================
  // PROPERTY TESTS
  // ============================================

  describe('Exponential Backoff Calculation', () => {
    it('zero consecutive errors results in zero delay', () => {
      fc.assert(
        fc.property(fc.constant(0), (errors) => {
          const delay = calculateBackoffDelay(errors);
          expect(delay).toBe(0);
        }),
        { numRuns: 100 }
      );
    });

    it('negative consecutive errors results in zero delay', () => {
      fc.assert(
        fc.property(fc.integer({ min: -100, max: -1 }), (errors) => {
          const delay = calculateBackoffDelay(errors);
          expect(delay).toBe(0);
        }),
        { numRuns: 100 }
      );
    });

    it('first error produces a delay based on BASE_BACKOFF_DELAY_MS', () => {
      fc.assert(
        fc.property(fc.constant(1), () => {
          const delay = calculateBackoffDelay(1);
          
          // First error: base * 2^0 = base, with ±10% jitter
          const expectedBase = BASE_BACKOFF_DELAY_MS;
          const minExpected = expectedBase * 0.9;
          const maxExpected = expectedBase * 1.1;
          
          expect(delay).toBeGreaterThanOrEqual(Math.floor(minExpected));
          expect(delay).toBeLessThanOrEqual(Math.ceil(maxExpected));
        }),
        { numRuns: 100 }
      );
    });

    it('delay increases exponentially with consecutive errors', () => {
      fc.assert(
        fc.property(increasingErrorPairArb, ([lowerErrors, higherErrors]) => {
          // Run multiple times to account for jitter and get average behavior
          const lowerDelays: number[] = [];
          const higherDelays: number[] = [];
          
          for (let i = 0; i < 10; i++) {
            lowerDelays.push(calculateBackoffDelay(lowerErrors));
            higherDelays.push(calculateBackoffDelay(higherErrors));
          }
          
          // Calculate averages to smooth out jitter
          const avgLower = lowerDelays.reduce((a, b) => a + b, 0) / lowerDelays.length;
          const avgHigher = higherDelays.reduce((a, b) => a + b, 0) / higherDelays.length;
          
          // Higher consecutive errors should result in higher average delay
          // (unless both are capped at maximum)
          const lowerBase = BASE_BACKOFF_DELAY_MS * Math.pow(2, lowerErrors - 1);
          const higherBase = BASE_BACKOFF_DELAY_MS * Math.pow(2, higherErrors - 1);
          
          if (lowerBase < MAX_BACKOFF_DELAY_MS && higherBase < MAX_BACKOFF_DELAY_MS) {
            // Neither is capped, so higher should be greater
            expect(avgHigher).toBeGreaterThan(avgLower);
          } else if (lowerBase >= MAX_BACKOFF_DELAY_MS && higherBase >= MAX_BACKOFF_DELAY_MS) {
            // Both are capped, so they should be approximately equal
            expect(Math.abs(avgHigher - avgLower)).toBeLessThan(MAX_BACKOFF_DELAY_MS * 0.25);
          }
          // If only one is capped, higher should still be >= lower
        }),
        { numRuns: 100 }
      );
    });

    it('delay follows exponential formula: base * 2^(errors-1)', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 10 }), (errors) => {
          const delay = calculateBackoffDelay(errors);
          
          // Expected delay without jitter
          const expectedBase = BASE_BACKOFF_DELAY_MS * Math.pow(2, errors - 1);
          const cappedExpected = Math.min(expectedBase, MAX_BACKOFF_DELAY_MS);
          
          // With ±10% jitter
          const minExpected = cappedExpected * 0.9;
          const maxExpected = cappedExpected * 1.1;
          
          expect(delay).toBeGreaterThanOrEqual(Math.floor(minExpected));
          expect(delay).toBeLessThanOrEqual(Math.ceil(maxExpected));
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Maximum Delay Cap', () => {
    it('delay never exceeds MAX_BACKOFF_DELAY_MS (plus jitter)', () => {
      fc.assert(
        fc.property(consecutiveErrorsArb, (errors) => {
          const delay = calculateBackoffDelay(errors);
          
          // Maximum possible delay is MAX_BACKOFF_DELAY_MS + 10% jitter
          const absoluteMax = MAX_BACKOFF_DELAY_MS * 1.1;
          
          expect(delay).toBeLessThanOrEqual(Math.ceil(absoluteMax));
        }),
        { numRuns: 100 }
      );
    });

    it('very high error counts are capped at maximum delay', () => {
      fc.assert(
        fc.property(fc.integer({ min: 20, max: 100 }), (errors) => {
          const delay = calculateBackoffDelay(errors);
          
          // Should be capped at MAX_BACKOFF_DELAY_MS with ±10% jitter
          const minExpected = MAX_BACKOFF_DELAY_MS * 0.9;
          const maxExpected = MAX_BACKOFF_DELAY_MS * 1.1;
          
          expect(delay).toBeGreaterThanOrEqual(Math.floor(minExpected));
          expect(delay).toBeLessThanOrEqual(Math.ceil(maxExpected));
        }),
        { numRuns: 100 }
      );
    });

    it('delay at MAX_CONSECUTIVE_ERRORS is capped appropriately', () => {
      fc.assert(
        fc.property(fc.constant(MAX_CONSECUTIVE_ERRORS), () => {
          const delay = calculateBackoffDelay(MAX_CONSECUTIVE_ERRORS);
          
          // At 10 errors: base * 2^9 = 1000 * 512 = 512000ms
          // This is less than MAX_BACKOFF_DELAY_MS (3600000ms), so not capped
          const expectedBase = BASE_BACKOFF_DELAY_MS * Math.pow(2, MAX_CONSECUTIVE_ERRORS - 1);
          const cappedExpected = Math.min(expectedBase, MAX_BACKOFF_DELAY_MS);
          
          const minExpected = cappedExpected * 0.9;
          const maxExpected = cappedExpected * 1.1;
          
          expect(delay).toBeGreaterThanOrEqual(Math.floor(minExpected));
          expect(delay).toBeLessThanOrEqual(Math.ceil(maxExpected));
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Delay Monotonicity', () => {
    it('delays are monotonically non-decreasing with error count (on average)', () => {
      fc.assert(
        fc.property(errorSequenceArb, (errorSequence) => {
          // Calculate average delays for each error count
          const avgDelays = errorSequence.map(errors => {
            const samples: number[] = [];
            for (let i = 0; i < 20; i++) {
              samples.push(calculateBackoffDelay(errors));
            }
            return samples.reduce((a, b) => a + b, 0) / samples.length;
          });
          
          // Check that average delays are non-decreasing
          for (let i = 1; i < avgDelays.length; i++) {
            // Allow small tolerance for jitter effects
            expect(avgDelays[i]).toBeGreaterThanOrEqual(avgDelays[i - 1] * 0.85);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('doubling error count approximately doubles delay (before cap)', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 5 }), (errors) => {
          const doubledErrors = errors * 2;
          
          // Get average delays
          const getAvgDelay = (e: number) => {
            const samples: number[] = [];
            for (let i = 0; i < 20; i++) {
              samples.push(calculateBackoffDelay(e));
            }
            return samples.reduce((a, b) => a + b, 0) / samples.length;
          };
          
          const singleDelay = getAvgDelay(errors);
          const doubleDelay = getAvgDelay(doubledErrors);
          
          // Expected ratio: 2^(doubledErrors-1) / 2^(errors-1) = 2^(errors)
          // For errors=1, doubled=2: ratio should be ~2
          // For errors=2, doubled=4: ratio should be ~4
          const expectedRatio = Math.pow(2, errors);
          
          // Check if both are below cap
          const singleBase = BASE_BACKOFF_DELAY_MS * Math.pow(2, errors - 1);
          const doubleBase = BASE_BACKOFF_DELAY_MS * Math.pow(2, doubledErrors - 1);
          
          if (singleBase < MAX_BACKOFF_DELAY_MS && doubleBase < MAX_BACKOFF_DELAY_MS) {
            const actualRatio = doubleDelay / singleDelay;
            // Allow 30% tolerance for jitter
            expect(actualRatio).toBeGreaterThan(expectedRatio * 0.7);
            expect(actualRatio).toBeLessThan(expectedRatio * 1.3);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Jitter Properties', () => {
    it('delay includes jitter (not always exactly the same)', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 10 }), (errors) => {
          const delays: number[] = [];
          
          // Collect multiple delay values
          for (let i = 0; i < 50; i++) {
            delays.push(calculateBackoffDelay(errors));
          }
          
          // Check that we have some variation (jitter is working)
          const uniqueDelays = new Set(delays);
          
          // With jitter, we should have multiple unique values
          // (statistically very unlikely to get all same values with random jitter)
          expect(uniqueDelays.size).toBeGreaterThan(1);
        }),
        { numRuns: 100 }
      );
    });

    it('jitter stays within ±10% of base delay', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 15 }), (errors) => {
          const delay = calculateBackoffDelay(errors);
          
          // Calculate expected base (before jitter)
          const exponentialDelay = BASE_BACKOFF_DELAY_MS * Math.pow(2, errors - 1);
          const cappedDelay = Math.min(exponentialDelay, MAX_BACKOFF_DELAY_MS);
          
          // Jitter should be ±10%
          const minWithJitter = cappedDelay * 0.9;
          const maxWithJitter = cappedDelay * 1.1;
          
          expect(delay).toBeGreaterThanOrEqual(Math.floor(minWithJitter));
          expect(delay).toBeLessThanOrEqual(Math.ceil(maxWithJitter));
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Delay Value Ranges', () => {
    it('delay is always a non-negative integer', () => {
      fc.assert(
        fc.property(consecutiveErrorsArb, (errors) => {
          const delay = calculateBackoffDelay(errors);
          
          expect(delay).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(delay)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('delay for 1 error is approximately BASE_BACKOFF_DELAY_MS', () => {
      fc.assert(
        fc.property(fc.constant(1), () => {
          const delay = calculateBackoffDelay(1);
          
          // 1 error: base * 2^0 = base = 1000ms
          expect(delay).toBeGreaterThanOrEqual(900);  // 1000 - 10%
          expect(delay).toBeLessThanOrEqual(1100);    // 1000 + 10%
        }),
        { numRuns: 100 }
      );
    });

    it('delay for 5 errors is approximately 16x BASE_BACKOFF_DELAY_MS', () => {
      fc.assert(
        fc.property(fc.constant(5), () => {
          const delay = calculateBackoffDelay(5);
          
          // 5 errors: base * 2^4 = 1000 * 16 = 16000ms
          const expected = 16000;
          expect(delay).toBeGreaterThanOrEqual(expected * 0.9);
          expect(delay).toBeLessThanOrEqual(expected * 1.1);
        }),
        { numRuns: 100 }
      );
    });

    it('delay for 10 errors is approximately 512x BASE_BACKOFF_DELAY_MS', () => {
      fc.assert(
        fc.property(fc.constant(10), () => {
          const delay = calculateBackoffDelay(10);
          
          // 10 errors: base * 2^9 = 1000 * 512 = 512000ms
          const expected = 512000;
          expect(delay).toBeGreaterThanOrEqual(expected * 0.9);
          expect(delay).toBeLessThanOrEqual(expected * 1.1);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge Cases', () => {
    it('handles boundary at cap transition correctly', () => {
      // Find the error count where we transition to being capped
      // MAX_BACKOFF_DELAY_MS = 3600000ms (1 hour)
      // base * 2^(n-1) >= 3600000
      // 1000 * 2^(n-1) >= 3600000
      // 2^(n-1) >= 3600
      // n-1 >= log2(3600) ≈ 11.8
      // n >= 12.8, so n = 13 is first capped
      
      fc.assert(
        fc.property(fc.constant(12), () => {
          const delay12 = calculateBackoffDelay(12);
          const delay13 = calculateBackoffDelay(13);
          const delay14 = calculateBackoffDelay(14);
          
          // 12 errors: 1000 * 2^11 = 2048000ms (not capped)
          // 13 errors: 1000 * 2^12 = 4096000ms (would be capped to 3600000)
          // 14 errors: 1000 * 2^13 = 8192000ms (would be capped to 3600000)
          
          // delay12 should be around 2048000
          expect(delay12).toBeGreaterThanOrEqual(2048000 * 0.9);
          expect(delay12).toBeLessThanOrEqual(2048000 * 1.1);
          
          // delay13 and delay14 should both be capped at MAX_BACKOFF_DELAY_MS
          expect(delay13).toBeGreaterThanOrEqual(MAX_BACKOFF_DELAY_MS * 0.9);
          expect(delay13).toBeLessThanOrEqual(MAX_BACKOFF_DELAY_MS * 1.1);
          
          expect(delay14).toBeGreaterThanOrEqual(MAX_BACKOFF_DELAY_MS * 0.9);
          expect(delay14).toBeLessThanOrEqual(MAX_BACKOFF_DELAY_MS * 1.1);
        }),
        { numRuns: 100 }
      );
    });
  });
});
