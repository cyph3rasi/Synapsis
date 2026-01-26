/**
 * Unit Tests for RSS Feed Parser
 * 
 * Tests RSS 2.0, Atom, and RSS 1.0 feed parsing with various edge cases.
 * 
 * Requirements: 4.2
 * Validates: Property 12 - RSS Parsing Correctness
 */

import { describe, it, expect } from 'vitest';
import {
  parseRSSFeed,
  parseFeedItems,
  isValidFeed,
  getFeedMetadata,
  detectFeedType,
  parseDate,
  RSSParseError,
  FeedItem,
  ParsedFeed,
} from './rssParser';

// ============================================
// TEST DATA - RSS 2.0 FEEDS
// ============================================

const validRSS2Feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test RSS Feed</title>
    <link>https://example.com</link>
    <description>A test RSS feed for unit testing</description>
    <item>
      <title>First Article</title>
      <link>https://example.com/article1</link>
      <description>This is the first article content.</description>
      <pubDate>Mon, 15 Jan 2024 10:30:00 GMT</pubDate>
      <guid>article-1</guid>
    </item>
    <item>
      <title>Second Article</title>
      <link>https://example.com/article2</link>
      <description>This is the second article content.</description>
      <pubDate>Tue, 16 Jan 2024 14:00:00 GMT</pubDate>
      <guid>article-2</guid>
    </item>
  </channel>
</rss>`;

const rss2WithCDATA = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>CDATA Test Feed</title>
    <link>https://example.com</link>
    <description>Testing CDATA content</description>
    <item>
      <title><![CDATA[Article with <Special> Characters]]></title>
      <link>https://example.com/cdata-article</link>
      <description><![CDATA[<p>HTML content with <strong>tags</strong></p>]]></description>
      <pubDate>Wed, 17 Jan 2024 09:00:00 GMT</pubDate>
      <guid>cdata-article</guid>
    </item>
  </channel>
</rss>`;

const rss2WithContentEncoded = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Content Encoded Feed</title>
    <link>https://example.com</link>
    <description>Testing content:encoded</description>
    <item>
      <title>Full Content Article</title>
      <link>https://example.com/full-content</link>
      <description>Short description</description>
      <content:encoded><![CDATA[<p>This is the full article content with more details.</p>]]></content:encoded>
      <pubDate>Thu, 18 Jan 2024 11:00:00 GMT</pubDate>
      <guid>full-content-article</guid>
    </item>
  </channel>
</rss>`;

// ============================================
// TEST DATA - ATOM FEEDS
// ============================================

const validAtomFeed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test Atom Feed</title>
  <subtitle>A test Atom feed for unit testing</subtitle>
  <link href="https://example.com" rel="alternate"/>
  <id>urn:uuid:test-feed-id</id>
  <updated>2024-01-15T10:30:00Z</updated>
  <entry>
    <title>First Entry</title>
    <link href="https://example.com/entry1" rel="alternate"/>
    <id>urn:uuid:entry-1</id>
    <published>2024-01-15T10:30:00Z</published>
    <updated>2024-01-15T10:30:00Z</updated>
    <summary>This is the first entry summary.</summary>
  </entry>
  <entry>
    <title>Second Entry</title>
    <link href="https://example.com/entry2" rel="alternate"/>
    <id>urn:uuid:entry-2</id>
    <published>2024-01-16T14:00:00Z</published>
    <updated>2024-01-16T14:00:00Z</updated>
    <content type="html">This is the second entry content.</content>
  </entry>
</feed>`;

const atomWithContent = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Content Feed</title>
  <link href="https://example.com"/>
  <entry>
    <title>Content Entry</title>
    <link href="https://example.com/content-entry"/>
    <id>content-entry-1</id>
    <updated>2024-01-17T09:00:00Z</updated>
    <content type="html"><![CDATA[<p>Full HTML content here</p>]]></content>
  </entry>
</feed>`;

// ============================================
// TEST DATA - RSS 1.0 (RDF) FEEDS
// ============================================

const validRSS1Feed = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns="http://purl.org/rss/1.0/"
         xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Test RSS 1.0 Feed</title>
    <link>https://example.com</link>
    <description>A test RSS 1.0 feed</description>
  </channel>
  <item rdf:about="https://example.com/rdf-item1">
    <title>RDF Item 1</title>
    <link>https://example.com/rdf-item1</link>
    <description>First RDF item description</description>
    <dc:date>2024-01-15T10:30:00Z</dc:date>
  </item>
</rdf:RDF>`;

// ============================================
// TEST DATA - MALFORMED FEEDS
// ============================================

const malformedFeed = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Malformed Feed</title>
    <item>
      <title>Item without closing tag
      <link>https://example.com/broken</link>
    </item>
    <item>
      <title>Valid Item</title>
      <link>https://example.com/valid</link>
      <description>This item is valid</description>
    </item>
  </channel>
</rss>`;

const feedWithMissingFields = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Incomplete Feed</title>
    <item>
      <link>https://example.com/no-title</link>
      <description>Item without title</description>
    </item>
    <item>
      <title>Item without link</title>
      <description>This item has no link</description>
    </item>
    <item>
      <title></title>
      <description></description>
    </item>
  </channel>
</rss>`;

const feedWithInvalidDates = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Invalid Dates Feed</title>
    <item>
      <title>Item with invalid date</title>
      <link>https://example.com/invalid-date</link>
      <pubDate>not-a-date</pubDate>
    </item>
    <item>
      <title>Item with empty date</title>
      <link>https://example.com/empty-date</link>
      <pubDate></pubDate>
    </item>
  </channel>
</rss>`;

// ============================================
// FEED TYPE DETECTION TESTS
// ============================================

describe('detectFeedType', () => {
  it('should detect RSS 2.0 feeds', () => {
    expect(detectFeedType(validRSS2Feed)).toBe('rss2');
    expect(detectFeedType('<rss version="2.0"><channel></channel></rss>')).toBe('rss2');
  });

  it('should detect Atom feeds', () => {
    expect(detectFeedType(validAtomFeed)).toBe('atom');
    expect(detectFeedType('<feed xmlns="http://www.w3.org/2005/Atom"></feed>')).toBe('atom');
  });

  it('should detect RSS 1.0 (RDF) feeds', () => {
    expect(detectFeedType(validRSS1Feed)).toBe('rss1');
  });

  it('should return unknown for unrecognized formats', () => {
    expect(detectFeedType('<html><body>Not a feed</body></html>')).toBe('unknown');
    expect(detectFeedType('plain text')).toBe('unknown');
  });
});

// ============================================
// DATE PARSING TESTS
// ============================================

describe('parseDate', () => {
  it('should parse ISO 8601 dates', () => {
    const date = parseDate('2024-01-15T10:30:00Z');
    expect(date).toBeInstanceOf(Date);
    expect(date?.toISOString()).toBe('2024-01-15T10:30:00.000Z');
  });

  it('should parse ISO 8601 dates with timezone offset', () => {
    const date = parseDate('2024-01-15T10:30:00+00:00');
    expect(date).toBeInstanceOf(Date);
  });

  it('should parse RFC 822 dates', () => {
    const date = parseDate('Mon, 15 Jan 2024 10:30:00 GMT');
    expect(date).toBeInstanceOf(Date);
    expect(date?.getUTCFullYear()).toBe(2024);
    expect(date?.getUTCMonth()).toBe(0); // January
    expect(date?.getUTCDate()).toBe(15);
  });

  it('should parse simple date formats', () => {
    const date = parseDate('2024-01-15');
    expect(date).toBeInstanceOf(Date);
    expect(date?.getUTCFullYear()).toBe(2024);
  });

  it('should return null for invalid dates', () => {
    expect(parseDate('not-a-date')).toBe(null);
    expect(parseDate('')).toBe(null);
    expect(parseDate(null)).toBe(null);
  });

  it('should handle whitespace', () => {
    const date = parseDate('  2024-01-15T10:30:00Z  ');
    expect(date).toBeInstanceOf(Date);
  });
});

// ============================================
// RSS 2.0 PARSING TESTS
// ============================================

describe('parseRSSFeed - RSS 2.0', () => {
  it('should parse a valid RSS 2.0 feed', () => {
    const result = parseRSSFeed(validRSS2Feed);
    
    expect(result.success).toBe(true);
    expect(result.feed).toBeDefined();
    expect(result.feed?.feedType).toBe('rss2');
    expect(result.feed?.title).toBe('Test RSS Feed');
    expect(result.feed?.description).toBe('A test RSS feed for unit testing');
    expect(result.feed?.link).toBe('https://example.com');
    expect(result.feed?.items).toHaveLength(2);
  });

  it('should extract all item fields correctly', () => {
    const result = parseRSSFeed(validRSS2Feed);
    const firstItem = result.feed?.items[0];
    
    expect(firstItem?.title).toBe('First Article');
    expect(firstItem?.url).toBe('https://example.com/article1');
    expect(firstItem?.content).toBe('This is the first article content.');
    expect(firstItem?.id).toBe('article-1');
    expect(firstItem?.publishedAt).toBeInstanceOf(Date);
  });

  it('should handle CDATA sections', () => {
    const result = parseRSSFeed(rss2WithCDATA);
    
    expect(result.success).toBe(true);
    expect(result.feed?.items[0]?.title).toBe('Article with <Special> Characters');
    // HTML should be stripped from content
    expect(result.feed?.items[0]?.content).toBe('HTML content with tags');
  });

  it('should prefer content:encoded over description', () => {
    const result = parseRSSFeed(rss2WithContentEncoded);
    
    expect(result.success).toBe(true);
    // content:encoded should be used, HTML stripped
    expect(result.feed?.items[0]?.content).toBe('This is the full article content with more details.');
  });
});

// ============================================
// ATOM PARSING TESTS
// ============================================

describe('parseRSSFeed - Atom', () => {
  it('should parse a valid Atom feed', () => {
    const result = parseRSSFeed(validAtomFeed);
    
    expect(result.success).toBe(true);
    expect(result.feed).toBeDefined();
    expect(result.feed?.feedType).toBe('atom');
    expect(result.feed?.title).toBe('Test Atom Feed');
    expect(result.feed?.description).toBe('A test Atom feed for unit testing');
    expect(result.feed?.items).toHaveLength(2);
  });

  it('should extract Atom entry fields correctly', () => {
    const result = parseRSSFeed(validAtomFeed);
    const firstEntry = result.feed?.items[0];
    
    expect(firstEntry?.title).toBe('First Entry');
    expect(firstEntry?.id).toBe('urn:uuid:entry-1');
    expect(firstEntry?.content).toBe('This is the first entry summary.');
    expect(firstEntry?.publishedAt).toBeInstanceOf(Date);
  });

  it('should handle Atom content element', () => {
    const result = parseRSSFeed(atomWithContent);
    
    expect(result.success).toBe(true);
    expect(result.feed?.items[0]?.content).toBe('Full HTML content here');
  });
});

// ============================================
// RSS 1.0 PARSING TESTS
// ============================================

describe('parseRSSFeed - RSS 1.0', () => {
  it('should parse a valid RSS 1.0 feed', () => {
    const result = parseRSSFeed(validRSS1Feed);
    
    expect(result.success).toBe(true);
    expect(result.feed).toBeDefined();
    expect(result.feed?.feedType).toBe('rss1');
    expect(result.feed?.title).toBe('Test RSS 1.0 Feed');
    expect(result.feed?.items).toHaveLength(1);
  });

  it('should extract RSS 1.0 item fields', () => {
    const result = parseRSSFeed(validRSS1Feed);
    const item = result.feed?.items[0];
    
    expect(item?.title).toBe('RDF Item 1');
    expect(item?.url).toBe('https://example.com/rdf-item1');
    expect(item?.content).toBe('First RDF item description');
  });
});

// ============================================
// MALFORMED FEED HANDLING TESTS
// ============================================

describe('parseRSSFeed - Malformed feeds', () => {
  it('should handle feeds with missing fields gracefully', () => {
    const result = parseRSSFeed(feedWithMissingFields);
    
    expect(result.success).toBe(true);
    // Should parse items that have at least title or description
    expect(result.feed?.items.length).toBeGreaterThan(0);
    // Items without both title and content should be skipped
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should handle feeds with invalid dates', () => {
    const result = parseRSSFeed(feedWithInvalidDates);
    
    expect(result.success).toBe(true);
    // Items should still be parsed with default dates
    expect(result.feed?.items).toHaveLength(2);
    // Should have warnings about unparseable dates
    expect(result.warnings.some(w => w.includes('date'))).toBe(true);
  });

  it('should reject empty input', () => {
    expect(parseRSSFeed('').success).toBe(false);
    expect(parseRSSFeed('   ').success).toBe(false);
  });

  it('should reject non-XML input', () => {
    const result = parseRSSFeed('This is not XML');
    expect(result.success).toBe(false);
    expect(result.error).toContain('XML');
  });

  it('should reject null/undefined input', () => {
    expect(parseRSSFeed(null as unknown as string).success).toBe(false);
    expect(parseRSSFeed(undefined as unknown as string).success).toBe(false);
  });

  it('should handle HTML instead of XML', () => {
    const html = '<html><head><title>Not a feed</title></head><body>Content</body></html>';
    const result = parseRSSFeed(html);
    
    // Should fail or return empty items
    expect(result.feed?.items.length || 0).toBe(0);
  });
});

// ============================================
// HELPER FUNCTION TESTS
// ============================================

describe('parseFeedItems', () => {
  it('should return items array for valid feed', () => {
    const items = parseFeedItems(validRSS2Feed);
    
    expect(Array.isArray(items)).toBe(true);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('First Article');
  });

  it('should throw RSSParseError for invalid feed', () => {
    expect(() => parseFeedItems('')).toThrow(RSSParseError);
    expect(() => parseFeedItems('not xml')).toThrow(RSSParseError);
  });
});

describe('isValidFeed', () => {
  it('should return true for valid feeds', () => {
    expect(isValidFeed(validRSS2Feed)).toBe(true);
    expect(isValidFeed(validAtomFeed)).toBe(true);
    expect(isValidFeed(validRSS1Feed)).toBe(true);
  });

  it('should return false for invalid feeds', () => {
    expect(isValidFeed('')).toBe(false);
    expect(isValidFeed('not xml')).toBe(false);
    expect(isValidFeed('<html></html>')).toBe(false);
  });
});

describe('getFeedMetadata', () => {
  it('should return metadata for valid feed', () => {
    const metadata = getFeedMetadata(validRSS2Feed);
    
    expect(metadata).not.toBeNull();
    expect(metadata?.title).toBe('Test RSS Feed');
    expect(metadata?.description).toBe('A test RSS feed for unit testing');
    expect(metadata?.link).toBe('https://example.com');
    expect(metadata?.feedType).toBe('rss2');
  });

  it('should return null for invalid feed', () => {
    expect(getFeedMetadata('')).toBeNull();
    expect(getFeedMetadata('not xml')).toBeNull();
  });
});

// ============================================
// EDGE CASE TESTS
// ============================================

describe('Edge cases', () => {
  it('should handle XML entities', () => {
    const feedWithEntities = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Entity &amp; Test</title>
    <item>
      <title>Article &lt;1&gt;</title>
      <link>https://example.com/test</link>
      <description>Testing &quot;quotes&quot; and &apos;apostrophes&apos;</description>
    </item>
  </channel>
</rss>`;
    
    const result = parseRSSFeed(feedWithEntities);
    expect(result.success).toBe(true);
    expect(result.feed?.title).toBe('Entity & Test');
    expect(result.feed?.items[0]?.title).toBe('Article <1>');
    expect(result.feed?.items[0]?.content).toContain('"quotes"');
  });

  it('should handle numeric character references', () => {
    const feedWithNumericRefs = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Numeric &#65; Test</title>
    <item>
      <title>Test &#x41; Item</title>
      <link>https://example.com/test</link>
      <description>Content</description>
    </item>
  </channel>
</rss>`;
    
    const result = parseRSSFeed(feedWithNumericRefs);
    expect(result.success).toBe(true);
    expect(result.feed?.title).toBe('Numeric A Test');
    expect(result.feed?.items[0]?.title).toBe('Test A Item');
  });

  it('should handle feeds with no items', () => {
    const emptyFeed = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Empty Feed</title>
    <link>https://example.com</link>
    <description>A feed with no items</description>
  </channel>
</rss>`;
    
    const result = parseRSSFeed(emptyFeed);
    expect(result.success).toBe(true);
    expect(result.feed?.items).toHaveLength(0);
  });

  it('should handle very long content', () => {
    const longContent = 'A'.repeat(10000);
    const feedWithLongContent = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Long Content Feed</title>
    <item>
      <title>Long Article</title>
      <link>https://example.com/long</link>
      <description>${longContent}</description>
    </item>
  </channel>
</rss>`;
    
    const result = parseRSSFeed(feedWithLongContent);
    expect(result.success).toBe(true);
    expect(result.feed?.items[0]?.content.length).toBe(10000);
  });

  it('should generate IDs when guid is missing', () => {
    const feedWithoutGuid = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>No GUID Feed</title>
    <item>
      <title>Article without GUID</title>
      <link>https://example.com/no-guid</link>
      <description>Content</description>
    </item>
  </channel>
</rss>`;
    
    const result = parseRSSFeed(feedWithoutGuid);
    expect(result.success).toBe(true);
    // Should use link as ID or generate one
    expect(result.feed?.items[0]?.id).toBeTruthy();
  });

  it('should strip HTML tags from content', () => {
    const feedWithHtml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>HTML Content Feed</title>
    <item>
      <title>HTML Article</title>
      <link>https://example.com/html</link>
      <description><![CDATA[<p>Paragraph with <strong>bold</strong> and <a href="#">link</a></p>]]></description>
    </item>
  </channel>
</rss>`;
    
    const result = parseRSSFeed(feedWithHtml);
    expect(result.success).toBe(true);
    expect(result.feed?.items[0]?.content).toBe('Paragraph with bold and link');
  });
});

// ============================================
// REAL-WORLD FEED STRUCTURE TESTS
// ============================================

describe('Real-world feed structures', () => {
  it('should handle WordPress RSS feeds', () => {
    const wordpressFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>WordPress Blog</title>
    <link>https://blog.example.com</link>
    <description>A WordPress blog</description>
    <atom:link href="https://blog.example.com/feed/" rel="self" type="application/rss+xml"/>
    <item>
      <title>Blog Post Title</title>
      <link>https://blog.example.com/post-1/</link>
      <dc:creator>Author Name</dc:creator>
      <pubDate>Fri, 19 Jan 2024 12:00:00 +0000</pubDate>
      <guid isPermaLink="false">https://blog.example.com/?p=123</guid>
      <description>Short excerpt...</description>
      <content:encoded><![CDATA[<p>Full post content here.</p>]]></content:encoded>
    </item>
  </channel>
</rss>`;
    
    const result = parseRSSFeed(wordpressFeed);
    expect(result.success).toBe(true);
    expect(result.feed?.items[0]?.content).toBe('Full post content here.');
  });

  it('should handle GitHub Atom feeds', () => {
    const githubFeed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <id>tag:github.com,2008:https://github.com/user/repo/releases</id>
  <link type="text/html" rel="alternate" href="https://github.com/user/repo/releases"/>
  <link type="application/atom+xml" rel="self" href="https://github.com/user/repo/releases.atom"/>
  <title>Release notes from repo</title>
  <updated>2024-01-19T10:00:00Z</updated>
  <entry>
    <id>tag:github.com,2008:Repository/123/v1.0.0</id>
    <updated>2024-01-19T10:00:00Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/user/repo/releases/tag/v1.0.0"/>
    <title>v1.0.0</title>
    <content type="html">Release notes content</content>
    <author>
      <name>username</name>
    </author>
  </entry>
</feed>`;
    
    const result = parseRSSFeed(githubFeed);
    expect(result.success).toBe(true);
    expect(result.feed?.feedType).toBe('atom');
    expect(result.feed?.items[0]?.title).toBe('v1.0.0');
  });
});
