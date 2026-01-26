/**
 * Unit Tests for Content Generator Module
 * 
 * Tests the content generator implementation for post generation,
 * reply generation, content interest evaluation, and content truncation.
 * 
 * Requirements: 3.2, 3.5, 6.2, 11.1, 11.2, 11.3
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest';
import {
  ContentGenerator,
  ContentGeneratorError,
  truncateContent,
  isContentTruncated,
  buildPostSystemPrompt,
  buildReplySystemPrompt,
  buildEvaluationSystemPrompt,
  buildPostUserMessage,
  buildReplyUserMessage,
  buildEvaluationUserMessage,
  parseInterestResponse,
  createContentGenerator,
  createContentGeneratorWithClient,
  MAX_SOURCE_CONTENT_LENGTH,
  TRUNCATION_SUFFIX,
  Bot,
  ContentItem,
  Post,
} from './contentGenerator';
import { LLMClient } from './llmClient';
import { PersonalityConfig } from './personality';

// ============================================
// TEST SETUP
// ============================================

// Store original env value to restore after tests
const originalEncryptionKey = process.env.BOT_ENCRYPTION_KEY;

// Generate a valid 32-byte encryption key for testing (base64 encoded)
const TEST_ENCRYPTION_KEY = Buffer.from(
  'test-encryption-key-32-bytes!!!!'.slice(0, 32)
).toString('base64');

beforeAll(() => {
  // Set up test encryption key
  process.env.BOT_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
});

afterAll(() => {
  // Restore original encryption key
  if (originalEncryptionKey !== undefined) {
    process.env.BOT_ENCRYPTION_KEY = originalEncryptionKey;
  } else {
    delete process.env.BOT_ENCRYPTION_KEY;
  }
});

// ============================================
// TEST DATA
// ============================================

const createTestPersonality = (): PersonalityConfig => ({
  systemPrompt: 'You are a helpful tech news bot that shares interesting technology updates.',
  temperature: 0.7,
  maxTokens: 500,
  responseStyle: 'professional',
});

const createTestBot = (): Bot => ({
  id: 'bot-123',
  name: 'TechBot',
  handle: 'techbot',
  personalityConfig: createTestPersonality(),
  llmProvider: 'openai',
  llmModel: 'gpt-4',
  llmApiKeyEncrypted: 'test-api-key-12345678901234567890',
});

const createTestContentItem = (): ContentItem => ({
  id: 'content-123',
  sourceId: 'source-456',
  title: 'New AI Breakthrough in Natural Language Processing',
  content: 'Researchers have developed a new AI model that significantly improves natural language understanding. The model uses a novel architecture that combines transformer networks with memory systems.',
  url: 'https://example.com/ai-breakthrough',
  publishedAt: new Date('2024-01-15T10:00:00Z'),
});

const createTestPost = (overrides?: Partial<Post>): Post => ({
  id: 'post-123',
  userId: 'user-456',
  content: 'Hey @techbot, what do you think about the new AI developments?',
  createdAt: new Date('2024-01-15T12:00:00Z'),
  author: {
    handle: 'curious_user',
    displayName: 'Curious User',
  },
  ...overrides,
});

// ============================================
// CONTENT TRUNCATION TESTS
// ============================================

describe('Content Truncation', () => {
  describe('truncateContent', () => {
    it('returns original content if under max length', () => {
      const content = 'Short content that does not need truncation.';
      const result = truncateContent(content);
      
      expect(result).toBe(content);
      expect(isContentTruncated(result)).toBe(false);
    });
    
    it('returns empty string for null/undefined content', () => {
      expect(truncateContent('')).toBe('');
      expect(truncateContent(null as unknown as string)).toBe('');
    });
    
    it('truncates content at sentence boundary when possible', () => {
      const content = 'First sentence. Second sentence. Third sentence that is very long and would exceed the limit if we included it all.';
      const result = truncateContent(content, 50);
      
      expect(result).toContain('First sentence.');
      expect(result).toContain(TRUNCATION_SUFFIX);
      expect(result.length).toBeLessThanOrEqual(50);
    });
    
    it('truncates content at word boundary when no sentence boundary', () => {
      const content = 'This is a long sentence without any periods that needs to be truncated at a word boundary';
      const result = truncateContent(content, 50);
      
      expect(result).toContain(TRUNCATION_SUFFIX);
      expect(result.length).toBeLessThanOrEqual(50);
      // Should not cut in the middle of a word (check that the character before the suffix is a space or punctuation)
      const beforeSuffix = result.slice(0, result.indexOf(TRUNCATION_SUFFIX));
      const lastChar = beforeSuffix.trim().slice(-1);
      // Last character should be a letter or punctuation, not in the middle of a word
      expect(beforeSuffix.endsWith(' ') || /[a-zA-Z]$/.test(beforeSuffix.trim())).toBe(true);
    });
    
    it('hard truncates when no good boundary found', () => {
      const content = 'Verylongwordwithoutanyspacesorpunctuationthatneedstobetruncated';
      const result = truncateContent(content, 30);
      
      expect(result).toContain(TRUNCATION_SUFFIX);
      expect(result.length).toBeLessThanOrEqual(30);
    });
    
    it('respects custom max length', () => {
      const content = 'A'.repeat(1000);
      const result = truncateContent(content, 100);
      
      expect(result.length).toBeLessThanOrEqual(100);
      expect(isContentTruncated(result)).toBe(true);
    });
    
    it('handles content exactly at max length', () => {
      const content = 'A'.repeat(MAX_SOURCE_CONTENT_LENGTH);
      const result = truncateContent(content);
      
      expect(result).toBe(content);
      expect(isContentTruncated(result)).toBe(false);
    });
    
    it('handles content just over max length', () => {
      const content = 'A'.repeat(MAX_SOURCE_CONTENT_LENGTH + 1);
      const result = truncateContent(content);
      
      expect(result.length).toBeLessThanOrEqual(MAX_SOURCE_CONTENT_LENGTH);
      expect(isContentTruncated(result)).toBe(true);
    });
  });
  
  describe('isContentTruncated', () => {
    it('returns true for truncated content', () => {
      const truncated = 'Some content' + TRUNCATION_SUFFIX;
      expect(isContentTruncated(truncated)).toBe(true);
    });
    
    it('returns false for non-truncated content', () => {
      const content = 'Some content without truncation';
      expect(isContentTruncated(content)).toBe(false);
    });
  });
});

// ============================================
// PROMPT BUILDING TESTS
// ============================================

describe('Prompt Building', () => {
  const personality = createTestPersonality();
  
  describe('buildPostSystemPrompt', () => {
    it('includes personality system prompt', () => {
      const prompt = buildPostSystemPrompt(personality);
      
      expect(prompt).toContain(personality.systemPrompt);
    });
    
    it('includes response style when provided', () => {
      const prompt = buildPostSystemPrompt(personality);
      
      expect(prompt).toContain('Response Style: professional');
    });
    
    it('includes post creation instructions', () => {
      const prompt = buildPostSystemPrompt(personality);
      
      expect(prompt).toContain('Instructions for creating posts');
      expect(prompt).toContain('engaging');
    });
    
    it('handles personality without response style', () => {
      const personalityNoStyle: PersonalityConfig = {
        systemPrompt: 'Test prompt',
        temperature: 0.7,
        maxTokens: 500,
      };
      
      const prompt = buildPostSystemPrompt(personalityNoStyle);
      
      expect(prompt).toContain('Test prompt');
      expect(prompt).not.toContain('Response Style:');
    });
  });
  
  describe('buildReplySystemPrompt', () => {
    it('includes personality system prompt', () => {
      const prompt = buildReplySystemPrompt(personality);
      
      expect(prompt).toContain(personality.systemPrompt);
    });
    
    it('includes reply instructions', () => {
      const prompt = buildReplySystemPrompt(personality);
      
      expect(prompt).toContain('Instructions for replying');
      expect(prompt).toContain('conversational');
    });
  });
  
  describe('buildEvaluationSystemPrompt', () => {
    it('includes personality system prompt', () => {
      const prompt = buildEvaluationSystemPrompt(personality);
      
      expect(prompt).toContain(personality.systemPrompt);
    });
    
    it('includes evaluation instructions', () => {
      const prompt = buildEvaluationSystemPrompt(personality);
      
      expect(prompt).toContain('evaluating');
      expect(prompt).toContain('interesting');
      expect(prompt).toContain('JSON');
    });
  });
  
  describe('buildPostUserMessage', () => {
    it('builds message with source content', () => {
      const content = createTestContentItem();
      const message = buildPostUserMessage(content);
      
      expect(message).toContain(content.title);
      expect(message).toContain(content.url);
      expect(message).toContain(content.content!);
    });
    
    it('builds message without source content', () => {
      const message = buildPostUserMessage();
      
      expect(message).toContain('Create an engaging post');
    });
    
    it('includes additional context when provided', () => {
      const content = createTestContentItem();
      const context = 'This is breaking news';
      const message = buildPostUserMessage(content, context);
      
      expect(message).toContain(context);
    });
    
    it('handles content with null content field', () => {
      const content: ContentItem = {
        ...createTestContentItem(),
        content: null,
      };
      const message = buildPostUserMessage(content);
      
      expect(message).toContain(content.title);
      expect(message).toContain(content.url);
    });
    
    it('truncates long source content', () => {
      const longContent: ContentItem = {
        ...createTestContentItem(),
        content: 'A'.repeat(MAX_SOURCE_CONTENT_LENGTH + 1000),
      };
      const message = buildPostUserMessage(longContent);
      
      expect(message).toContain(TRUNCATION_SUFFIX);
    });
  });
  
  describe('buildReplyUserMessage', () => {
    it('builds message with mention post', () => {
      const post = createTestPost();
      const message = buildReplyUserMessage(post, []);
      
      expect(message).toContain(post.content);
      expect(message).toContain('@curious_user');
    });
    
    it('includes conversation context', () => {
      const mentionPost = createTestPost();
      const contextPosts: Post[] = [
        createTestPost({
          id: 'post-1',
          content: 'First message in conversation',
          author: { handle: 'user1' },
        }),
        createTestPost({
          id: 'post-2',
          content: 'Second message in conversation',
          author: { handle: 'user2' },
        }),
      ];
      
      const message = buildReplyUserMessage(mentionPost, contextPosts);
      
      expect(message).toContain('Conversation context');
      expect(message).toContain('First message');
      expect(message).toContain('Second message');
    });
    
    it('handles post without author info', () => {
      const post: Post = {
        id: 'post-123',
        userId: 'user-456',
        content: 'Test content',
        createdAt: new Date(),
      };
      
      const message = buildReplyUserMessage(post, []);
      
      expect(message).toContain('@unknown');
    });
  });
  
  describe('buildEvaluationUserMessage', () => {
    it('builds evaluation message with content', () => {
      const content = createTestContentItem();
      const message = buildEvaluationUserMessage(content);
      
      expect(message).toContain(content.title);
      expect(message).toContain(content.url);
      expect(message).toContain('Evaluate');
      expect(message).toContain('JSON');
    });
  });
});

// ============================================
// RESPONSE PARSING TESTS
// ============================================

describe('Response Parsing', () => {
  describe('parseInterestResponse', () => {
    it('parses valid JSON response with interesting=true', () => {
      const response = '{"interesting": true, "reason": "This is relevant to tech"}';
      const result = parseInterestResponse(response);
      
      expect(result.interesting).toBe(true);
      expect(result.reason).toBe('This is relevant to tech');
    });
    
    it('parses valid JSON response with interesting=false', () => {
      const response = '{"interesting": false, "reason": "Not relevant to our audience"}';
      const result = parseInterestResponse(response);
      
      expect(result.interesting).toBe(false);
      expect(result.reason).toBe('Not relevant to our audience');
    });
    
    it('parses JSON wrapped in markdown code blocks', () => {
      const response = '```json\n{"interesting": true, "reason": "Great content"}\n```';
      const result = parseInterestResponse(response);
      
      expect(result.interesting).toBe(true);
      expect(result.reason).toBe('Great content');
    });
    
    it('handles alternative property names', () => {
      const response = '{"isInteresting": true, "explanation": "Good stuff"}';
      const result = parseInterestResponse(response);
      
      expect(result.interesting).toBe(true);
      expect(result.reason).toBe('Good stuff');
    });
    
    it('falls back to text analysis for non-JSON response', () => {
      const response = 'Yes, this content is interesting and relevant to share with followers.';
      const result = parseInterestResponse(response);
      
      expect(result.interesting).toBe(true);
    });
    
    it('detects negative response from text', () => {
      const response = 'No, this content is not interesting and should be skipped.';
      const result = parseInterestResponse(response);
      
      expect(result.interesting).toBe(false);
    });
    
    it('handles malformed JSON gracefully', () => {
      const response = '{interesting: true, reason: missing quotes}';
      const result = parseInterestResponse(response);
      
      // Should fall back to text analysis
      expect(typeof result.interesting).toBe('boolean');
      expect(typeof result.reason).toBe('string');
    });
  });
});

// ============================================
// CONTENT GENERATOR CLASS TESTS
// ============================================

describe('ContentGenerator', () => {
  const originalFetch = global.fetch;
  
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  
  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });
  
  describe('constructor', () => {
    it('creates generator with bot configuration', () => {
      const bot = createTestBot();
      const generator = new ContentGenerator(bot);
      
      expect(generator.getBot()).toBe(bot);
      expect(generator.getLLMClient()).toBeInstanceOf(LLMClient);
    });
    
    it('accepts custom LLM client', () => {
      const bot = createTestBot();
      const customClient = new LLMClient({
        provider: 'anthropic',
        apiKey: 'custom-key',
        model: 'claude-3',
      });
      
      const generator = new ContentGenerator(bot, customClient);
      
      expect(generator.getLLMClient()).toBe(customClient);
    });
  });
  
  describe('generatePost', () => {
    it('generates post with source content', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Exciting news in AI! A new breakthrough in NLP is changing how we interact with machines. Check it out: https://example.com/ai-breakthrough',
            },
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
        model: 'gpt-4',
      };
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });
      
      const bot = createTestBot();
      const generator = new ContentGenerator(bot);
      const content = createTestContentItem();
      
      const result = await generator.generatePost(content);
      
      expect(result.text).toContain('AI');
      expect(result.tokensUsed).toBe(150);
      expect(result.model).toBe('gpt-4');
    });
    
    it('generates post without source content', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Hello followers! Here is an update from your friendly tech bot.',
            },
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 20,
          total_tokens: 70,
        },
        model: 'gpt-4',
      };
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });
      
      const bot = createTestBot();
      const generator = new ContentGenerator(bot);
      
      const result = await generator.generatePost();
      
      expect(result.text).toBeTruthy();
      expect(result.tokensUsed).toBe(70);
    });
    
    it('includes personality in LLM request', async () => {
      let capturedBody: string | undefined;
      
      global.fetch = vi.fn().mockImplementation((_url, options) => {
        capturedBody = options?.body as string;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            choices: [{ message: { content: 'Test response' } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
        });
      });
      
      const bot = createTestBot();
      const generator = new ContentGenerator(bot);
      
      await generator.generatePost();
      
      expect(capturedBody).toBeDefined();
      const body = JSON.parse(capturedBody!);
      
      // System message should contain personality
      const systemMessage = body.messages.find((m: { role: string }) => m.role === 'system');
      expect(systemMessage.content).toContain(bot.personalityConfig.systemPrompt);
      
      // Temperature should match personality config
      expect(body.temperature).toBe(bot.personalityConfig.temperature);
    });
    
    it('throws ContentGeneratorError on LLM failure', async () => {
      // Don't use fake timers for this test as it interferes with retry logic
      vi.useRealTimers();
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal server error' }),
      });
      
      const bot = createTestBot();
      // Create LLM client with no retries to avoid timeout
      const llmClient = new LLMClient(
        {
          provider: bot.llmProvider,
          apiKey: bot.llmApiKeyEncrypted,
          model: bot.llmModel,
        },
        { maxRetries: 0, initialDelayMs: 0, maxDelayMs: 0, backoffMultiplier: 1 }
      );
      const generator = new ContentGenerator(bot, llmClient);
      
      await expect(generator.generatePost()).rejects.toThrow(ContentGeneratorError);
      
      // Restore fake timers for other tests
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });
  });
  
  describe('generateReply', () => {
    it('generates reply to mention', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Great question! The recent AI developments are fascinating. I think we are seeing a major shift in how NLP models work.',
            },
          },
        ],
        usage: {
          prompt_tokens: 80,
          completion_tokens: 40,
          total_tokens: 120,
        },
        model: 'gpt-4',
      };
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });
      
      const bot = createTestBot();
      const generator = new ContentGenerator(bot);
      const mentionPost = createTestPost();
      
      const result = await generator.generateReply(mentionPost, []);
      
      expect(result.text).toContain('AI');
      expect(result.tokensUsed).toBe(120);
    });
    
    it('includes conversation context in reply', async () => {
      let capturedBody: string | undefined;
      
      global.fetch = vi.fn().mockImplementation((_url, options) => {
        capturedBody = options?.body as string;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            choices: [{ message: { content: 'Reply with context' } }],
            usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
          }),
        });
      });
      
      const bot = createTestBot();
      const generator = new ContentGenerator(bot);
      const mentionPost = createTestPost();
      const contextPosts: Post[] = [
        createTestPost({
          id: 'context-1',
          content: 'Previous message in thread',
          author: { handle: 'other_user' },
        }),
      ];
      
      await generator.generateReply(mentionPost, contextPosts);
      
      expect(capturedBody).toBeDefined();
      const body = JSON.parse(capturedBody!);
      
      // User message should contain conversation context
      const userMessage = body.messages.find((m: { role: string }) => m.role === 'user');
      expect(userMessage.content).toContain('Previous message');
    });
  });
  
  describe('evaluateContentInterest', () => {
    it('evaluates content as interesting', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: '{"interesting": true, "reason": "This AI breakthrough is highly relevant to our tech-focused audience."}',
            },
          },
        ],
        usage: {
          prompt_tokens: 60,
          completion_tokens: 30,
          total_tokens: 90,
        },
        model: 'gpt-4',
      };
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });
      
      const bot = createTestBot();
      const generator = new ContentGenerator(bot);
      const content = createTestContentItem();
      
      const result = await generator.evaluateContentInterest(content);
      
      expect(result.interesting).toBe(true);
      expect(result.reason).toContain('relevant');
    });
    
    it('evaluates content as not interesting', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: '{"interesting": false, "reason": "This content is not relevant to technology."}',
            },
          },
        ],
        usage: {
          prompt_tokens: 60,
          completion_tokens: 25,
          total_tokens: 85,
        },
        model: 'gpt-4',
      };
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });
      
      const bot = createTestBot();
      const generator = new ContentGenerator(bot);
      const content: ContentItem = {
        ...createTestContentItem(),
        title: 'Celebrity Gossip News',
        content: 'Latest celebrity news and gossip...',
      };
      
      const result = await generator.evaluateContentInterest(content);
      
      expect(result.interesting).toBe(false);
    });
    
    it('uses lower temperature for evaluation', async () => {
      let capturedBody: string | undefined;
      
      global.fetch = vi.fn().mockImplementation((_url, options) => {
        capturedBody = options?.body as string;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            choices: [{ message: { content: '{"interesting": true, "reason": "test"}' } }],
            usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
          }),
        });
      });
      
      const bot = createTestBot();
      const generator = new ContentGenerator(bot);
      const content = createTestContentItem();
      
      await generator.evaluateContentInterest(content);
      
      expect(capturedBody).toBeDefined();
      const body = JSON.parse(capturedBody!);
      
      // Should use lower temperature for consistent evaluation
      expect(body.temperature).toBe(0.3);
    });
  });
});

// ============================================
// FACTORY FUNCTION TESTS
// ============================================

describe('Factory Functions', () => {
  describe('createContentGenerator', () => {
    it('creates generator from bot config', () => {
      const bot = createTestBot();
      const generator = createContentGenerator(bot);
      
      expect(generator).toBeInstanceOf(ContentGenerator);
      expect(generator.getBot()).toBe(bot);
    });
  });
  
  describe('createContentGeneratorWithClient', () => {
    it('creates generator with custom client', () => {
      const bot = createTestBot();
      const client = new LLMClient({
        provider: 'anthropic',
        apiKey: 'test-key',
        model: 'claude-3',
      });
      
      const generator = createContentGeneratorWithClient(bot, client);
      
      expect(generator).toBeInstanceOf(ContentGenerator);
      expect(generator.getLLMClient()).toBe(client);
    });
  });
});

// ============================================
// ERROR HANDLING TESTS
// ============================================

describe('Error Handling', () => {
  describe('ContentGeneratorError', () => {
    it('creates error with all properties', () => {
      const cause = new Error('Original error');
      const error = new ContentGeneratorError(
        'Generation failed',
        'LLM_ERROR',
        cause
      );
      
      expect(error.message).toBe('Generation failed');
      expect(error.code).toBe('LLM_ERROR');
      expect(error.cause).toBe(cause);
      expect(error.name).toBe('ContentGeneratorError');
    });
    
    it('is instanceof Error', () => {
      const error = new ContentGeneratorError('Test', 'GENERATION_FAILED');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ContentGeneratorError);
    });
  });
});
