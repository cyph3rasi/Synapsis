/**
 * Property-Based Tests for RSS Parsing Correctness
 * 
 * Feature: bot-system, Property 12: RSS Parsing Correctness
 * 
 * Tests that RSS/Atom feed parsing correctly extracts all items with their
 * titles, content, URLs, and publication dates using fast-check for
 * property-based testing.
 * 
 * **Validates: Requirements 4.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  parseRSSFeed,
  parseFeedItems,
  FeedItem,
  ParsedFeed,
} from './rssParser';

// ============================================
// TYPES FOR GENERATORS
// ============================================

interface GeneratedFeedItem {
  id: string;
  title: string;
  content: string;
  url: string;
  publishedAt: Date;
}

interface GeneratedFeed {
  title: string;
  description: string;
  link: string;
  items: GeneratedFeedItem[];
  feedType: 'rss2' | 'atom';
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Escape special XML characters in text content.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format a date as RFC 822 (RSS 2.0 format).
 */
function formatRFC822(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const day = days[date.getUTCDay()];
  const dayNum = String(date.getUTCDate()).padStart(2, '0');
  const month = months[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  
  return `${day}, ${dayNum} ${month} ${year} ${hours}:${minutes}:${seconds} GMT`;
}

/**
 * Format a date as ISO 8601 (Atom format).
 */
function formatISO8601(date: Date): string {
  return date.toISOString();
}

/**
 * Generate RSS 2.0 XML from a generated feed.
 */
function generateRSS2XML(feed: GeneratedFeed): string {
  const itemsXml = feed.items.map(item => `
    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.url)}</link>
      <description>${escapeXml(item.content)}</description>
      <pubDate>${formatRFC822(item.publishedAt)}</pubDate>
      <guid>${escapeXml(item.id)}</guid>
    </item>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(feed.title)}</title>
    <link>${escapeXml(feed.link)}</link>
    <description>${escapeXml(feed.description)}</description>${itemsXml}
  </channel>
</rss>`;
}

/**
 * Generate Atom XML from a generated feed.
 */
function generateAtomXML(feed: GeneratedFeed): string {
  const entriesXml = feed.items.map(item => `
  <entry>
    <title>${escapeXml(item.title)}</title>
    <link href="${escapeXml(item.url)}" rel="alternate"/>
    <id>${escapeXml(item.id)}</id>
    <published>${formatISO8601(item.publishedAt)}</published>
    <updated>${formatISO8601(item.publishedAt)}</updated>
    <summary>${escapeXml(item.content)}</summary>
  </entry>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(feed.title)}</title>
  <subtitle>${escapeXml(feed.description)}</subtitle>
  <link href="${escapeXml(feed.link)}" rel="alternate"/>
  <id>urn:uuid:${feed.title.replace(/\s+/g, '-').toLowerCase()}</id>
  <updated>${formatISO8601(new Date())}</updated>${entriesXml}
</feed>`;
}

/**
 * Normalize a string for comparison (trim whitespace, normalize spaces).
 */
function normalizeString(str: string): string {
  return str.trim().replace(/\s+/g, ' ');
}

/**
 * Compare two dates allowing for small differences due to parsing.
 * Returns true if dates are within 1 second of each other.
 */
function datesAreClose(date1: Date, date2: Date): boolean {
  const diff = Math.abs(date1.getTime() - date2.getTime());
  return diff < 1000; // Within 1 second
}

// ============================================
// GENERATORS
// ============================================

/**
 * Generator for safe text content (no XML special characters that could break parsing).
 * Generates alphanumeric strings with spaces.
 */
const safeTextArb = fc.stringMatching(/^[a-zA-Z0-9 ]{1,100}$/)
  .filter(s => s.trim().length > 0);

/**
 * Generator for feed/item titles.
 */
const titleArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{0,49}$/)
  .filter(s => s.trim().length > 0);

/**
 * Generator for content/description text.
 */
const contentArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 .,!?]{0,199}$/)
  .filter(s => s.trim().length > 0);

/**
 * Generator for valid URLs.
 */
const urlArb = fc.stringMatching(/^[a-z0-9]{3,20}$/)
  .map(s => `https://example.com/${s}`);

/**
 * Generator for unique IDs.
 */
const idArb = fc.stringMatching(/^[a-z0-9]{8,16}$/)
  .map(s => `item-${s}`);

/**
 * Generator for dates within a reasonable range (last 5 years).
 * Uses integer timestamps to avoid NaN date issues.
 */
const dateArb = fc.integer({
  min: new Date('2020-01-01T00:00:00Z').getTime(),
  max: new Date('2025-12-31T23:59:59Z').getTime(),
}).map(timestamp => new Date(timestamp));

/**
 * Generator for a single feed item.
 */
const feedItemArb: fc.Arbitrary<GeneratedFeedItem> = fc.record({
  id: idArb,
  title: titleArb,
  content: contentArb,
  url: urlArb,
  publishedAt: dateArb,
});

/**
 * Generator for a list of unique feed items (1-10 items).
 */
const feedItemsArb = fc.array(feedItemArb, { minLength: 1, maxLength: 10 })
  .map(items => {
    // Ensure unique IDs and URLs
    const seenIds = new Set<string>();
    const seenUrls = new Set<string>();
    return items.filter(item => {
      if (seenIds.has(item.id) || seenUrls.has(item.url)) {
        return false;
      }
      seenIds.add(item.id);
      seenUrls.add(item.url);
      return true;
    });
  })
  .filter(items => items.length > 0);

/**
 * Generator for feed type.
 */
const feedTypeArb = fc.constantFrom<'rss2' | 'atom'>('rss2', 'atom');

/**
 * Generator for a complete feed.
 */
const feedArb: fc.Arbitrary<GeneratedFeed> = fc.record({
  title: titleArb,
  description: contentArb,
  link: urlArb,
  items: feedItemsArb,
  feedType: feedTypeArb,
});

/**
 * Generator for RSS 2.0 feeds specifically.
 */
const rss2FeedArb: fc.Arbitrary<GeneratedFeed> = fc.record({
  title: titleArb,
  description: contentArb,
  link: urlArb,
  items: feedItemsArb,
  feedType: fc.constant<'rss2'>('rss2'),
});

/**
 * Generator for Atom feeds specifically.
 */
const atomFeedArb: fc.Arbitrary<GeneratedFeed> = fc.record({
  title: titleArb,
  description: contentArb,
  link: urlArb,
  items: feedItemsArb,
  feedType: fc.constant<'atom'>('atom'),
});

// ============================================
// PROPERTY TESTS
// ============================================

describe('Feature: bot-system, Property 12: RSS Parsing Correctness', () => {
  /**
   * Property 12: RSS Parsing Correctness
   * 
   * *For any* valid RSS feed XML, parsing SHALL extract all items with their
   * titles, content, URLs, and publication dates.
   * 
   * **Validates: Requirements 4.2**
   */

  describe('RSS 2.0 Feed Parsing', () => {
    it('extracts all items from valid RSS 2.0 feeds', () => {
      fc.assert(
        fc.property(rss2FeedArb, (generatedFeed) => {
          const xml = generateRSS2XML(generatedFeed);
          const result = parseRSSFeed(xml);
          
          expect(result.success).toBe(true);
          expect(result.feed).toBeDefined();
          expect(result.feed!.items.length).toBe(generatedFeed.items.length);
        }),
        { numRuns: 100 }
      );
    });

    it('extracts correct titles from RSS 2.0 items', () => {
      fc.assert(
        fc.property(rss2FeedArb, (generatedFeed) => {
          const xml = generateRSS2XML(generatedFeed);
          const result = parseRSSFeed(xml);
          
          expect(result.success).toBe(true);
          
          const parsedTitles = result.feed!.items.map(item => normalizeString(item.title));
          const expectedTitles = generatedFeed.items.map(item => normalizeString(item.title));
          
          // All expected titles should be present in parsed titles
          for (const expectedTitle of expectedTitles) {
            expect(parsedTitles).toContain(expectedTitle);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('extracts correct content from RSS 2.0 items', () => {
      fc.assert(
        fc.property(rss2FeedArb, (generatedFeed) => {
          const xml = generateRSS2XML(generatedFeed);
          const result = parseRSSFeed(xml);
          
          expect(result.success).toBe(true);
          
          const parsedContents = result.feed!.items.map(item => normalizeString(item.content));
          const expectedContents = generatedFeed.items.map(item => normalizeString(item.content));
          
          // All expected contents should be present in parsed contents
          for (const expectedContent of expectedContents) {
            expect(parsedContents).toContain(expectedContent);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('extracts correct URLs from RSS 2.0 items', () => {
      fc.assert(
        fc.property(rss2FeedArb, (generatedFeed) => {
          const xml = generateRSS2XML(generatedFeed);
          const result = parseRSSFeed(xml);
          
          expect(result.success).toBe(true);
          
          const parsedUrls = result.feed!.items.map(item => item.url);
          const expectedUrls = generatedFeed.items.map(item => item.url);
          
          // All expected URLs should be present in parsed URLs
          for (const expectedUrl of expectedUrls) {
            expect(parsedUrls).toContain(expectedUrl);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('extracts correct publication dates from RSS 2.0 items', () => {
      fc.assert(
        fc.property(rss2FeedArb, (generatedFeed) => {
          const xml = generateRSS2XML(generatedFeed);
          const result = parseRSSFeed(xml);
          
          expect(result.success).toBe(true);
          
          // For each generated item, find the corresponding parsed item and check date
          for (const generatedItem of generatedFeed.items) {
            const parsedItem = result.feed!.items.find(
              item => item.url === generatedItem.url
            );
            
            expect(parsedItem).toBeDefined();
            expect(parsedItem!.publishedAt).toBeInstanceOf(Date);
            expect(datesAreClose(parsedItem!.publishedAt, generatedItem.publishedAt)).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('extracts correct feed metadata from RSS 2.0 feeds', () => {
      fc.assert(
        fc.property(rss2FeedArb, (generatedFeed) => {
          const xml = generateRSS2XML(generatedFeed);
          const result = parseRSSFeed(xml);
          
          expect(result.success).toBe(true);
          expect(result.feed!.feedType).toBe('rss2');
          expect(normalizeString(result.feed!.title)).toBe(normalizeString(generatedFeed.title));
          expect(normalizeString(result.feed!.description)).toBe(normalizeString(generatedFeed.description));
          expect(result.feed!.link).toBe(generatedFeed.link);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Atom Feed Parsing', () => {
    it('extracts all items from valid Atom feeds', () => {
      fc.assert(
        fc.property(atomFeedArb, (generatedFeed) => {
          const xml = generateAtomXML(generatedFeed);
          const result = parseRSSFeed(xml);
          
          expect(result.success).toBe(true);
          expect(result.feed).toBeDefined();
          expect(result.feed!.items.length).toBe(generatedFeed.items.length);
        }),
        { numRuns: 100 }
      );
    });

    it('extracts correct titles from Atom entries', () => {
      fc.assert(
        fc.property(atomFeedArb, (generatedFeed) => {
          const xml = generateAtomXML(generatedFeed);
          const result = parseRSSFeed(xml);
          
          expect(result.success).toBe(true);
          
          const parsedTitles = result.feed!.items.map(item => normalizeString(item.title));
          const expectedTitles = generatedFeed.items.map(item => normalizeString(item.title));
          
          for (const expectedTitle of expectedTitles) {
            expect(parsedTitles).toContain(expectedTitle);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('extracts correct content from Atom entries', () => {
      fc.assert(
        fc.property(atomFeedArb, (generatedFeed) => {
          const xml = generateAtomXML(generatedFeed);
          const result = parseRSSFeed(xml);
          
          expect(result.success).toBe(true);
          
          const parsedContents = result.feed!.items.map(item => normalizeString(item.content));
          const expectedContents = generatedFeed.items.map(item => normalizeString(item.content));
          
          for (const expectedContent of expectedContents) {
            expect(parsedContents).toContain(expectedContent);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('extracts correct URLs from Atom entries', () => {
      fc.assert(
        fc.property(atomFeedArb, (generatedFeed) => {
          const xml = generateAtomXML(generatedFeed);
          const result = parseRSSFeed(xml);
          
          expect(result.success).toBe(true);
          
          const parsedUrls = result.feed!.items.map(item => item.url);
          const expectedUrls = generatedFeed.items.map(item => item.url);
          
          for (const expectedUrl of expectedUrls) {
            expect(parsedUrls).toContain(expectedUrl);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('extracts correct publication dates from Atom entries', () => {
      fc.assert(
        fc.property(atomFeedArb, (generatedFeed) => {
          const xml = generateAtomXML(generatedFeed);
          const result = parseRSSFeed(xml);
          
          expect(result.success).toBe(true);
          
          for (const generatedItem of generatedFeed.items) {
            const parsedItem = result.feed!.items.find(
              item => item.url === generatedItem.url
            );
            
            expect(parsedItem).toBeDefined();
            expect(parsedItem!.publishedAt).toBeInstanceOf(Date);
            expect(datesAreClose(parsedItem!.publishedAt, generatedItem.publishedAt)).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('extracts correct feed metadata from Atom feeds', () => {
      fc.assert(
        fc.property(atomFeedArb, (generatedFeed) => {
          const xml = generateAtomXML(generatedFeed);
          const result = parseRSSFeed(xml);
          
          expect(result.success).toBe(true);
          expect(result.feed!.feedType).toBe('atom');
          expect(normalizeString(result.feed!.title)).toBe(normalizeString(generatedFeed.title));
          expect(normalizeString(result.feed!.description)).toBe(normalizeString(generatedFeed.description));
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Cross-format parsing properties', () => {
    it('all parsed items have required fields (title, content, url, publishedAt)', () => {
      fc.assert(
        fc.property(feedArb, (generatedFeed) => {
          const xml = generatedFeed.feedType === 'rss2' 
            ? generateRSS2XML(generatedFeed) 
            : generateAtomXML(generatedFeed);
          const result = parseRSSFeed(xml);
          
          expect(result.success).toBe(true);
          
          for (const item of result.feed!.items) {
            // Title should be a non-empty string
            expect(typeof item.title).toBe('string');
            expect(item.title.length).toBeGreaterThan(0);
            
            // Content should be a string (can be empty in some cases)
            expect(typeof item.content).toBe('string');
            
            // URL should be a valid URL string
            expect(typeof item.url).toBe('string');
            expect(item.url.startsWith('http')).toBe(true);
            
            // PublishedAt should be a valid Date
            expect(item.publishedAt).toBeInstanceOf(Date);
            expect(isNaN(item.publishedAt.getTime())).toBe(false);
            
            // ID should be present
            expect(typeof item.id).toBe('string');
            expect(item.id.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('item count is preserved during parsing', () => {
      fc.assert(
        fc.property(feedArb, (generatedFeed) => {
          const xml = generatedFeed.feedType === 'rss2' 
            ? generateRSS2XML(generatedFeed) 
            : generateAtomXML(generatedFeed);
          const result = parseRSSFeed(xml);
          
          expect(result.success).toBe(true);
          expect(result.feed!.items.length).toBe(generatedFeed.items.length);
        }),
        { numRuns: 100 }
      );
    });

    it('parseFeedItems returns same items as parseRSSFeed', () => {
      fc.assert(
        fc.property(feedArb, (generatedFeed) => {
          const xml = generatedFeed.feedType === 'rss2' 
            ? generateRSS2XML(generatedFeed) 
            : generateAtomXML(generatedFeed);
          
          const fullResult = parseRSSFeed(xml);
          const itemsOnly = parseFeedItems(xml);
          
          expect(fullResult.success).toBe(true);
          expect(itemsOnly.length).toBe(fullResult.feed!.items.length);
          
          // Items should have the same URLs
          const fullUrls = fullResult.feed!.items.map(i => i.url).sort();
          const itemUrls = itemsOnly.map(i => i.url).sort();
          expect(fullUrls).toEqual(itemUrls);
        }),
        { numRuns: 100 }
      );
    });

    it('parsing is deterministic - same input produces same output', () => {
      fc.assert(
        fc.property(feedArb, (generatedFeed) => {
          const xml = generatedFeed.feedType === 'rss2' 
            ? generateRSS2XML(generatedFeed) 
            : generateAtomXML(generatedFeed);
          
          const result1 = parseRSSFeed(xml);
          const result2 = parseRSSFeed(xml);
          
          expect(result1.success).toBe(result2.success);
          expect(result1.feed!.items.length).toBe(result2.feed!.items.length);
          
          // Same items in same order
          for (let i = 0; i < result1.feed!.items.length; i++) {
            expect(result1.feed!.items[i].id).toBe(result2.feed!.items[i].id);
            expect(result1.feed!.items[i].title).toBe(result2.feed!.items[i].title);
            expect(result1.feed!.items[i].url).toBe(result2.feed!.items[i].url);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Data integrity properties', () => {
    it('no data loss - all generated item data is recoverable', () => {
      fc.assert(
        fc.property(feedArb, (generatedFeed) => {
          const xml = generatedFeed.feedType === 'rss2' 
            ? generateRSS2XML(generatedFeed) 
            : generateAtomXML(generatedFeed);
          const result = parseRSSFeed(xml);
          
          expect(result.success).toBe(true);
          
          // Create maps for easy lookup
          const parsedByUrl = new Map(
            result.feed!.items.map(item => [item.url, item])
          );
          
          // Verify each generated item can be found with correct data
          for (const generatedItem of generatedFeed.items) {
            const parsedItem = parsedByUrl.get(generatedItem.url);
            
            expect(parsedItem).toBeDefined();
            expect(normalizeString(parsedItem!.title)).toBe(normalizeString(generatedItem.title));
            expect(normalizeString(parsedItem!.content)).toBe(normalizeString(generatedItem.content));
            expect(datesAreClose(parsedItem!.publishedAt, generatedItem.publishedAt)).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('unique items remain unique after parsing', () => {
      fc.assert(
        fc.property(feedArb, (generatedFeed) => {
          const xml = generatedFeed.feedType === 'rss2' 
            ? generateRSS2XML(generatedFeed) 
            : generateAtomXML(generatedFeed);
          const result = parseRSSFeed(xml);
          
          expect(result.success).toBe(true);
          
          // Check that all URLs are unique
          const urls = result.feed!.items.map(item => item.url);
          const uniqueUrls = new Set(urls);
          expect(uniqueUrls.size).toBe(urls.length);
          
          // Check that all IDs are unique
          const ids = result.feed!.items.map(item => item.id);
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(ids.length);
        }),
        { numRuns: 100 }
      );
    });
  });
});
