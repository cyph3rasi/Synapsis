/**
 * RSS Feed Parser
 * 
 * Parses RSS 2.0 and Atom feeds to extract feed items with title, content, URL, and publication date.
 * Handles malformed feeds gracefully with detailed error reporting.
 * 
 * Requirements: 4.2
 * Validates: Property 12 - RSS Parsing Correctness
 */

// ============================================
// TYPES
// ============================================

/**
 * Represents a parsed feed item.
 */
export interface FeedItem {
  /** Unique identifier for the item (guid, id, or generated from URL) */
  id: string;
  /** Title of the item */
  title: string;
  /** Content or description of the item */
  content: string;
  /** URL link to the item */
  url: string;
  /** Publication date of the item */
  publishedAt: Date;
}

/**
 * Represents a parsed feed with metadata and items.
 */
export interface ParsedFeed {
  /** Feed title */
  title: string;
  /** Feed description */
  description: string;
  /** Feed link/URL */
  link: string;
  /** Feed type detected */
  feedType: 'rss2' | 'atom' | 'rss1' | 'unknown';
  /** Parsed feed items */
  items: FeedItem[];
  /** Any warnings encountered during parsing */
  warnings: string[];
}

/**
 * Result of a feed parsing operation.
 */
export interface ParseResult {
  success: boolean;
  feed?: ParsedFeed;
  error?: string;
  warnings: string[];
}

// ============================================
// ERROR CLASSES
// ============================================

/**
 * Error thrown when RSS parsing fails.
 */
export class RSSParseError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: string
  ) {
    super(message);
    this.name = 'RSSParseError';
  }
}

// ============================================
// XML PARSING UTILITIES
// ============================================

/**
 * Simple XML tag content extractor.
 * Extracts content between opening and closing tags.
 */
function extractTagContent(xml: string, tagName: string): string | null {
  // Handle namespaced tags (e.g., content:encoded, dc:creator)
  const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Try to match with CDATA first
  const cdataPattern = new RegExp(
    `<${escapedTag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${escapedTag}>`,
    'i'
  );
  const cdataMatch = xml.match(cdataPattern);
  if (cdataMatch) {
    return cdataMatch[1];
  }
  
  // Try regular content
  const pattern = new RegExp(
    `<${escapedTag}[^>]*>([\\s\\S]*?)</${escapedTag}>`,
    'i'
  );
  const match = xml.match(pattern);
  if (match) {
    return decodeXMLEntities(match[1].trim());
  }
  
  // Try self-closing tag with content attribute (for Atom links)
  const selfClosingPattern = new RegExp(
    `<${escapedTag}[^>]*/>`,
    'i'
  );
  const selfClosingMatch = xml.match(selfClosingPattern);
  if (selfClosingMatch) {
    return null; // Self-closing tags don't have content
  }
  
  return null;
}

/**
 * Extract attribute value from an XML tag.
 */
function extractAttribute(xml: string, tagName: string, attrName: string): string | null {
  const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedAttr = attrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  const pattern = new RegExp(
    `<${escapedTag}[^>]*\\s${escapedAttr}=["']([^"']*)["'][^>]*>`,
    'i'
  );
  const match = xml.match(pattern);
  return match ? decodeXMLEntities(match[1]) : null;
}

/**
 * Extract all occurrences of a tag.
 */
function extractAllTags(xml: string, tagName: string): string[] {
  const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<${escapedTag}[^>]*>[\\s\\S]*?</${escapedTag}>|<${escapedTag}[^>]*/>`,
    'gi'
  );
  const matches = xml.match(pattern);
  return matches || [];
}

/**
 * Decode common XML entities.
 */
function decodeXMLEntities(text: string): string {
  if (!text) return '';
  
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

/**
 * Strip HTML tags from content.
 */
function stripHtmlTags(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * Generate a unique ID from URL or content.
 */
function generateId(url: string, title: string): string {
  const input = url || title || Date.now().toString();
  // Simple hash function for ID generation
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `generated-${Math.abs(hash).toString(36)}`;
}

// ============================================
// DATE PARSING
// ============================================

/**
 * Parse various date formats commonly found in RSS/Atom feeds.
 */
export function parseDate(dateStr: string | null): Date | null {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }
  
  const trimmed = dateStr.trim();
  if (!trimmed) {
    return null;
  }
  
  // Try ISO 8601 format (Atom standard)
  // e.g., 2024-01-15T10:30:00Z, 2024-01-15T10:30:00+00:00
  const isoDate = new Date(trimmed);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }
  
  // Try RFC 822 format (RSS 2.0 standard)
  // e.g., Mon, 15 Jan 2024 10:30:00 GMT
  const rfc822Pattern = /^(?:\w{3},?\s+)?(\d{1,2})\s+(\w{3})\s+(\d{4})\s+(\d{2}):(\d{2}):?(\d{2})?\s*(\w+|[+-]\d{4})?$/i;
  const rfc822Match = trimmed.match(rfc822Pattern);
  if (rfc822Match) {
    const [, day, monthStr, year, hour, minute, second = '00', tz = 'GMT'] = rfc822Match;
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    const month = months[monthStr.toLowerCase()];
    if (month !== undefined) {
      const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${day.padStart(2, '0')}T${hour}:${minute}:${second}`;
      const parsed = new Date(dateString + (tz === 'GMT' || tz === 'UTC' ? 'Z' : ''));
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }
  
  // Try simple date formats
  // e.g., 2024-01-15, 01/15/2024
  const simpleDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
  const simpleMatch = trimmed.match(simpleDatePattern);
  if (simpleMatch) {
    const parsed = new Date(trimmed + 'T00:00:00Z');
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  
  return null;
}

// ============================================
// FEED TYPE DETECTION
// ============================================

/**
 * Detect the type of feed from XML content.
 */
export function detectFeedType(xml: string): 'rss2' | 'atom' | 'rss1' | 'unknown' {
  const trimmed = xml.trim();
  
  // Check for Atom feed
  if (/<feed[^>]*xmlns=["']http:\/\/www\.w3\.org\/2005\/Atom["']/i.test(trimmed) ||
      /<feed[^>]*>/i.test(trimmed) && /<entry[^>]*>/i.test(trimmed)) {
    return 'atom';
  }
  
  // Check for RSS 2.0
  if (/<rss[^>]*version=["']2\.0["']/i.test(trimmed) ||
      /<rss[^>]*>/i.test(trimmed)) {
    return 'rss2';
  }
  
  // Check for RSS 1.0 (RDF-based)
  if (/<rdf:RDF/i.test(trimmed) && /<item[^>]*>/i.test(trimmed)) {
    return 'rss1';
  }
  
  // Check for generic RSS indicators
  if (/<channel[^>]*>/i.test(trimmed) && /<item[^>]*>/i.test(trimmed)) {
    return 'rss2';
  }
  
  return 'unknown';
}

// ============================================
// RSS 2.0 PARSER
// ============================================

/**
 * Parse an RSS 2.0 feed.
 */
function parseRSS2(xml: string, warnings: string[]): ParsedFeed {
  // Extract channel info
  const channelMatch = xml.match(/<channel[^>]*>([\s\S]*?)<\/channel>/i);
  const channelContent = channelMatch ? channelMatch[1] : xml;
  
  const title = extractTagContent(channelContent, 'title') || 'Untitled Feed';
  const description = extractTagContent(channelContent, 'description') || '';
  const link = extractTagContent(channelContent, 'link') || '';
  
  // Extract items
  const itemTags = extractAllTags(xml, 'item');
  const items: FeedItem[] = [];
  
  for (const itemXml of itemTags) {
    try {
      const item = parseRSS2Item(itemXml, warnings);
      if (item) {
        items.push(item);
      }
    } catch (err) {
      warnings.push(`Failed to parse item: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }
  
  return {
    title,
    description,
    link,
    feedType: 'rss2',
    items,
    warnings,
  };
}

/**
 * Parse a single RSS 2.0 item.
 */
function parseRSS2Item(itemXml: string, warnings: string[]): FeedItem | null {
  const title = extractTagContent(itemXml, 'title') || '';
  const link = extractTagContent(itemXml, 'link') || '';
  const guid = extractTagContent(itemXml, 'guid') || '';
  
  // Try multiple content sources
  let content = extractTagContent(itemXml, 'content:encoded') ||
                extractTagContent(itemXml, 'content') ||
                extractTagContent(itemXml, 'description') ||
                '';
  
  // Strip HTML for plain text content
  const plainContent = stripHtmlTags(content);
  
  // Parse publication date
  const pubDateStr = extractTagContent(itemXml, 'pubDate') ||
                     extractTagContent(itemXml, 'dc:date') ||
                     extractTagContent(itemXml, 'date');
  
  let publishedAt = parseDate(pubDateStr);
  if (!publishedAt) {
    publishedAt = new Date(); // Default to now if no date found
    if (pubDateStr) {
      warnings.push(`Could not parse date: ${pubDateStr}`);
    }
  }
  
  // Generate ID if not present
  const id = guid || link || generateId(link, title);
  
  // Skip items without title and content
  if (!title && !plainContent) {
    warnings.push('Skipping item with no title or content');
    return null;
  }
  
  return {
    id,
    title: title || 'Untitled',
    content: plainContent,
    url: link,
    publishedAt,
  };
}

// ============================================
// ATOM PARSER
// ============================================

/**
 * Parse an Atom feed.
 */
function parseAtom(xml: string, warnings: string[]): ParsedFeed {
  // Extract feed info
  const title = extractTagContent(xml, 'title') || 'Untitled Feed';
  const subtitle = extractTagContent(xml, 'subtitle') || '';
  
  // Atom uses <link> with href attribute
  let link = extractAttribute(xml, 'link[^>]*rel=["\'](alternate|self)["\']', 'href') ||
             extractAttribute(xml, 'link', 'href') ||
             '';
  
  // Extract entries
  const entryTags = extractAllTags(xml, 'entry');
  const items: FeedItem[] = [];
  
  for (const entryXml of entryTags) {
    try {
      const item = parseAtomEntry(entryXml, warnings);
      if (item) {
        items.push(item);
      }
    } catch (err) {
      warnings.push(`Failed to parse entry: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }
  
  return {
    title,
    description: subtitle,
    link,
    feedType: 'atom',
    items,
    warnings,
  };
}

/**
 * Parse a single Atom entry.
 */
function parseAtomEntry(entryXml: string, warnings: string[]): FeedItem | null {
  const title = extractTagContent(entryXml, 'title') || '';
  const id = extractTagContent(entryXml, 'id') || '';
  
  // Atom link is in href attribute
  const link = extractAttribute(entryXml, 'link[^>]*rel=["\'](alternate)["\']', 'href') ||
               extractAttribute(entryXml, 'link', 'href') ||
               '';
  
  // Try multiple content sources
  let content = extractTagContent(entryXml, 'content') ||
                extractTagContent(entryXml, 'summary') ||
                '';
  
  // Strip HTML for plain text content
  const plainContent = stripHtmlTags(content);
  
  // Parse dates (Atom uses updated and published)
  const publishedStr = extractTagContent(entryXml, 'published') ||
                       extractTagContent(entryXml, 'updated') ||
                       extractTagContent(entryXml, 'issued');
  
  let publishedAt = parseDate(publishedStr);
  if (!publishedAt) {
    publishedAt = new Date();
    if (publishedStr) {
      warnings.push(`Could not parse date: ${publishedStr}`);
    }
  }
  
  // Generate ID if not present
  const itemId = id || link || generateId(link, title);
  
  // Skip entries without title and content
  if (!title && !plainContent) {
    warnings.push('Skipping entry with no title or content');
    return null;
  }
  
  return {
    id: itemId,
    title: title || 'Untitled',
    content: plainContent,
    url: link,
    publishedAt,
  };
}

// ============================================
// RSS 1.0 PARSER
// ============================================

/**
 * Parse an RSS 1.0 (RDF) feed.
 */
function parseRSS1(xml: string, warnings: string[]): ParsedFeed {
  // Extract channel info
  const channelMatch = xml.match(/<channel[^>]*>([\s\S]*?)<\/channel>/i);
  const channelContent = channelMatch ? channelMatch[1] : '';
  
  const title = extractTagContent(channelContent, 'title') || 'Untitled Feed';
  const description = extractTagContent(channelContent, 'description') || '';
  const link = extractTagContent(channelContent, 'link') || '';
  
  // Extract items
  const itemTags = extractAllTags(xml, 'item');
  const items: FeedItem[] = [];
  
  for (const itemXml of itemTags) {
    try {
      const item = parseRSS1Item(itemXml, warnings);
      if (item) {
        items.push(item);
      }
    } catch (err) {
      warnings.push(`Failed to parse item: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }
  
  return {
    title,
    description,
    link,
    feedType: 'rss1',
    items,
    warnings,
  };
}

/**
 * Parse a single RSS 1.0 item.
 */
function parseRSS1Item(itemXml: string, warnings: string[]): FeedItem | null {
  const title = extractTagContent(itemXml, 'title') || '';
  const link = extractTagContent(itemXml, 'link') || '';
  const description = extractTagContent(itemXml, 'description') || '';
  
  // RSS 1.0 uses rdf:about as identifier
  const about = extractAttribute(itemXml, 'item', 'rdf:about') || '';
  
  // Parse date (RSS 1.0 often uses dc:date)
  const dateStr = extractTagContent(itemXml, 'dc:date') ||
                  extractTagContent(itemXml, 'date');
  
  let publishedAt = parseDate(dateStr);
  if (!publishedAt) {
    publishedAt = new Date();
    if (dateStr) {
      warnings.push(`Could not parse date: ${dateStr}`);
    }
  }
  
  const id = about || link || generateId(link, title);
  const plainContent = stripHtmlTags(description);
  
  if (!title && !plainContent) {
    warnings.push('Skipping item with no title or content');
    return null;
  }
  
  return {
    id,
    title: title || 'Untitled',
    content: plainContent,
    url: link,
    publishedAt,
  };
}

// ============================================
// MAIN PARSER FUNCTION
// ============================================

/**
 * Parse an RSS or Atom feed from XML string.
 * 
 * Supports:
 * - RSS 2.0
 * - Atom 1.0
 * - RSS 1.0 (RDF)
 * 
 * @param xml - The XML content of the feed
 * @returns ParseResult with parsed feed or error
 * 
 * Validates: Requirements 4.2
 */
export function parseRSSFeed(xml: string): ParseResult {
  const warnings: string[] = [];
  
  // Validate input
  if (!xml || typeof xml !== 'string') {
    return {
      success: false,
      error: 'Invalid input: XML content is required',
      warnings,
    };
  }
  
  const trimmed = xml.trim();
  if (!trimmed) {
    return {
      success: false,
      error: 'Invalid input: XML content is empty',
      warnings,
    };
  }
  
  // Check for XML declaration or root element
  if (!trimmed.startsWith('<?xml') && !trimmed.startsWith('<')) {
    return {
      success: false,
      error: 'Invalid XML: Content does not appear to be XML',
      warnings,
    };
  }
  
  try {
    // Detect feed type
    const feedType = detectFeedType(trimmed);
    
    if (feedType === 'unknown') {
      // Try to parse anyway, might be a non-standard feed
      warnings.push('Could not detect feed type, attempting RSS 2.0 parsing');
    }
    
    let feed: ParsedFeed;
    
    switch (feedType) {
      case 'atom':
        feed = parseAtom(trimmed, warnings);
        break;
      case 'rss1':
        feed = parseRSS1(trimmed, warnings);
        break;
      case 'rss2':
      case 'unknown':
      default:
        feed = parseRSS2(trimmed, warnings);
        break;
    }
    
    // Validate we got at least some content
    if (feed.items.length === 0 && !feed.title) {
      return {
        success: false,
        error: 'Failed to parse feed: No items or feed information found',
        warnings,
      };
    }
    
    return {
      success: true,
      feed,
      warnings,
    };
  } catch (err) {
    return {
      success: false,
      error: `Parse error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      warnings,
    };
  }
}

/**
 * Parse RSS feed and return only the items.
 * Convenience function for when you only need the items.
 * 
 * @param xml - The XML content of the feed
 * @returns Array of FeedItem or throws RSSParseError
 * 
 * Validates: Requirements 4.2
 */
export function parseFeedItems(xml: string): FeedItem[] {
  const result = parseRSSFeed(xml);
  
  if (!result.success || !result.feed) {
    throw new RSSParseError(
      result.error || 'Failed to parse feed',
      'PARSE_ERROR',
      result.warnings.join('; ')
    );
  }
  
  return result.feed.items;
}

/**
 * Validate that a string is a valid RSS/Atom feed.
 * 
 * @param xml - The XML content to validate
 * @returns True if the content is a valid feed
 */
export function isValidFeed(xml: string): boolean {
  const result = parseRSSFeed(xml);
  return result.success && result.feed !== undefined && result.feed.items.length > 0;
}

/**
 * Get feed metadata without parsing all items.
 * Useful for quick feed validation.
 * 
 * @param xml - The XML content of the feed
 * @returns Feed metadata or null if invalid
 */
export function getFeedMetadata(xml: string): { title: string; description: string; link: string; feedType: string } | null {
  const result = parseRSSFeed(xml);
  
  if (!result.success || !result.feed) {
    return null;
  }
  
  return {
    title: result.feed.title,
    description: result.feed.description,
    link: result.feed.link,
    feedType: result.feed.feedType,
  };
}
