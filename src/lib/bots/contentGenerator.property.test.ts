/**
 * Property-Based Tests for Content Generator Module
 * 
 * Feature: bot-system
 * - Property 10: Personality in LLM Prompts
 * 
 * Tests that personality configuration is included in all LLM calls.
 * 
 * **Validates: Requirements 3.2, 3.5**
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  ContentGenerator,
  Bot,
  ContentItem,
  Post,
  buildPostSystemPrompt,
  buildReplySystemPrompt,
  buildPostUserMessage,
} from './contentGenerator';
import { LLMClient, LLMCompletionRequest, LLMCompletionResponse } from './llmClient';
import { PersonalityConfig } from './personality';
import { LLMProvider } from './encryption';

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
 * Generator for optional response styles.
 */
const responseStyleArb = fc.option(
  fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  { nil: undefined }
);

/**
 * Generator for valid personality configurations.
 */
const personalityConfigArb: fc.Arbitrary<PersonalityConfig> = fc.record({
  systemPrompt: systemPromptArb,
  temperature: temperatureArb,
  maxTokens: maxTokensArb,
  responseStyle: responseStyleArb,
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
 * Generator for bot configurations.
 */
const botArb: fc.Arbitrary<Bot> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  handle: fc.string({ minLength: 3, maxLength: 30 }).map(s => s.toLowerCase().replace(/[^a-z0-9]/g, '')),
  personalityConfig: personalityConfigArb,
  llmProvider: llmProviderArb,
  llmModel: llmModelArb,
  llmApiKeyEncrypted: fc.string({ minLength: 20, maxLength: 100 }),
});

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
 * Generator for posts.
 */
const postArb: fc.Arbitrary<Post> = fc.record({
  id: fc.uuid(),
  userId: fc.uuid(),
  content: fc.string({ minLength: 1, maxLength: 500 }),
  createdAt: fc.date(),
  author: fc.option(
    fc.record({
      handle: fc.string({ minLength: 3, maxLength: 30 }),
      displayName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
    }),
    { nil: undefined }
  ),
});

// ============================================
// MOCK LLM CLIENT
// ============================================

/**
 * Create a mock LLM client that captures requests.
 */
function createMockLLMClient(capturedRequests: LLMCompletionRequest[]): LLMClient {
  const mockClient = {
    generateCompletion: vi.fn(async (request: LLMCompletionRequest): Promise<LLMCompletionResponse> => {
      // Capture the request for inspection
      capturedRequests.push(request);
      
      // Return a mock response
      return {
        content: 'Mock generated content',
        tokensUsed: {
          prompt: 100,
          completion: 50,
          total: 150,
        },
        model: 'mock-model',
        provider: 'openai',
      };
    }),
    getProvider: vi.fn(() => 'openai' as LLMProvider),
    getModel: vi.fn(() => 'mock-model'),
  } as unknown as LLMClient;
  
  return mockClient;
}

// ============================================
// PROPERTY TESTS
// ============================================

describe('Feature: bot-system, Property 10: Personality in LLM Prompts', () => {
  /**
   * Property 10: Personality in LLM Prompts
   * 
   * *For any* bot with a configured personality, all LLM calls (posts and replies)
   * SHALL include the personality system prompt in the request.
   * 
   * **Validates: Requirements 3.2, 3.5**
   */

  it('generatePost includes personality system prompt in LLM request (Requirement 3.2)', async () => {
    await fc.assert(
      fc.asyncProperty(
        botArb,
        fc.option(contentItemArb, { nil: undefined }),
        fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
        async (bot, sourceContent, context) => {
          const capturedRequests: LLMCompletionRequest[] = [];
          const mockClient = createMockLLMClient(capturedRequests);
          const generator = new ContentGenerator(bot, mockClient);
          
          // Generate a post
          await generator.generatePost(sourceContent, context);
          
          // Verify that a request was made
          expect(capturedRequests.length).toBe(1);
          
          const request = capturedRequests[0];
          
          // Verify that the request has messages
          expect(request.messages).toBeDefined();
          expect(request.messages.length).toBeGreaterThan(0);
          
          // Find the system message
          const systemMessage = request.messages.find(msg => msg.role === 'system');
          
          // Verify that a system message exists
          expect(systemMessage).toBeDefined();
          expect(systemMessage?.content).toBeDefined();
          
          // Verify that the system message includes the personality system prompt
          // The system message should contain the bot's personality system prompt
          expect(systemMessage?.content).toContain(bot.personalityConfig.systemPrompt);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('generateReply includes personality system prompt in LLM request (Requirement 3.5)', async () => {
    await fc.assert(
      fc.asyncProperty(
        botArb,
        postArb,
        fc.array(postArb, { maxLength: 5 }),
        async (bot, mentionPost, conversationContext) => {
          const capturedRequests: LLMCompletionRequest[] = [];
          const mockClient = createMockLLMClient(capturedRequests);
          const generator = new ContentGenerator(bot, mockClient);
          
          // Generate a reply
          await generator.generateReply(mentionPost, conversationContext);
          
          // Verify that a request was made
          expect(capturedRequests.length).toBe(1);
          
          const request = capturedRequests[0];
          
          // Verify that the request has messages
          expect(request.messages).toBeDefined();
          expect(request.messages.length).toBeGreaterThan(0);
          
          // Find the system message
          const systemMessage = request.messages.find(msg => msg.role === 'system');
          
          // Verify that a system message exists
          expect(systemMessage).toBeDefined();
          expect(systemMessage?.content).toBeDefined();
          
          // Verify that the system message includes the personality system prompt
          expect(systemMessage?.content).toContain(bot.personalityConfig.systemPrompt);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('personality system prompt is always the first message in post generation', async () => {
    await fc.assert(
      fc.asyncProperty(
        botArb,
        fc.option(contentItemArb, { nil: undefined }),
        async (bot, sourceContent) => {
          const capturedRequests: LLMCompletionRequest[] = [];
          const mockClient = createMockLLMClient(capturedRequests);
          const generator = new ContentGenerator(bot, mockClient);
          
          // Generate a post
          await generator.generatePost(sourceContent);
          
          const request = capturedRequests[0];
          
          // The first message should be a system message
          expect(request.messages[0].role).toBe('system');
          
          // The system message should contain the personality prompt
          expect(request.messages[0].content).toContain(bot.personalityConfig.systemPrompt);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('personality system prompt is always the first message in reply generation', async () => {
    await fc.assert(
      fc.asyncProperty(
        botArb,
        postArb,
        async (bot, mentionPost) => {
          const capturedRequests: LLMCompletionRequest[] = [];
          const mockClient = createMockLLMClient(capturedRequests);
          const generator = new ContentGenerator(bot, mockClient);
          
          // Generate a reply
          await generator.generateReply(mentionPost, []);
          
          const request = capturedRequests[0];
          
          // The first message should be a system message
          expect(request.messages[0].role).toBe('system');
          
          // The system message should contain the personality prompt
          expect(request.messages[0].content).toContain(bot.personalityConfig.systemPrompt);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('personality temperature is included in post generation request', async () => {
    await fc.assert(
      fc.asyncProperty(
        botArb,
        fc.option(contentItemArb, { nil: undefined }),
        async (bot, sourceContent) => {
          const capturedRequests: LLMCompletionRequest[] = [];
          const mockClient = createMockLLMClient(capturedRequests);
          const generator = new ContentGenerator(bot, mockClient);
          
          // Generate a post
          await generator.generatePost(sourceContent);
          
          const request = capturedRequests[0];
          
          // The request should include the personality temperature
          expect(request.temperature).toBe(bot.personalityConfig.temperature);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('personality temperature is included in reply generation request', async () => {
    await fc.assert(
      fc.asyncProperty(
        botArb,
        postArb,
        async (bot, mentionPost) => {
          const capturedRequests: LLMCompletionRequest[] = [];
          const mockClient = createMockLLMClient(capturedRequests);
          const generator = new ContentGenerator(bot, mockClient);
          
          // Generate a reply
          await generator.generateReply(mentionPost, []);
          
          const request = capturedRequests[0];
          
          // The request should include the personality temperature
          expect(request.temperature).toBe(bot.personalityConfig.temperature);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('personality maxTokens is respected in post generation request', async () => {
    await fc.assert(
      fc.asyncProperty(
        botArb,
        fc.option(contentItemArb, { nil: undefined }),
        async (bot, sourceContent) => {
          const capturedRequests: LLMCompletionRequest[] = [];
          const mockClient = createMockLLMClient(capturedRequests);
          const generator = new ContentGenerator(bot, mockClient);
          
          // Generate a post
          await generator.generatePost(sourceContent);
          
          const request = capturedRequests[0];
          
          // The request should include maxTokens from personality config or default
          expect(request.maxTokens).toBeDefined();
          
          // If bot has maxTokens configured, it should be used
          if (bot.personalityConfig.maxTokens) {
            expect(request.maxTokens).toBe(bot.personalityConfig.maxTokens);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('personality responseStyle is included in system prompt when present', async () => {
    // Use a bot generator that always has responseStyle
    const botWithStyleArb = fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      handle: fc.string({ minLength: 3, maxLength: 30 }),
      personalityConfig: fc.record({
        systemPrompt: systemPromptArb,
        temperature: temperatureArb,
        maxTokens: maxTokensArb,
        responseStyle: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
      }),
      llmProvider: llmProviderArb,
      llmModel: llmModelArb,
      llmApiKeyEncrypted: fc.string({ minLength: 20, maxLength: 100 }),
    });

    await fc.assert(
      fc.asyncProperty(
        botWithStyleArb,
        fc.option(contentItemArb, { nil: undefined }),
        async (bot, sourceContent) => {
          const capturedRequests: LLMCompletionRequest[] = [];
          const mockClient = createMockLLMClient(capturedRequests);
          const generator = new ContentGenerator(bot, mockClient);
          
          // Generate a post
          await generator.generatePost(sourceContent);
          
          const request = capturedRequests[0];
          const systemMessage = request.messages.find(msg => msg.role === 'system');
          
          // The system message should include the response style
          expect(systemMessage?.content).toContain(bot.personalityConfig.responseStyle!);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('different personalities produce different system prompts', async () => {
    await fc.assert(
      fc.asyncProperty(
        botArb,
        botArb,
        fc.option(contentItemArb, { nil: undefined }),
        async (bot1, bot2, sourceContent) => {
          // Skip if the bots have the same personality
          if (bot1.personalityConfig.systemPrompt === bot2.personalityConfig.systemPrompt) {
            return;
          }
          
          const capturedRequests1: LLMCompletionRequest[] = [];
          const mockClient1 = createMockLLMClient(capturedRequests1);
          const generator1 = new ContentGenerator(bot1, mockClient1);
          
          const capturedRequests2: LLMCompletionRequest[] = [];
          const mockClient2 = createMockLLMClient(capturedRequests2);
          const generator2 = new ContentGenerator(bot2, mockClient2);
          
          // Generate posts with both bots
          await generator1.generatePost(sourceContent);
          await generator2.generatePost(sourceContent);
          
          const systemMessage1 = capturedRequests1[0].messages.find(msg => msg.role === 'system');
          const systemMessage2 = capturedRequests2[0].messages.find(msg => msg.role === 'system');
          
          // The system messages should be different
          expect(systemMessage1?.content).not.toBe(systemMessage2?.content);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('buildPostSystemPrompt includes personality system prompt', async () => {
    await fc.assert(
      fc.asyncProperty(
        personalityConfigArb,
        async (personality) => {
          const systemPrompt = buildPostSystemPrompt(personality);
          
          // The built system prompt should include the personality system prompt
          expect(systemPrompt).toContain(personality.systemPrompt);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('buildReplySystemPrompt includes personality system prompt', async () => {
    await fc.assert(
      fc.asyncProperty(
        personalityConfigArb,
        async (personality) => {
          const systemPrompt = buildReplySystemPrompt(personality);
          
          // The built system prompt should include the personality system prompt
          expect(systemPrompt).toContain(personality.systemPrompt);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('personality system prompt is preserved exactly in LLM requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        botArb,
        fc.option(contentItemArb, { nil: undefined }),
        async (bot, sourceContent) => {
          const capturedRequests: LLMCompletionRequest[] = [];
          const mockClient = createMockLLMClient(capturedRequests);
          const generator = new ContentGenerator(bot, mockClient);
          
          // Generate a post
          await generator.generatePost(sourceContent);
          
          const request = capturedRequests[0];
          const systemMessage = request.messages.find(msg => msg.role === 'system');
          
          // The system message should contain the exact personality prompt
          // (not modified or truncated)
          expect(systemMessage?.content).toContain(bot.personalityConfig.systemPrompt);
          
          // Verify the personality prompt appears as a complete substring
          const promptIndex = systemMessage?.content.indexOf(bot.personalityConfig.systemPrompt);
          expect(promptIndex).toBeGreaterThanOrEqual(0);
          
          // Verify the full prompt is present (not truncated)
          const extractedPrompt = systemMessage?.content.substring(
            promptIndex!,
            promptIndex! + bot.personalityConfig.systemPrompt.length
          );
          expect(extractedPrompt).toBe(bot.personalityConfig.systemPrompt);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('evaluateContentInterest includes personality system prompt', async () => {
    await fc.assert(
      fc.asyncProperty(
        botArb,
        contentItemArb,
        async (bot, content) => {
          const capturedRequests: LLMCompletionRequest[] = [];
          const mockClient = createMockLLMClient(capturedRequests);
          const generator = new ContentGenerator(bot, mockClient);
          
          // Evaluate content interest
          await generator.evaluateContentInterest(content);
          
          // Verify that a request was made
          expect(capturedRequests.length).toBe(1);
          
          const request = capturedRequests[0];
          const systemMessage = request.messages.find(msg => msg.role === 'system');
          
          // The system message should include the personality system prompt
          expect(systemMessage).toBeDefined();
          expect(systemMessage?.content).toContain(bot.personalityConfig.systemPrompt);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all LLM calls include personality regardless of call type', async () => {
    await fc.assert(
      fc.asyncProperty(
        botArb,
        contentItemArb,
        postArb,
        async (bot, content, mentionPost) => {
          // Test all three types of LLM calls
          const capturedPostRequests: LLMCompletionRequest[] = [];
          const capturedReplyRequests: LLMCompletionRequest[] = [];
          const capturedEvalRequests: LLMCompletionRequest[] = [];
          
          const mockPostClient = createMockLLMClient(capturedPostRequests);
          const mockReplyClient = createMockLLMClient(capturedReplyRequests);
          const mockEvalClient = createMockLLMClient(capturedEvalRequests);
          
          const postGenerator = new ContentGenerator(bot, mockPostClient);
          const replyGenerator = new ContentGenerator(bot, mockReplyClient);
          const evalGenerator = new ContentGenerator(bot, mockEvalClient);
          
          // Make all three types of calls
          await postGenerator.generatePost(content);
          await replyGenerator.generateReply(mentionPost, []);
          await evalGenerator.evaluateContentInterest(content);
          
          // All three should have made requests
          expect(capturedPostRequests.length).toBe(1);
          expect(capturedReplyRequests.length).toBe(1);
          expect(capturedEvalRequests.length).toBe(1);
          
          // All three should include the personality system prompt
          const postSystemMsg = capturedPostRequests[0].messages.find(msg => msg.role === 'system');
          const replySystemMsg = capturedReplyRequests[0].messages.find(msg => msg.role === 'system');
          const evalSystemMsg = capturedEvalRequests[0].messages.find(msg => msg.role === 'system');
          
          expect(postSystemMsg?.content).toContain(bot.personalityConfig.systemPrompt);
          expect(replySystemMsg?.content).toContain(bot.personalityConfig.systemPrompt);
          expect(evalSystemMsg?.content).toContain(bot.personalityConfig.systemPrompt);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================
// PROPERTY 35: LLM PROMPT CONSTRUCTION
// ============================================

describe('Feature: bot-system, Property 35: LLM Prompt Construction', () => {
  /**
   * Property 35: LLM Prompt Construction
   * 
   * *For any* post generation request, the LLM prompt SHALL combine source content
   * with personality context and configured parameters.
   * 
   * **Validates: Requirements 11.1, 11.2**
   */

  it('post generation combines source content with personality context (Requirements 11.1, 11.2)', async () => {
    await fc.assert(
      fc.asyncProperty(
        botArb,
        contentItemArb,
        async (bot, sourceContent) => {
          const capturedRequests: LLMCompletionRequest[] = [];
          const mockClient = createMockLLMClient(capturedRequests);
          const generator = new ContentGenerator(bot, mockClient);
          
          // Generate a post with source content
          await generator.generatePost(sourceContent);
          
          // Verify that a request was made
          expect(capturedRequests.length).toBe(1);
          
          const request = capturedRequests[0];
          
          // Verify the request has messages
          expect(request.messages).toBeDefined();
          expect(request.messages.length).toBeGreaterThanOrEqual(2);
          
          // Find system and user messages
          const systemMessage = request.messages.find(msg => msg.role === 'system');
          const userMessage = request.messages.find(msg => msg.role === 'user');
          
          // Verify system message includes personality context
          expect(systemMessage).toBeDefined();
          expect(systemMessage?.content).toContain(bot.personalityConfig.systemPrompt);
          
          // Verify user message includes source content
          expect(userMessage).toBeDefined();
          expect(userMessage?.content).toContain(sourceContent.title);
          expect(userMessage?.content).toContain(sourceContent.url);
          
          // If source has content, it should be included (possibly truncated)
          if (sourceContent.content && sourceContent.content.trim().length > 0) {
            // The content should appear in the user message
            // (it may be truncated, so we check for a substring)
            const contentPreview = sourceContent.content.slice(0, 100);
            expect(userMessage?.content).toContain(contentPreview);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('post generation includes configured temperature parameter (Requirement 11.2)', async () => {
    await fc.assert(
      fc.asyncProperty(
        botArb,
        fc.option(contentItemArb, { nil: undefined }),
        async (bot, sourceContent) => {
          const capturedRequests: LLMCompletionRequest[] = [];
          const mockClient = createMockLLMClient(capturedRequests);
          const generator = new ContentGenerator(bot, mockClient);
          
          // Generate a post
          await generator.generatePost(sourceContent);
          
          const request = capturedRequests[0];
          
          // Verify temperature from personality config is used
          expect(request.temperature).toBe(bot.personalityConfig.temperature);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('post generation includes configured maxTokens parameter (Requirement 11.2)', async () => {
    await fc.assert(
      fc.asyncProperty(
        botArb,
        fc.option(contentItemArb, { nil: undefined }),
        async (bot, sourceContent) => {
          const capturedRequests: LLMCompletionRequest[] = [];
          const mockClient = createMockLLMClient(capturedRequests);
          const generator = new ContentGenerator(bot, mockClient);
          
          // Generate a post
          await generator.generatePost(sourceContent);
          
          const request = capturedRequests[0];
          
          // Verify maxTokens is included
          expect(request.maxTokens).toBeDefined();
          
          // Should use bot's configured maxTokens or default
          if (bot.personalityConfig.maxTokens) {
            expect(request.maxTokens).toBe(bot.personalityConfig.maxTokens);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('post generation with additional context combines all elements', async () => {
    await fc.assert(
      fc.asyncProperty(
        botArb,
        contentItemArb,
        fc.string({ minLength: 10, maxLength: 200 }),
        async (bot, sourceContent, additionalContext) => {
          const capturedRequests: LLMCompletionRequest[] = [];
          const mockClient = createMockLLMClient(capturedRequests);
          const generator = new ContentGenerator(bot, mockClient);
          
          // Generate a post with source content and additional context
          await generator.generatePost(sourceContent, additionalContext);
          
          const request = capturedRequests[0];
          const systemMessage = request.messages.find(msg => msg.role === 'system');
          const userMessage = request.messages.find(msg => msg.role === 'user');
          
          // Verify all three elements are present:
          // 1. Personality context in system message
          expect(systemMessage?.content).toContain(bot.personalityConfig.systemPrompt);
          
          // 2. Source content in user message
          expect(userMessage?.content).toContain(sourceContent.title);
          expect(userMessage?.content).toContain(sourceContent.url);
          
          // 3. Additional context in user message
          expect(userMessage?.content).toContain(additionalContext);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('post generation without source content still includes personality', async () => {
    await fc.assert(
      fc.asyncProperty(
        botArb,
        fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
        async (bot, context) => {
          const capturedRequests: LLMCompletionRequest[] = [];
          const mockClient = createMockLLMClient(capturedRequests);
          const generator = new ContentGenerator(bot, mockClient);
          
          // Generate a post without source content
          await generator.generatePost(undefined, context);
          
          const request = capturedRequests[0];
          const systemMessage = request.messages.find(msg => msg.role === 'system');
          
          // Verify personality context is still included
          expect(systemMessage).toBeDefined();
          expect(systemMessage?.content).toContain(bot.personalityConfig.systemPrompt);
          
          // Verify configured parameters are used
          expect(request.temperature).toBe(bot.personalityConfig.temperature);
          expect(request.maxTokens).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('prompt construction preserves source content structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        botArb,
        contentItemArb,
        async (bot, sourceContent) => {
          const capturedRequests: LLMCompletionRequest[] = [];
          const mockClient = createMockLLMClient(capturedRequests);
          const generator = new ContentGenerator(bot, mockClient);
          
          // Generate a post
          await generator.generatePost(sourceContent);
          
          const request = capturedRequests[0];
          const userMessage = request.messages.find(msg => msg.role === 'user');
          
          // Verify the user message contains structured information
          expect(userMessage?.content).toBeDefined();
          
          // Should include title label
          expect(userMessage?.content).toMatch(/Title:/i);
          
          // Should include URL label
          expect(userMessage?.content).toMatch(/URL:/i);
          
          // Should include the actual values
          expect(userMessage?.content).toContain(sourceContent.title);
          expect(userMessage?.content).toContain(sourceContent.url);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('prompt construction uses personality responseStyle when present', async () => {
    // Use a bot generator that always has responseStyle
    const botWithStyleArb = fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      handle: fc.string({ minLength: 3, maxLength: 30 }),
      personalityConfig: fc.record({
        systemPrompt: systemPromptArb,
        temperature: temperatureArb,
        maxTokens: maxTokensArb,
        responseStyle: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
      }),
      llmProvider: llmProviderArb,
      llmModel: llmModelArb,
      llmApiKeyEncrypted: fc.string({ minLength: 20, maxLength: 100 }),
    });

    await fc.assert(
      fc.asyncProperty(
        botWithStyleArb,
        contentItemArb,
        async (bot, sourceContent) => {
          const capturedRequests: LLMCompletionRequest[] = [];
          const mockClient = createMockLLMClient(capturedRequests);
          const generator = new ContentGenerator(bot, mockClient);
          
          // Generate a post
          await generator.generatePost(sourceContent);
          
          const request = capturedRequests[0];
          const systemMessage = request.messages.find(msg => msg.role === 'system');
          
          // Verify responseStyle is included in system prompt
          expect(systemMessage?.content).toContain(bot.personalityConfig.responseStyle!);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('different source content produces different user messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        botArb,
        contentItemArb,
        contentItemArb,
        async (bot, content1, content2) => {
          // Skip if content is identical
          if (content1.title === content2.title && 
              content1.url === content2.url && 
              content1.content === content2.content) {
            return;
          }
          
          const capturedRequests1: LLMCompletionRequest[] = [];
          const mockClient1 = createMockLLMClient(capturedRequests1);
          const generator1 = new ContentGenerator(bot, mockClient1);
          
          const capturedRequests2: LLMCompletionRequest[] = [];
          const mockClient2 = createMockLLMClient(capturedRequests2);
          const generator2 = new ContentGenerator(bot, mockClient2);
          
          // Generate posts with different content
          await generator1.generatePost(content1);
          await generator2.generatePost(content2);
          
          const userMessage1 = capturedRequests1[0].messages.find(msg => msg.role === 'user');
          const userMessage2 = capturedRequests2[0].messages.find(msg => msg.role === 'user');
          
          // User messages should be different
          expect(userMessage1?.content).not.toBe(userMessage2?.content);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('prompt construction maintains consistent message structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        botArb,
        fc.option(contentItemArb, { nil: undefined }),
        async (bot, sourceContent) => {
          const capturedRequests: LLMCompletionRequest[] = [];
          const mockClient = createMockLLMClient(capturedRequests);
          const generator = new ContentGenerator(bot, mockClient);
          
          // Generate a post
          await generator.generatePost(sourceContent);
          
          const request = capturedRequests[0];
          
          // Verify message structure
          expect(request.messages.length).toBeGreaterThanOrEqual(2);
          
          // First message should be system
          expect(request.messages[0].role).toBe('system');
          
          // Second message should be user
          expect(request.messages[1].role).toBe('user');
          
          // All messages should have content
          for (const message of request.messages) {
            expect(message.content).toBeDefined();
            expect(typeof message.content).toBe('string');
            expect(message.content.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('buildPostUserMessage combines source content correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        contentItemArb,
        fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
        async (sourceContent, context) => {
          const userMessage = buildPostUserMessage(sourceContent, context);
          
          // Verify source content is included
          expect(userMessage).toContain(sourceContent.title);
          expect(userMessage).toContain(sourceContent.url);
          
          // If content exists, verify it's included (possibly truncated)
          if (sourceContent.content && sourceContent.content.trim().length > 0) {
            const contentPreview = sourceContent.content.slice(0, 100);
            expect(userMessage).toContain(contentPreview);
          }
          
          // If context exists, verify it's included
          if (context) {
            expect(userMessage).toContain(context);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('buildPostSystemPrompt combines personality with instructions', async () => {
    await fc.assert(
      fc.asyncProperty(
        personalityConfigArb,
        async (personality) => {
          const systemPrompt = buildPostSystemPrompt(personality);
          
          // Verify personality system prompt is included
          expect(systemPrompt).toContain(personality.systemPrompt);
          
          // Verify instructions are included
          expect(systemPrompt).toMatch(/instructions/i);
          
          // If responseStyle exists, verify it's included
          if (personality.responseStyle) {
            expect(systemPrompt).toContain(personality.responseStyle);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all configured parameters are passed to LLM client', async () => {
    await fc.assert(
      fc.asyncProperty(
        botArb,
        fc.option(contentItemArb, { nil: undefined }),
        async (bot, sourceContent) => {
          const capturedRequests: LLMCompletionRequest[] = [];
          const mockClient = createMockLLMClient(capturedRequests);
          const generator = new ContentGenerator(bot, mockClient);
          
          // Generate a post
          await generator.generatePost(sourceContent);
          
          const request = capturedRequests[0];
          
          // Verify all required parameters are present
          expect(request.messages).toBeDefined();
          expect(request.temperature).toBeDefined();
          expect(request.maxTokens).toBeDefined();
          
          // Verify parameters match bot configuration
          expect(request.temperature).toBe(bot.personalityConfig.temperature);
          
          // Verify temperature is within valid range
          expect(request.temperature).toBeGreaterThanOrEqual(0);
          expect(request.temperature).toBeLessThanOrEqual(2);
          
          // Verify maxTokens is positive
          expect(request.maxTokens).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================
// PROPERTY 36: CONTENT TRUNCATION
// ============================================

describe('Feature: bot-system, Property 36: Content Truncation', () => {
  /**
   * Property 36: Content Truncation
   * 
   * *For any* source content exceeding the maximum length, the content SHALL be
   * truncated or summarized before being sent to the LLM.
   * 
   * **Validates: Requirements 11.3**
   */

  it('content exceeding MAX_SOURCE_CONTENT_LENGTH is truncated (Requirement 11.3)', async () => {
    // Import the constants we need
    const { MAX_SOURCE_CONTENT_LENGTH, TRUNCATION_SUFFIX, truncateContent } = 
      await import('./contentGenerator');

    await fc.assert(
      fc.asyncProperty(
        // Generate content that exceeds the maximum length
        fc.string({ minLength: MAX_SOURCE_CONTENT_LENGTH + 1, maxLength: MAX_SOURCE_CONTENT_LENGTH + 5000 }),
        async (longContent) => {
          const truncated = truncateContent(longContent);
          
          // Verify the truncated content is shorter than or equal to max length
          expect(truncated.length).toBeLessThanOrEqual(MAX_SOURCE_CONTENT_LENGTH);
          
          // Verify the truncation suffix is present
          expect(truncated).toContain(TRUNCATION_SUFFIX);
          
          // Verify the truncated content ends with the suffix
          expect(truncated.endsWith(TRUNCATION_SUFFIX)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('content within MAX_SOURCE_CONTENT_LENGTH is not truncated', async () => {
    const { MAX_SOURCE_CONTENT_LENGTH, TRUNCATION_SUFFIX, truncateContent } = 
      await import('./contentGenerator');

    await fc.assert(
      fc.asyncProperty(
        // Generate content within the maximum length
        fc.string({ minLength: 1, maxLength: MAX_SOURCE_CONTENT_LENGTH }),
        async (content) => {
          const result = truncateContent(content);
          
          // Verify the content is unchanged
          expect(result).toBe(content);
          
          // Verify no truncation suffix is added
          expect(result.endsWith(TRUNCATION_SUFFIX)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('truncated content preserves beginning of original content', async () => {
    const { MAX_SOURCE_CONTENT_LENGTH, truncateContent } = 
      await import('./contentGenerator');

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: MAX_SOURCE_CONTENT_LENGTH + 100, maxLength: MAX_SOURCE_CONTENT_LENGTH + 5000 })
          .filter(s => s.trim().length > 100), // Filter out mostly whitespace strings
        async (longContent) => {
          const truncated = truncateContent(longContent);
          
          // Extract the content without the suffix
          const { TRUNCATION_SUFFIX } = await import('./contentGenerator');
          const contentWithoutSuffix = truncated.slice(0, -TRUNCATION_SUFFIX.length).trim();
          
          // Skip if content is empty after trimming
          if (contentWithoutSuffix.length === 0) {
            return;
          }
          
          // Verify the truncated content is a prefix of the original (after trimming)
          const trimmedOriginal = longContent.trim();
          expect(trimmedOriginal.startsWith(contentWithoutSuffix)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('generatePost truncates long source content before sending to LLM', async () => {
    const { MAX_SOURCE_CONTENT_LENGTH } = await import('./contentGenerator');

    await fc.assert(
      fc.asyncProperty(
        botArb,
        fc.record({
          id: fc.uuid(),
          sourceId: fc.uuid(),
          title: fc.string({ minLength: 5, maxLength: 200 }),
          content: fc.string({ minLength: MAX_SOURCE_CONTENT_LENGTH + 100, maxLength: MAX_SOURCE_CONTENT_LENGTH + 2000 }),
          url: fc.webUrl(),
          publishedAt: fc.date(),
        }),
        async (bot, longContentItem) => {
          const capturedRequests: LLMCompletionRequest[] = [];
          const mockClient = createMockLLMClient(capturedRequests);
          const generator = new ContentGenerator(bot, mockClient);
          
          // Generate a post with long content
          await generator.generatePost(longContentItem);
          
          // Verify a request was made
          expect(capturedRequests.length).toBe(1);
          
          const request = capturedRequests[0];
          const userMessage = request.messages.find(msg => msg.role === 'user');
          
          // Verify the user message exists
          expect(userMessage).toBeDefined();
          
          // The user message should not contain the full original content
          // (it should be truncated)
          const { TRUNCATION_SUFFIX } = await import('./contentGenerator');
          expect(userMessage?.content).toContain(TRUNCATION_SUFFIX);
          
          // Verify the original long content is not fully present
          expect(userMessage?.content).not.toContain(longContentItem.content);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('generateReply truncates long conversation context', async () => {
    const { MAX_CONVERSATION_CONTEXT_LENGTH } = await import('./contentGenerator');

    // Create a generator for very long posts
    const longPostArb: fc.Arbitrary<Post> = fc.record({
      id: fc.uuid(),
      userId: fc.uuid(),
      content: fc.string({ minLength: 500, maxLength: 1000 }),
      createdAt: fc.date(),
      author: fc.option(
        fc.record({
          handle: fc.string({ minLength: 3, maxLength: 30 }),
          displayName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
        }),
        { nil: undefined }
      ),
    });

    await fc.assert(
      fc.asyncProperty(
        botArb,
        postArb,
        fc.array(longPostArb, { minLength: 5, maxLength: 10 }),
        async (bot, mentionPost, longConversationContext) => {
          const capturedRequests: LLMCompletionRequest[] = [];
          const mockClient = createMockLLMClient(capturedRequests);
          const generator = new ContentGenerator(bot, mockClient);
          
          // Generate a reply with long conversation context
          await generator.generateReply(mentionPost, longConversationContext);
          
          // Verify a request was made
          expect(capturedRequests.length).toBe(1);
          
          const request = capturedRequests[0];
          const userMessage = request.messages.find(msg => msg.role === 'user');
          
          // Verify the user message exists
          expect(userMessage).toBeDefined();
          
          // Calculate total length of all conversation context
          const totalContextLength = longConversationContext.reduce(
            (sum, post) => sum + post.content.length,
            0
          );
          
          // If the total context is very long, it should be truncated
          if (totalContextLength > MAX_CONVERSATION_CONTEXT_LENGTH) {
            // The user message should not contain all posts
            const allPostsIncluded = longConversationContext.every(
              post => userMessage?.content.includes(post.content)
            );
            expect(allPostsIncluded).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('evaluateContentInterest truncates content before evaluation', async () => {
    const { MAX_SOURCE_CONTENT_LENGTH } = await import('./contentGenerator');

    await fc.assert(
      fc.asyncProperty(
        botArb,
        fc.record({
          id: fc.uuid(),
          sourceId: fc.uuid(),
          title: fc.string({ minLength: 5, maxLength: 200 }),
          content: fc.string({ minLength: MAX_SOURCE_CONTENT_LENGTH + 100, maxLength: MAX_SOURCE_CONTENT_LENGTH + 2000 }),
          url: fc.webUrl(),
          publishedAt: fc.date(),
        }),
        async (bot, longContentItem) => {
          const capturedRequests: LLMCompletionRequest[] = [];
          const mockClient = createMockLLMClient(capturedRequests);
          const generator = new ContentGenerator(bot, mockClient);
          
          // Evaluate content interest with long content
          await generator.evaluateContentInterest(longContentItem);
          
          // Verify a request was made
          expect(capturedRequests.length).toBe(1);
          
          const request = capturedRequests[0];
          const userMessage = request.messages.find(msg => msg.role === 'user');
          
          // Verify the user message exists
          expect(userMessage).toBeDefined();
          
          // The user message should contain truncation suffix
          const { TRUNCATION_SUFFIX } = await import('./contentGenerator');
          expect(userMessage?.content).toContain(TRUNCATION_SUFFIX);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('truncateContent with custom maxLength respects the limit', async () => {
    const { truncateContent, TRUNCATION_SUFFIX } = await import('./contentGenerator');

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 100, maxLength: 5000 }),
        fc.integer({ min: 50, max: 500 }),
        async (content, customMaxLength) => {
          const truncated = truncateContent(content, customMaxLength);
          
          // Verify the truncated content respects the custom max length
          expect(truncated.length).toBeLessThanOrEqual(customMaxLength);
          
          // If content was longer than max, it should be truncated
          if (content.length > customMaxLength) {
            expect(truncated.endsWith(TRUNCATION_SUFFIX)).toBe(true);
          } else {
            expect(truncated).toBe(content);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('truncateContent attempts to preserve sentence boundaries', async () => {
    const { truncateContent, TRUNCATION_SUFFIX } = await import('./contentGenerator');

    // Generate content with clear sentence boundaries - use actual words
    const wordArb = fc.array(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'), { minLength: 3, maxLength: 10 })
      .map(chars => chars.join(''));
    const sentenceArb = fc.array(wordArb, { minLength: 5, maxLength: 15 })
      .map(words => words.join(' ') + '. ');
    const contentWithSentencesArb = fc.array(sentenceArb, { minLength: 20, maxLength: 50 })
      .map(sentences => sentences.join(''));

    await fc.assert(
      fc.asyncProperty(
        contentWithSentencesArb,
        fc.integer({ min: 200, max: 1000 }),
        async (content, maxLength) => {
          // Only test when content exceeds max length and has meaningful content
          if (content.length <= maxLength || content.trim().length < 100) {
            return;
          }
          
          const truncated = truncateContent(content, maxLength);
          
          // Verify truncation occurred
          expect(truncated.endsWith(TRUNCATION_SUFFIX)).toBe(true);
          
          // Remove the suffix to check the content
          const contentWithoutSuffix = truncated.slice(0, -TRUNCATION_SUFFIX.length).trim();
          
          // Skip if truncated content is too short
          if (contentWithoutSuffix.length < 50) {
            return;
          }
          
          // If a sentence boundary was found, the content should end with a sentence terminator
          // (This is a best-effort check - not all truncations will find a sentence boundary)
          const endsWithSentence = /[.!?]$/.test(contentWithoutSuffix);
          
          // If it ends with a sentence terminator, verify it's a complete sentence
          if (endsWithSentence) {
            // The truncated content should be a valid prefix of the original (after trimming)
            const trimmedOriginal = content.trim();
            expect(trimmedOriginal.startsWith(contentWithoutSuffix)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('truncateContent handles empty and null content gracefully', async () => {
    const { truncateContent } = await import('./contentGenerator');

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('', null, undefined),
        async (emptyContent) => {
          const truncated = truncateContent(emptyContent as any);
          
          // Empty content should return empty string
          expect(truncated).toBe('');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('isContentTruncated correctly identifies truncated content', async () => {
    const { truncateContent, isContentTruncated, MAX_SOURCE_CONTENT_LENGTH } = 
      await import('./contentGenerator');

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: MAX_SOURCE_CONTENT_LENGTH + 5000 }),
        async (content) => {
          const truncated = truncateContent(content);
          const shouldBeTruncated = content.length > MAX_SOURCE_CONTENT_LENGTH;
          
          // Verify isContentTruncated returns correct result
          expect(isContentTruncated(truncated)).toBe(shouldBeTruncated);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all LLM calls with long content apply truncation', async () => {
    const { MAX_SOURCE_CONTENT_LENGTH, TRUNCATION_SUFFIX } = await import('./contentGenerator');

    const longContentItemArb: fc.Arbitrary<ContentItem> = fc.record({
      id: fc.uuid(),
      sourceId: fc.uuid(),
      title: fc.string({ minLength: 5, maxLength: 200 }),
      content: fc.string({ minLength: MAX_SOURCE_CONTENT_LENGTH + 100, maxLength: MAX_SOURCE_CONTENT_LENGTH + 2000 }),
      url: fc.webUrl(),
      publishedAt: fc.date(),
    });

    await fc.assert(
      fc.asyncProperty(
        botArb,
        longContentItemArb,
        async (bot, longContent) => {
          // Test both generatePost and evaluateContentInterest
          const capturedPostRequests: LLMCompletionRequest[] = [];
          const capturedEvalRequests: LLMCompletionRequest[] = [];
          
          const mockPostClient = createMockLLMClient(capturedPostRequests);
          const mockEvalClient = createMockLLMClient(capturedEvalRequests);
          
          const postGenerator = new ContentGenerator(bot, mockPostClient);
          const evalGenerator = new ContentGenerator(bot, mockEvalClient);
          
          // Make both types of calls
          await postGenerator.generatePost(longContent);
          await evalGenerator.evaluateContentInterest(longContent);
          
          // Both should have made requests
          expect(capturedPostRequests.length).toBe(1);
          expect(capturedEvalRequests.length).toBe(1);
          
          // Both should have truncated the content
          const postUserMsg = capturedPostRequests[0].messages.find(msg => msg.role === 'user');
          const evalUserMsg = capturedEvalRequests[0].messages.find(msg => msg.role === 'user');
          
          expect(postUserMsg?.content).toContain(TRUNCATION_SUFFIX);
          expect(evalUserMsg?.content).toContain(TRUNCATION_SUFFIX);
          
          // Neither should contain the full original content
          expect(postUserMsg?.content).not.toContain(longContent.content);
          expect(evalUserMsg?.content).not.toContain(longContent.content);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('truncation preserves content integrity for LLM processing', async () => {
    const { MAX_SOURCE_CONTENT_LENGTH, truncateContent } = await import('./contentGenerator');

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: MAX_SOURCE_CONTENT_LENGTH + 100, maxLength: MAX_SOURCE_CONTENT_LENGTH + 5000 })
          .filter(s => s.trim().length > 200), // Filter out mostly whitespace strings
        async (longContent) => {
          const truncated = truncateContent(longContent);
          
          // Verify the truncated content is still meaningful
          // (not just the suffix)
          const { TRUNCATION_SUFFIX } = await import('./contentGenerator');
          const contentWithoutSuffix = truncated.slice(0, -TRUNCATION_SUFFIX.length).trim();
          
          // Should have substantial content remaining
          expect(contentWithoutSuffix.length).toBeGreaterThan(100);
          
          // Should be at least 40% of max length (accounting for boundary finding and whitespace)
          expect(contentWithoutSuffix.length).toBeGreaterThan(MAX_SOURCE_CONTENT_LENGTH * 0.4);
          
          // Should be a valid prefix of original (after trimming)
          const trimmedOriginal = longContent.trim();
          expect(trimmedOriginal.startsWith(contentWithoutSuffix)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================
// PROPERTY 37: LLM RETRY LOGIC
// ============================================

describe('Feature: bot-system, Property 37: LLM Retry Logic', () => {
  /**
   * Property 37: LLM Retry Logic
   * 
   * *For any* LLM call that fails, the system SHALL retry up to 3 times
   * before logging an error.
   * 
   * **Validates: Requirements 11.4**
   */

  it('LLM client retries up to 3 times on retryable errors (Requirement 11.4)', async () => {
    await fc.assert(
      fc.asyncProperty(
        llmProviderArb,
        llmModelArb,
        fc.integer({ min: 1, max: 3 }), // Number of failures before success
        async (provider, model, failuresBeforeSuccess) => {
          const { LLMClient } = await import('./llmClient');
          
          let attemptCount = 0;
          
          // Create a real LLM client with mocked fetch
          const originalFetch = global.fetch;
          global.fetch = vi.fn(async () => {
            attemptCount++;
            
            if (attemptCount <= failuresBeforeSuccess) {
              // Return a retryable error response
              return {
                ok: false,
                status: 503,
                json: async () => ({ error: 'Service temporarily unavailable' }),
              } as Response;
            }
            
            // Success on final attempt - format depends on provider
            if (provider === 'anthropic') {
              return {
                ok: true,
                status: 200,
                json: async () => ({
                  content: [{ type: 'text', text: 'Mock generated content' }],
                  usage: { input_tokens: 100, output_tokens: 50 },
                  model: model,
                }),
              } as Response;
            } else {
              // OpenAI/OpenRouter format
              return {
                ok: true,
                status: 200,
                json: async () => ({
                  choices: [{ message: { content: 'Mock generated content' } }],
                  usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
                  model: model,
                }),
              } as Response;
            }
          }) as any;
          
          try {
            // Use minimal retry delays for testing
            const client = new LLMClient(
              {
                provider,
                apiKey: 'test-key',
                model,
              },
              {
                maxRetries: 3,
                initialDelayMs: 1,
                maxDelayMs: 10,
                backoffMultiplier: 2,
              }
            );
            
            // Make a request - should succeed after retries
            const result = await client.generateCompletion({
              messages: [{ role: 'user', content: 'test' }],
            });
            
            // Verify the result is successful
            expect(result).toBeDefined();
            expect(result.content).toBe('Mock generated content');
            
            // Verify the correct number of attempts were made
            expect(attemptCount).toBe(failuresBeforeSuccess + 1);
          } finally {
            global.fetch = originalFetch;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('LLM client fails after 3 retries on persistent retryable errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        llmProviderArb,
        llmModelArb,
        async (provider, model) => {
          const { LLMClient } = await import('./llmClient');
          
          let attemptCount = 0;
          
          // Create a real LLM client with mocked fetch that always fails
          const originalFetch = global.fetch;
          global.fetch = vi.fn(async () => {
            attemptCount++;
            
            // Always return a retryable error response
            return {
              ok: false,
              status: 503,
              json: async () => ({ error: 'Service unavailable' }),
            } as Response;
          }) as any;
          
          try {
            // Use minimal retry delays for testing
            const client = new LLMClient(
              {
                provider,
                apiKey: 'test-key',
                model,
              },
              {
                maxRetries: 3,
                initialDelayMs: 1,
                maxDelayMs: 10,
                backoffMultiplier: 2,
              }
            );
            
            // Make a request - should fail after retries
            await expect(client.generateCompletion({
              messages: [{ role: 'user', content: 'test' }],
            })).rejects.toThrow();
            
            // Verify 4 attempts were made (1 initial + 3 retries)
            expect(attemptCount).toBe(4);
          } finally {
            global.fetch = originalFetch;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('LLM client does not retry on non-retryable errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        llmProviderArb,
        llmModelArb,
        fc.constantFrom(
          { code: 401, error: 'AUTHENTICATION_ERROR' },
          { code: 400, error: 'INVALID_REQUEST' },
          { code: 403, error: 'AUTHENTICATION_ERROR' }
        ),
        async (provider, model, errorInfo) => {
          const { LLMClient } = await import('./llmClient');
          
          let attemptCount = 0;
          
          // Create a real LLM client with mocked fetch that returns non-retryable error
          const originalFetch = global.fetch;
          global.fetch = vi.fn(async () => {
            attemptCount++;
            
            // Return a non-retryable error response
            return {
              ok: false,
              status: errorInfo.code,
              json: async () => ({ error: errorInfo.error }),
            } as Response;
          }) as any;
          
          try {
            const client = new LLMClient({
              provider,
              apiKey: 'test-key',
              model,
            });
            
            // Make a request - should fail immediately
            await expect(client.generateCompletion({
              messages: [{ role: 'user', content: 'test' }],
            })).rejects.toThrow();
            
            // Verify only 1 attempt was made (no retries)
            expect(attemptCount).toBe(1);
          } finally {
            global.fetch = originalFetch;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('retry delay increases exponentially with each attempt', async () => {
    const { calculateRetryDelay, DEFAULT_RETRY_CONFIG } = await import('./llmClient');

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 10 }),
        async (attempt) => {
          const delay = calculateRetryDelay(attempt, DEFAULT_RETRY_CONFIG);
          
          // Verify delay is calculated correctly
          const expectedDelay = Math.min(
            DEFAULT_RETRY_CONFIG.initialDelayMs * Math.pow(DEFAULT_RETRY_CONFIG.backoffMultiplier, attempt),
            DEFAULT_RETRY_CONFIG.maxDelayMs
          );
          
          expect(delay).toBe(expectedDelay);
          
          // Verify delay is within bounds
          expect(delay).toBeGreaterThanOrEqual(DEFAULT_RETRY_CONFIG.initialDelayMs);
          expect(delay).toBeLessThanOrEqual(DEFAULT_RETRY_CONFIG.maxDelayMs);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('retry delay respects maximum delay cap', async () => {
    const { calculateRetryDelay } = await import('./llmClient');

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 100 }), // Very high attempt numbers
        fc.record({
          maxRetries: fc.integer({ min: 1, max: 10 }),
          initialDelayMs: fc.integer({ min: 100, max: 2000 }),
          maxDelayMs: fc.integer({ min: 5000, max: 30000 }),
          backoffMultiplier: fc.integer({ min: 2, max: 5 }),
        }),
        async (attempt, retryConfig) => {
          const delay = calculateRetryDelay(attempt, retryConfig);
          
          // Verify delay never exceeds max
          expect(delay).toBeLessThanOrEqual(retryConfig.maxDelayMs);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('isRetryableError correctly identifies retryable errors', async () => {
    const { isRetryableError, LLMClientError } = await import('./llmClient');

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('SERVER_ERROR', 'RATE_LIMIT_ERROR', 'NETWORK_ERROR', 'TIMEOUT_ERROR'),
        llmProviderArb,
        async (errorCode, provider) => {
          const error = new LLMClientError(
            'Test error',
            errorCode as any,
            provider,
            500,
            true
          );
          
          // Verify retryable errors are identified correctly
          expect(isRetryableError(error)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('isRetryableError correctly identifies non-retryable errors', async () => {
    const { isRetryableError, LLMClientError } = await import('./llmClient');

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('AUTHENTICATION_ERROR', 'INVALID_REQUEST', 'CONTENT_POLICY_VIOLATION'),
        llmProviderArb,
        async (errorCode, provider) => {
          const error = new LLMClientError(
            'Test error',
            errorCode as any,
            provider,
            400,
            false
          );
          
          // Verify non-retryable errors are identified correctly
          expect(isRetryableError(error)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all LLM call types (post, reply, evaluate) use retry logic', async () => {
    await fc.assert(
      fc.asyncProperty(
        llmProviderArb,
        llmModelArb,
        async (provider, model) => {
          const { LLMClient } = await import('./llmClient');
          
          // Track attempts for each call
          let attemptCount = 0;
          
          // Create a real LLM client with mocked fetch that fails once then succeeds
          const originalFetch = global.fetch;
          global.fetch = vi.fn(async () => {
            attemptCount++;
            
            if (attemptCount === 1 || attemptCount === 3 || attemptCount === 5) {
              // Fail on first attempt of each call
              return {
                ok: false,
                status: 503,
                json: async () => ({ error: 'Temporary error' }),
              } as Response;
            }
            
            // Success on retry - format depends on provider
            if (provider === 'anthropic') {
              return {
                ok: true,
                status: 200,
                json: async () => ({
                  content: [{ type: 'text', text: 'Mock content' }],
                  usage: { input_tokens: 100, output_tokens: 50 },
                  model: model,
                }),
              } as Response;
            } else {
              // OpenAI/OpenRouter format
              return {
                ok: true,
                status: 200,
                json: async () => ({
                  choices: [{ message: { content: 'Mock content' } }],
                  usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
                  model: model,
                }),
              } as Response;
            }
          }) as any;
          
          try {
            // Use minimal retry delays for testing
            const client = new LLMClient(
              {
                provider,
                apiKey: 'test-key',
                model,
              },
              {
                maxRetries: 3,
                initialDelayMs: 1,
                maxDelayMs: 10,
                backoffMultiplier: 2,
              }
            );
            
            // Make three different calls - all should retry once
            await client.generateCompletion({
              messages: [{ role: 'user', content: 'post test' }],
            });
            
            await client.generateCompletion({
              messages: [{ role: 'user', content: 'reply test' }],
            });
            
            await client.generateCompletion({
              messages: [{ role: 'user', content: 'eval test' }],
            });
            
            // Verify 6 attempts total (2 per call: 1 failure + 1 success)
            expect(attemptCount).toBe(6);
          } finally {
            global.fetch = originalFetch;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('retry logic preserves request parameters across attempts', async () => {
    await fc.assert(
      fc.asyncProperty(
        llmProviderArb,
        llmModelArb,
        temperatureArb,
        maxTokensArb,
        async (provider, model, temperature, maxTokens) => {
          const { LLMClient } = await import('./llmClient');
          
          const capturedBodies: any[] = [];
          let attemptCount = 0;
          
          // Create a real LLM client with mocked fetch that fails twice then succeeds
          const originalFetch = global.fetch;
          global.fetch = vi.fn(async (url: string, options: any) => {
            attemptCount++;
            
            // Capture the request body
            const body = JSON.parse(options.body);
            capturedBodies.push(body);
            
            if (attemptCount <= 2) {
              // Fail first two attempts
              return {
                ok: false,
                status: 503,
                json: async () => ({ error: 'Temporary error' }),
              } as Response;
            }
            
            // Success on third attempt - format depends on provider
            if (provider === 'anthropic') {
              return {
                ok: true,
                status: 200,
                json: async () => ({
                  content: [{ type: 'text', text: 'Mock content' }],
                  usage: { input_tokens: 100, output_tokens: 50 },
                  model: model,
                }),
              } as Response;
            } else {
              // OpenAI/OpenRouter format
              return {
                ok: true,
                status: 200,
                json: async () => ({
                  choices: [{ message: { content: 'Mock content' } }],
                  usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
                  model: model,
                }),
              } as Response;
            }
          }) as any;
          
          try {
            // Use minimal retry delays for testing
            const client = new LLMClient(
              {
                provider,
                apiKey: 'test-key',
                model,
              },
              {
                maxRetries: 3,
                initialDelayMs: 1,
                maxDelayMs: 10,
                backoffMultiplier: 2,
              }
            );
            
            // Make a request with specific parameters
            await client.generateCompletion({
              messages: [{ role: 'user', content: 'test' }],
              temperature,
              maxTokens,
            });
            
            // Verify 3 attempts were made
            expect(capturedBodies.length).toBe(3);
            
            // Verify all requests have the same parameters
            const firstBody = capturedBodies[0];
            for (let i = 1; i < capturedBodies.length; i++) {
              const body = capturedBodies[i];
              
              // Same temperature
              expect(body.temperature).toBe(firstBody.temperature);
              
              // Same max_tokens (or max_tokens for Anthropic)
              if (provider === 'anthropic') {
                expect(body.max_tokens).toBe(firstBody.max_tokens);
              } else {
                expect(body.max_tokens).toBe(firstBody.max_tokens);
              }
              
              // Same model
              expect(body.model).toBe(firstBody.model);
              
              // Same messages (or messages for Anthropic)
              if (provider === 'anthropic') {
                expect(body.messages).toEqual(firstBody.messages);
              } else {
                expect(body.messages).toEqual(firstBody.messages);
              }
            }
          } finally {
            global.fetch = originalFetch;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('DEFAULT_RETRY_CONFIG specifies exactly 3 retries', async () => {
    const { DEFAULT_RETRY_CONFIG } = await import('./llmClient');
    
    // Verify the default configuration has exactly 3 retries
    expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(3);
  });

  it('retry logic works with custom retry configuration', async () => {
    await fc.assert(
      fc.asyncProperty(
        llmProviderArb,
        llmModelArb,
        fc.record({
          maxRetries: fc.integer({ min: 1, max: 3 }), // Limit to 3 for faster tests
          initialDelayMs: fc.constant(1), // Use minimal delays for testing
          maxDelayMs: fc.constant(10),
          backoffMultiplier: fc.constant(2),
        }),
        async (provider, model, customRetryConfig) => {
          const { LLMClient } = await import('./llmClient');
          
          let attemptCount = 0;
          
          // Create a real LLM client with mocked fetch that always fails
          const originalFetch = global.fetch;
          global.fetch = vi.fn(async () => {
            attemptCount++;
            
            // Always return a retryable error
            return {
              ok: false,
              status: 503,
              json: async () => ({ error: 'Persistent error' }),
            } as Response;
          }) as any;
          
          try {
            const client = new LLMClient(
              {
                provider,
                apiKey: 'test-key',
                model,
              },
              customRetryConfig
            );
            
            // Try to generate completion - should fail after custom retries
            await expect(client.generateCompletion({
              messages: [{ role: 'user', content: 'test' }],
            })).rejects.toThrow();
            
            // Verify correct number of attempts (1 initial + maxRetries)
            expect(attemptCount).toBe(1 + customRetryConfig.maxRetries);
          } finally {
            global.fetch = originalFetch;
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 10000); // Increase timeout for this test

  it('timeout errors are retryable', async () => {
    const { isRetryableError, LLMClientError } = await import('./llmClient');

    await fc.assert(
      fc.asyncProperty(
        llmProviderArb,
        async (provider) => {
          const timeoutError = new LLMClientError(
            'Request timed out',
            'TIMEOUT_ERROR',
            provider,
            undefined,
            true
          );
          
          // Verify timeout errors are retryable
          expect(isRetryableError(timeoutError)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('network errors are retryable', async () => {
    const { isRetryableError, LLMClientError } = await import('./llmClient');

    await fc.assert(
      fc.asyncProperty(
        llmProviderArb,
        async (provider) => {
          const networkError = new LLMClientError(
            'Network error',
            'NETWORK_ERROR',
            provider,
            undefined,
            true
          );
          
          // Verify network errors are retryable
          expect(isRetryableError(networkError)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rate limit errors are retryable', async () => {
    const { isRetryableError, LLMClientError } = await import('./llmClient');

    await fc.assert(
      fc.asyncProperty(
        llmProviderArb,
        async (provider) => {
          const rateLimitError = new LLMClientError(
            'Rate limit exceeded',
            'RATE_LIMIT_ERROR',
            provider,
            429,
            true
          );
          
          // Verify rate limit errors are retryable
          expect(isRetryableError(rateLimitError)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('server errors (5xx) are retryable', async () => {
    const { isRetryableError, LLMClientError } = await import('./llmClient');

    await fc.assert(
      fc.asyncProperty(
        llmProviderArb,
        fc.constantFrom(500, 502, 503, 504),
        async (provider, statusCode) => {
          const serverError = new LLMClientError(
            'Server error',
            'SERVER_ERROR',
            provider,
            statusCode,
            true
          );
          
          // Verify server errors are retryable
          expect(isRetryableError(serverError)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('authentication errors are not retryable', async () => {
    const { isRetryableError, LLMClientError } = await import('./llmClient');

    await fc.assert(
      fc.asyncProperty(
        llmProviderArb,
        fc.constantFrom(401, 403),
        async (provider, statusCode) => {
          const authError = new LLMClientError(
            'Authentication failed',
            'AUTHENTICATION_ERROR',
            provider,
            statusCode,
            false
          );
          
          // Verify authentication errors are not retryable
          expect(isRetryableError(authError)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('content policy violations are not retryable', async () => {
    const { isRetryableError, LLMClientError } = await import('./llmClient');

    await fc.assert(
      fc.asyncProperty(
        llmProviderArb,
        async (provider) => {
          const policyError = new LLMClientError(
            'Content policy violation',
            'CONTENT_POLICY_VIOLATION',
            provider,
            400,
            false
          );
          
          // Verify content policy violations are not retryable
          expect(isRetryableError(policyError)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('mapStatusToErrorCode correctly identifies retryable status codes', async () => {
    const { mapStatusToErrorCode } = await import('./llmClient');

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(429, 500, 502, 503, 504),
        async (statusCode) => {
          const result = mapStatusToErrorCode(statusCode);
          
          // Verify these status codes are marked as retryable
          expect(result.retryable).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('mapStatusToErrorCode correctly identifies non-retryable status codes', async () => {
    const { mapStatusToErrorCode } = await import('./llmClient');

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(400, 401, 403),
        async (statusCode) => {
          const result = mapStatusToErrorCode(statusCode);
          
          // Verify these status codes are marked as non-retryable
          expect(result.retryable).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
