/**
 * Unit Tests for LLM Client Module
 * 
 * Tests the LLM client implementation for OpenRouter, OpenAI, and Anthropic providers.
 * Includes tests for retry logic, error handling, and response parsing.
 * 
 * Requirements: 2.6, 11.4
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest';
import {
  LLMClient,
  LLMClientError,
  LLMConfig,
  LLMCompletionRequest,
  DEFAULT_RETRY_CONFIG,
  PROVIDER_ENDPOINTS,
  calculateRetryDelay,
  isRetryableError,
  mapStatusToErrorCode,
  buildOpenRouterRequest,
  buildOpenAIRequest,
  buildAnthropicRequest,
  parseOpenRouterResponse,
  parseOpenAIResponse,
  parseAnthropicResponse,
  buildHeaders,
  createLLMClient,
  validateLLMConfig,
  sleep,
} from './llmClient';
import type { LLMProvider } from './encryption';

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
// UTILITY FUNCTION TESTS
// ============================================

describe('Utility Functions', () => {
  describe('calculateRetryDelay', () => {
    it('calculates exponential backoff correctly', () => {
      const config = {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
      };
      
      expect(calculateRetryDelay(0, config)).toBe(1000);
      expect(calculateRetryDelay(1, config)).toBe(2000);
      expect(calculateRetryDelay(2, config)).toBe(4000);
      expect(calculateRetryDelay(3, config)).toBe(8000);
    });
    
    it('caps delay at maxDelayMs', () => {
      const config = {
        maxRetries: 5,
        initialDelayMs: 1000,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
      };
      
      expect(calculateRetryDelay(0, config)).toBe(1000);
      expect(calculateRetryDelay(1, config)).toBe(2000);
      expect(calculateRetryDelay(2, config)).toBe(4000);
      expect(calculateRetryDelay(3, config)).toBe(5000); // Capped
      expect(calculateRetryDelay(4, config)).toBe(5000); // Capped
    });
  });
  
  describe('isRetryableError', () => {
    it('returns true for retryable LLMClientError', () => {
      const error = new LLMClientError('Rate limit', 'RATE_LIMIT_ERROR', 'openai', 429, true);
      expect(isRetryableError(error)).toBe(true);
    });
    
    it('returns false for non-retryable LLMClientError', () => {
      const error = new LLMClientError('Auth error', 'AUTHENTICATION_ERROR', 'openai', 401, false);
      expect(isRetryableError(error)).toBe(false);
    });
    
    it('returns true for fetch TypeError', () => {
      const error = new TypeError('fetch failed');
      expect(isRetryableError(error)).toBe(true);
    });
    
    it('returns false for other errors', () => {
      const error = new Error('Some error');
      expect(isRetryableError(error)).toBe(false);
    });
  });
  
  describe('mapStatusToErrorCode', () => {
    it('maps 401 to AUTHENTICATION_ERROR (non-retryable)', () => {
      const result = mapStatusToErrorCode(401);
      expect(result.code).toBe('AUTHENTICATION_ERROR');
      expect(result.retryable).toBe(false);
    });
    
    it('maps 403 to AUTHENTICATION_ERROR (non-retryable)', () => {
      const result = mapStatusToErrorCode(403);
      expect(result.code).toBe('AUTHENTICATION_ERROR');
      expect(result.retryable).toBe(false);
    });
    
    it('maps 429 to RATE_LIMIT_ERROR (retryable)', () => {
      const result = mapStatusToErrorCode(429);
      expect(result.code).toBe('RATE_LIMIT_ERROR');
      expect(result.retryable).toBe(true);
    });
    
    it('maps 400 to INVALID_REQUEST (non-retryable)', () => {
      const result = mapStatusToErrorCode(400);
      expect(result.code).toBe('INVALID_REQUEST');
      expect(result.retryable).toBe(false);
    });
    
    it('maps 500 to SERVER_ERROR (retryable)', () => {
      const result = mapStatusToErrorCode(500);
      expect(result.code).toBe('SERVER_ERROR');
      expect(result.retryable).toBe(true);
    });
    
    it('maps 502 to SERVER_ERROR (retryable)', () => {
      const result = mapStatusToErrorCode(502);
      expect(result.code).toBe('SERVER_ERROR');
      expect(result.retryable).toBe(true);
    });
    
    it('maps 503 to SERVER_ERROR (retryable)', () => {
      const result = mapStatusToErrorCode(503);
      expect(result.code).toBe('SERVER_ERROR');
      expect(result.retryable).toBe(true);
    });
    
    it('maps unknown status to UNKNOWN_ERROR (non-retryable)', () => {
      const result = mapStatusToErrorCode(418);
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.retryable).toBe(false);
    });
  });
  
  describe('sleep', () => {
    it('delays for the specified duration', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some tolerance
    });
  });
});


// ============================================
// REQUEST BUILDING TESTS
// ============================================

describe('Request Building', () => {
  const sampleRequest: LLMCompletionRequest = {
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
    ],
    temperature: 0.8,
    maxTokens: 1000,
  };
  
  describe('buildOpenRouterRequest', () => {
    it('builds correct request body', () => {
      const result = buildOpenRouterRequest(sampleRequest, 'openai/gpt-4');
      
      expect(result.model).toBe('openai/gpt-4');
      expect(result.messages).toEqual([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' },
      ]);
      expect(result.temperature).toBe(0.8);
      expect(result.max_tokens).toBe(1000);
    });
    
    it('uses default values when not provided', () => {
      const minimalRequest: LLMCompletionRequest = {
        messages: [{ role: 'user', content: 'Hi' }],
      };
      
      const result = buildOpenRouterRequest(minimalRequest, 'openai/gpt-3.5-turbo');
      
      expect(result.temperature).toBe(0.7);
      expect(result.max_tokens).toBe(500);
    });
  });
  
  describe('buildOpenAIRequest', () => {
    it('builds correct request body', () => {
      const result = buildOpenAIRequest(sampleRequest, 'gpt-4');
      
      expect(result.model).toBe('gpt-4');
      expect(result.messages).toEqual([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' },
      ]);
      expect(result.temperature).toBe(0.8);
      expect(result.max_tokens).toBe(1000);
    });
  });
  
  describe('buildAnthropicRequest', () => {
    it('builds correct request body with system message separated', () => {
      const result = buildAnthropicRequest(sampleRequest, 'claude-3-opus-20240229');
      
      expect(result.model).toBe('claude-3-opus-20240229');
      expect(result.system).toBe('You are a helpful assistant.');
      expect(result.messages).toEqual([
        { role: 'user', content: 'Hello!' },
      ]);
      expect(result.temperature).toBe(0.8);
      expect(result.max_tokens).toBe(1000);
    });
    
    it('handles request without system message', () => {
      const requestWithoutSystem: LLMCompletionRequest = {
        messages: [
          { role: 'user', content: 'Hello!' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' },
        ],
      };
      
      const result = buildAnthropicRequest(requestWithoutSystem, 'claude-3-haiku-20240307');
      
      expect(result.system).toBeUndefined();
      expect(result.messages).toHaveLength(3);
    });
  });
});


// ============================================
// RESPONSE PARSING TESTS
// ============================================

describe('Response Parsing', () => {
  describe('parseOpenRouterResponse', () => {
    it('parses successful response correctly', () => {
      const apiResponse = {
        id: 'chatcmpl-123',
        model: 'openai/gpt-4',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hello! How can I help you today?',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18,
        },
      };
      
      const result = parseOpenRouterResponse(apiResponse, 'openai/gpt-4');
      
      expect(result.content).toBe('Hello! How can I help you today?');
      expect(result.tokensUsed.prompt).toBe(10);
      expect(result.tokensUsed.completion).toBe(8);
      expect(result.tokensUsed.total).toBe(18);
      expect(result.model).toBe('openai/gpt-4');
      expect(result.provider).toBe('openrouter');
    });
    
    it('handles missing usage data', () => {
      const apiResponse = {
        choices: [
          {
            message: {
              content: 'Response without usage',
            },
          },
        ],
      };
      
      const result = parseOpenRouterResponse(apiResponse, 'test-model');
      
      expect(result.content).toBe('Response without usage');
      expect(result.tokensUsed.prompt).toBe(0);
      expect(result.tokensUsed.completion).toBe(0);
      expect(result.tokensUsed.total).toBe(0);
    });
    
    it('handles empty choices', () => {
      const apiResponse = {
        choices: [],
        usage: { prompt_tokens: 5, completion_tokens: 0, total_tokens: 5 },
      };
      
      const result = parseOpenRouterResponse(apiResponse, 'test-model');
      
      expect(result.content).toBe('');
    });
  });
  
  describe('parseOpenAIResponse', () => {
    it('parses successful response correctly', () => {
      const apiResponse = {
        id: 'chatcmpl-456',
        model: 'gpt-4-turbo',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'I am GPT-4!',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 15,
          completion_tokens: 5,
          total_tokens: 20,
        },
      };
      
      const result = parseOpenAIResponse(apiResponse, 'gpt-4');
      
      expect(result.content).toBe('I am GPT-4!');
      expect(result.tokensUsed.prompt).toBe(15);
      expect(result.tokensUsed.completion).toBe(5);
      expect(result.tokensUsed.total).toBe(20);
      expect(result.model).toBe('gpt-4-turbo');
      expect(result.provider).toBe('openai');
    });
  });
  
  describe('parseAnthropicResponse', () => {
    it('parses successful response correctly', () => {
      const apiResponse = {
        id: 'msg_123',
        type: 'message',
        model: 'claude-3-opus-20240229',
        content: [
          {
            type: 'text',
            text: 'Hello from Claude!',
          },
        ],
        usage: {
          input_tokens: 12,
          output_tokens: 4,
        },
      };
      
      const result = parseAnthropicResponse(apiResponse, 'claude-3-opus-20240229');
      
      expect(result.content).toBe('Hello from Claude!');
      expect(result.tokensUsed.prompt).toBe(12);
      expect(result.tokensUsed.completion).toBe(4);
      expect(result.tokensUsed.total).toBe(16);
      expect(result.model).toBe('claude-3-opus-20240229');
      expect(result.provider).toBe('anthropic');
    });
    
    it('handles multiple content blocks', () => {
      const apiResponse = {
        model: 'claude-3-haiku-20240307',
        content: [
          { type: 'text', text: 'First part. ' },
          { type: 'text', text: 'Second part.' },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 6,
        },
      };
      
      const result = parseAnthropicResponse(apiResponse, 'claude-3-haiku-20240307');
      
      expect(result.content).toBe('First part. Second part.');
    });
    
    it('filters non-text content blocks', () => {
      const apiResponse = {
        model: 'claude-3-sonnet-20240229',
        content: [
          { type: 'text', text: 'Text content' },
          { type: 'tool_use', id: 'tool_1', name: 'calculator' },
        ],
        usage: {
          input_tokens: 8,
          output_tokens: 3,
        },
      };
      
      const result = parseAnthropicResponse(apiResponse, 'claude-3-sonnet-20240229');
      
      expect(result.content).toBe('Text content');
    });
  });
});


// ============================================
// HEADER BUILDING TESTS
// ============================================

describe('Header Building', () => {
  describe('buildHeaders', () => {
    it('builds correct headers for OpenRouter', () => {
      const headers = buildHeaders('openrouter', 'sk-or-test-key');
      
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Authorization']).toBe('Bearer sk-or-test-key');
      expect(headers['HTTP-Referer']).toBe('https://synapsis.social');
      expect(headers['X-Title']).toBe('Synapsis Bot');
    });
    
    it('builds correct headers for OpenAI', () => {
      const headers = buildHeaders('openai', 'sk-test-key');
      
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Authorization']).toBe('Bearer sk-test-key');
      expect(headers['HTTP-Referer']).toBeUndefined();
    });
    
    it('builds correct headers for Anthropic', () => {
      const headers = buildHeaders('anthropic', 'sk-ant-test-key');
      
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['x-api-key']).toBe('sk-ant-test-key');
      expect(headers['anthropic-version']).toBe('2023-06-01');
      expect(headers['Authorization']).toBeUndefined();
    });
  });
});

// ============================================
// VALIDATION TESTS
// ============================================

describe('Configuration Validation', () => {
  describe('validateLLMConfig', () => {
    it('validates correct configuration', () => {
      const config: LLMConfig = {
        provider: 'openai',
        apiKey: 'sk-test-key-12345678901234567890',
        model: 'gpt-4',
      };
      
      const result = validateLLMConfig(config);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('validates configuration without model', () => {
      const config = {
        provider: 'anthropic',
        apiKey: 'sk-ant-test-key-1234567890',
      };
      
      const result = validateLLMConfig(config);
      
      expect(result.valid).toBe(true);
    });
    
    it('rejects invalid provider', () => {
      const config = {
        provider: 'invalid-provider',
        apiKey: 'test-key',
      };
      
      const result = validateLLMConfig(config);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Provider must be one of: openrouter, openai, anthropic');
    });
    
    it('rejects missing API key', () => {
      const config = {
        provider: 'openai',
      };
      
      const result = validateLLMConfig(config);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('API key is required and must be a string');
    });
    
    it('rejects non-string model', () => {
      const config = {
        provider: 'openai',
        apiKey: 'test-key',
        model: 123,
      };
      
      const result = validateLLMConfig(config);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Model must be a string');
    });
    
    it('rejects non-object configuration', () => {
      const result = validateLLMConfig('not an object');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Configuration must be an object');
    });
    
    it('rejects null configuration', () => {
      const result = validateLLMConfig(null);
      
      expect(result.valid).toBe(false);
    });
  });
});


// ============================================
// LLM CLIENT TESTS
// ============================================

describe('LLMClient', () => {
  describe('constructor', () => {
    it('creates client with correct provider', () => {
      const client = new LLMClient({
        provider: 'openai',
        apiKey: 'sk-test-key-12345678901234567890',
        model: 'gpt-4',
      });
      
      expect(client.getProvider()).toBe('openai');
      expect(client.getModel()).toBe('gpt-4');
    });
    
    it('uses default model when not provided', () => {
      const client = new LLMClient({
        provider: 'anthropic',
        apiKey: 'sk-ant-test-key-1234567890',
        model: '',
      });
      
      expect(client.getModel()).toBe('claude-3-haiku-20240307');
    });
    
    it('creates client for each supported provider', () => {
      const providers: LLMProvider[] = ['openrouter', 'openai', 'anthropic'];
      
      for (const provider of providers) {
        const client = new LLMClient({
          provider,
          apiKey: 'test-key-12345678901234567890',
          model: 'test-model',
        });
        
        expect(client.getProvider()).toBe(provider);
      }
    });
  });
  
  describe('createLLMClient factory', () => {
    it('creates client with default retry config', () => {
      const client = createLLMClient({
        provider: 'openai',
        apiKey: 'sk-test-key-12345678901234567890',
        model: 'gpt-4',
      });
      
      expect(client).toBeInstanceOf(LLMClient);
      expect(client.getProvider()).toBe('openai');
    });
    
    it('creates client with custom retry config', () => {
      const customRetryConfig = {
        maxRetries: 5,
        initialDelayMs: 500,
        maxDelayMs: 5000,
        backoffMultiplier: 1.5,
      };
      
      const client = createLLMClient(
        {
          provider: 'anthropic',
          apiKey: 'sk-ant-test-key-1234567890',
          model: 'claude-3-opus-20240229',
        },
        customRetryConfig
      );
      
      expect(client).toBeInstanceOf(LLMClient);
    });
  });
});


// ============================================
// LLM CLIENT ERROR TESTS
// ============================================

describe('LLMClientError', () => {
  it('creates error with all properties', () => {
    const error = new LLMClientError(
      'Rate limit exceeded',
      'RATE_LIMIT_ERROR',
      'openai',
      429,
      true
    );
    
    expect(error.message).toBe('Rate limit exceeded');
    expect(error.code).toBe('RATE_LIMIT_ERROR');
    expect(error.provider).toBe('openai');
    expect(error.statusCode).toBe(429);
    expect(error.retryable).toBe(true);
    expect(error.name).toBe('LLMClientError');
  });
  
  it('creates error with default retryable false', () => {
    const error = new LLMClientError(
      'Auth failed',
      'AUTHENTICATION_ERROR',
      'anthropic',
      401
    );
    
    expect(error.retryable).toBe(false);
  });
  
  it('is instanceof Error', () => {
    const error = new LLMClientError(
      'Test error',
      'UNKNOWN_ERROR',
      'openrouter'
    );
    
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(LLMClientError);
  });
});

// ============================================
// INTEGRATION TESTS WITH MOCKED FETCH
// ============================================

describe('LLMClient Integration (Mocked)', () => {
  const originalFetch = global.fetch;
  
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  
  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });
  
  describe('generateCompletion', () => {
    it('makes successful request to OpenAI', async () => {
      const mockResponse = {
        id: 'chatcmpl-test',
        model: 'gpt-4',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hello from OpenAI!',
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });
      
      const client = new LLMClient({
        provider: 'openai',
        apiKey: 'sk-test-key-12345678901234567890',
        model: 'gpt-4',
      });
      
      const result = await client.generateCompletion({
        messages: [{ role: 'user', content: 'Hello!' }],
      });
      
      expect(result.content).toBe('Hello from OpenAI!');
      expect(result.provider).toBe('openai');
      expect(result.tokensUsed.total).toBe(15);
      
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer sk-test-key-12345678901234567890',
          }),
        })
      );
    });
    
    it('makes successful request to Anthropic', async () => {
      const mockResponse = {
        id: 'msg_test',
        model: 'claude-3-haiku-20240307',
        content: [
          {
            type: 'text',
            text: 'Hello from Claude!',
          },
        ],
        usage: {
          input_tokens: 8,
          output_tokens: 4,
        },
      };
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });
      
      const client = new LLMClient({
        provider: 'anthropic',
        apiKey: 'sk-ant-test-key-1234567890',
        model: 'claude-3-haiku-20240307',
      });
      
      const result = await client.generateCompletion({
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hi!' },
        ],
      });
      
      expect(result.content).toBe('Hello from Claude!');
      expect(result.provider).toBe('anthropic');
      
      // Verify Anthropic-specific headers
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'sk-ant-test-key-1234567890',
            'anthropic-version': '2023-06-01',
          }),
        })
      );
    });
    
    it('makes successful request to OpenRouter', async () => {
      const mockResponse = {
        id: 'gen-test',
        model: 'openai/gpt-4',
        choices: [
          {
            message: {
              content: 'Hello from OpenRouter!',
            },
          },
        ],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 6,
          total_tokens: 18,
        },
      };
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });
      
      const client = new LLMClient({
        provider: 'openrouter',
        apiKey: 'sk-or-test-key-1234567890',
        model: 'openai/gpt-4',
      });
      
      const result = await client.generateCompletion({
        messages: [{ role: 'user', content: 'Hello!' }],
      });
      
      expect(result.content).toBe('Hello from OpenRouter!');
      expect(result.provider).toBe('openrouter');
      
      // Verify OpenRouter-specific headers
      expect(global.fetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          headers: expect.objectContaining({
            'HTTP-Referer': 'https://synapsis.social',
            'X-Title': 'Synapsis Bot',
          }),
        })
      );
    });
  });
});


// ============================================
// RETRY LOGIC TESTS
// ============================================

describe('Retry Logic', () => {
  const originalFetch = global.fetch;
  
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  
  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });
  
  it('retries on server error (500) up to 3 times', async () => {
    let callCount = 0;
    
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal server error' }),
      });
    });
    
    const client = new LLMClient(
      {
        provider: 'openai',
        apiKey: 'sk-test-key-12345678901234567890',
        model: 'gpt-4',
      },
      {
        maxRetries: 3,
        initialDelayMs: 10, // Short delay for testing
        maxDelayMs: 100,
        backoffMultiplier: 2,
      }
    );
    
    await expect(
      client.generateCompletion({
        messages: [{ role: 'user', content: 'Hello!' }],
      })
    ).rejects.toThrow(LLMClientError);
    
    // Initial attempt + 3 retries = 4 total calls
    expect(callCount).toBe(4);
  });
  
  it('retries on rate limit error (429)', async () => {
    let callCount = 0;
    
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.resolve({
          ok: false,
          status: 429,
          json: () => Promise.resolve({ error: 'Rate limit exceeded' }),
        });
      }
      // Succeed on third attempt
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Success!' } }],
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        }),
      });
    });
    
    const client = new LLMClient(
      {
        provider: 'openai',
        apiKey: 'sk-test-key-12345678901234567890',
        model: 'gpt-4',
      },
      {
        maxRetries: 3,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      }
    );
    
    const result = await client.generateCompletion({
      messages: [{ role: 'user', content: 'Hello!' }],
    });
    
    expect(result.content).toBe('Success!');
    expect(callCount).toBe(3);
  });
  
  it('does not retry on authentication error (401)', async () => {
    let callCount = 0;
    
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Invalid API key' }),
      });
    });
    
    const client = new LLMClient(
      {
        provider: 'openai',
        apiKey: 'sk-invalid-key-12345678901234567890',
        model: 'gpt-4',
      },
      {
        maxRetries: 3,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      }
    );
    
    await expect(
      client.generateCompletion({
        messages: [{ role: 'user', content: 'Hello!' }],
      })
    ).rejects.toThrow(LLMClientError);
    
    // Should not retry - only 1 call
    expect(callCount).toBe(1);
  });
  
  it('does not retry on invalid request (400)', async () => {
    let callCount = 0;
    
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Invalid request' }),
      });
    });
    
    const client = new LLMClient(
      {
        provider: 'openai',
        apiKey: 'sk-test-key-12345678901234567890',
        model: 'gpt-4',
      },
      {
        maxRetries: 3,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      }
    );
    
    await expect(
      client.generateCompletion({
        messages: [{ role: 'user', content: 'Hello!' }],
      })
    ).rejects.toThrow(LLMClientError);
    
    expect(callCount).toBe(1);
  });
  
  it('retries on network error', async () => {
    let callCount = 0;
    
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.reject(new TypeError('fetch failed'));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Success after network error!' } }],
          usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
        }),
      });
    });
    
    const client = new LLMClient(
      {
        provider: 'openai',
        apiKey: 'sk-test-key-12345678901234567890',
        model: 'gpt-4',
      },
      {
        maxRetries: 3,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      }
    );
    
    const result = await client.generateCompletion({
      messages: [{ role: 'user', content: 'Hello!' }],
    });
    
    expect(result.content).toBe('Success after network error!');
    expect(callCount).toBe(3);
  });
});


// ============================================
// ERROR HANDLING TESTS
// ============================================

describe('Error Handling', () => {
  const originalFetch = global.fetch;
  
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  
  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });
  
  it('throws LLMClientError with correct code for auth error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    });
    
    const client = new LLMClient({
      provider: 'openai',
      apiKey: 'sk-invalid-key-12345678901234567890',
      model: 'gpt-4',
    });
    
    try {
      await client.generateCompletion({
        messages: [{ role: 'user', content: 'Hello!' }],
      });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(LLMClientError);
      const llmError = error as LLMClientError;
      expect(llmError.code).toBe('AUTHENTICATION_ERROR');
      expect(llmError.statusCode).toBe(401);
      expect(llmError.retryable).toBe(false);
    }
  });
  
  it('throws LLMClientError with correct code for rate limit', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: 'Rate limit exceeded' }),
    });
    
    const client = new LLMClient(
      {
        provider: 'openai',
        apiKey: 'sk-test-key-12345678901234567890',
        model: 'gpt-4',
      },
      {
        maxRetries: 0, // No retries for this test
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      }
    );
    
    try {
      await client.generateCompletion({
        messages: [{ role: 'user', content: 'Hello!' }],
      });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(LLMClientError);
      const llmError = error as LLMClientError;
      expect(llmError.code).toBe('RATE_LIMIT_ERROR');
      expect(llmError.statusCode).toBe(429);
      expect(llmError.retryable).toBe(true);
    }
  });
  
  it('throws LLMClientError for network errors', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    
    const client = new LLMClient(
      {
        provider: 'openai',
        apiKey: 'sk-test-key-12345678901234567890',
        model: 'gpt-4',
      },
      {
        maxRetries: 0,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      }
    );
    
    try {
      await client.generateCompletion({
        messages: [{ role: 'user', content: 'Hello!' }],
      });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(LLMClientError);
      const llmError = error as LLMClientError;
      expect(llmError.code).toBe('NETWORK_ERROR');
      expect(llmError.retryable).toBe(true);
    }
  });
  
  it('handles timeout correctly', async () => {
    // Use real timers for this test since AbortController needs real timing
    vi.useRealTimers();
    
    // Create a fetch that takes longer than the timeout
    global.fetch = vi.fn().mockImplementation((_url, options) => {
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          resolve({
            ok: true,
            json: () => Promise.resolve({}),
          });
        }, 5000); // 5 seconds - longer than timeout
        
        // Listen for abort signal
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }
      });
    });
    
    const client = new LLMClient(
      {
        provider: 'openai',
        apiKey: 'sk-test-key-12345678901234567890',
        model: 'gpt-4',
      },
      {
        maxRetries: 0,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      },
      50 // 50ms timeout
    );
    
    try {
      await client.generateCompletion({
        messages: [{ role: 'user', content: 'Hello!' }],
      });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(LLMClientError);
      const llmError = error as LLMClientError;
      expect(llmError.code).toBe('TIMEOUT_ERROR');
      expect(llmError.retryable).toBe(true);
    }
    
    // Restore fake timers for other tests
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  
  it('detects content policy violation', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ 
        error: 'Content flagged by safety system' 
      }),
    });
    
    const client = new LLMClient({
      provider: 'openai',
      apiKey: 'sk-test-key-12345678901234567890',
      model: 'gpt-4',
    });
    
    try {
      await client.generateCompletion({
        messages: [{ role: 'user', content: 'Inappropriate content' }],
      });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(LLMClientError);
      const llmError = error as LLMClientError;
      expect(llmError.code).toBe('CONTENT_POLICY_VIOLATION');
    }
  });
});

// ============================================
// PROVIDER SUPPORT TESTS
// ============================================

describe('Provider Support (Requirement 2.6)', () => {
  /**
   * Validates: Requirements 2.6
   * THE Bot_Manager SHALL support multiple LLM provider types (OpenRouter, OpenAI, Anthropic)
   */
  
  it('supports OpenRouter provider', () => {
    const client = createLLMClient({
      provider: 'openrouter',
      apiKey: 'sk-or-test-key-1234567890',
      model: 'openai/gpt-4',
    });
    
    expect(client.getProvider()).toBe('openrouter');
    expect(client.getModel()).toBe('openai/gpt-4');
  });
  
  it('supports OpenAI provider', () => {
    const client = createLLMClient({
      provider: 'openai',
      apiKey: 'sk-test-key-12345678901234567890',
      model: 'gpt-4-turbo',
    });
    
    expect(client.getProvider()).toBe('openai');
    expect(client.getModel()).toBe('gpt-4-turbo');
  });
  
  it('supports Anthropic provider', () => {
    const client = createLLMClient({
      provider: 'anthropic',
      apiKey: 'sk-ant-test-key-1234567890',
      model: 'claude-3-opus-20240229',
    });
    
    expect(client.getProvider()).toBe('anthropic');
    expect(client.getModel()).toBe('claude-3-opus-20240229');
  });
  
  it('all three providers have correct endpoints', () => {
    expect(PROVIDER_ENDPOINTS.openrouter).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(PROVIDER_ENDPOINTS.openai).toBe('https://api.openai.com/v1/chat/completions');
    expect(PROVIDER_ENDPOINTS.anthropic).toBe('https://api.anthropic.com/v1/messages');
  });
});

// ============================================
// RETRY LOGIC TESTS (Requirement 11.4)
// ============================================

describe('LLM Retry Logic (Requirement 11.4)', () => {
  /**
   * Validates: Requirements 11.4
   * WHEN LLM generation fails, THE Bot_Manager SHALL log the error and retry up to 3 times
   */
  
  it('default retry config has 3 retries', () => {
    expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(3);
  });
  
  it('retry config uses exponential backoff', () => {
    expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBeGreaterThan(1);
    expect(DEFAULT_RETRY_CONFIG.initialDelayMs).toBeGreaterThan(0);
    expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBeGreaterThan(DEFAULT_RETRY_CONFIG.initialDelayMs);
  });
});
