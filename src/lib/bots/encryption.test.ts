/**
 * Property-Based Tests for Bot API Key Encryption
 * 
 * Feature: bot-system, Property 6: API Key Encryption Round-Trip
 * 
 * Tests the encryption module using fast-check for property-based testing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fc from 'fast-check';
import {
  encryptApiKey,
  decryptApiKey,
  EncryptedData,
} from './encryption';

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
// GENERATORS
// ============================================

/**
 * Generator for valid API keys.
 * 
 * Valid API keys:
 * - OpenRouter: starts with "sk-or-" followed by alphanumeric chars
 * - OpenAI: starts with "sk-" (but not "sk-or-" or "sk-ant-") followed by alphanumeric chars
 * - Anthropic: starts with "sk-ant-" followed by alphanumeric chars
 * 
 * All keys must be at least 20 characters and at most 256 characters.
 */
const validApiKeyArb = fc.oneof(
  // OpenRouter keys: sk-or-{alphanumeric, min 14 chars to reach 20 total}
  fc.stringMatching(/^[a-zA-Z0-9_-]{14,200}$/).map(suffix => `sk-or-${suffix}`),
  // Anthropic keys: sk-ant-{alphanumeric, min 12 chars to reach 20 total}
  fc.stringMatching(/^[a-zA-Z0-9_-]{12,200}$/).map(suffix => `sk-ant-${suffix}`),
  // OpenAI keys: sk-{alphanumeric, min 17 chars to reach 20 total, but not starting with or- or ant-}
  fc.stringMatching(/^[a-zA-Z0-9_-]{17,200}$/)
    .filter(suffix => !suffix.startsWith('or-') && !suffix.startsWith('ant-'))
    .map(suffix => `sk-${suffix}`)
);

/**
 * Generator for arbitrary non-empty strings (for testing encryption of any string).
 * This tests the encryption mechanism itself, not API key validation.
 */
const arbitraryStringArb = fc.string({ minLength: 1, maxLength: 500 });

// ============================================
// PROPERTY TESTS
// ============================================

describe('Feature: bot-system, Property 6: API Key Encryption Round-Trip', () => {
  /**
   * Property 6: API Key Encryption Round-Trip
   * 
   * *For any* valid API key, encrypting then decrypting the key SHALL produce 
   * the original key value, and the encrypted value SHALL differ from the original.
   * 
   * **Validates: Requirements 2.2, 2.3**
   */
  it('encrypting then decrypting any valid API key produces the original value', () => {
    fc.assert(
      fc.property(validApiKeyArb, (apiKey) => {
        // Encrypt the API key
        const encrypted: EncryptedData = encryptApiKey(apiKey);
        
        // Decrypt the encrypted data
        const decrypted: string = decryptApiKey(encrypted);
        
        // The decrypted value must equal the original
        expect(decrypted).toBe(apiKey);
      }),
      { numRuns: 100 } // Minimum 100 iterations as per design doc
    );
  });

  it('encrypted value differs from the original API key', () => {
    fc.assert(
      fc.property(validApiKeyArb, (apiKey) => {
        // Encrypt the API key
        const encrypted: EncryptedData = encryptApiKey(apiKey);
        
        // The encrypted value (base64 encoded ciphertext) must differ from original
        expect(encrypted.encrypted).not.toBe(apiKey);
        
        // Additionally, the encrypted data should not contain the original key
        // (this is a stronger check for security)
        expect(encrypted.encrypted).not.toContain(apiKey);
      }),
      { numRuns: 100 }
    );
  });

  it('encryption produces different ciphertext for the same key (due to random IV)', () => {
    fc.assert(
      fc.property(validApiKeyArb, (apiKey) => {
        // Encrypt the same key twice
        const encrypted1: EncryptedData = encryptApiKey(apiKey);
        const encrypted2: EncryptedData = encryptApiKey(apiKey);
        
        // The encrypted values should differ due to random IV
        expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
        expect(encrypted1.iv).not.toBe(encrypted2.iv);
        
        // But both should decrypt to the same original value
        expect(decryptApiKey(encrypted1)).toBe(apiKey);
        expect(decryptApiKey(encrypted2)).toBe(apiKey);
      }),
      { numRuns: 100 }
    );
  });

  it('round-trip works for arbitrary non-empty strings', () => {
    fc.assert(
      fc.property(arbitraryStringArb, (plaintext) => {
        // Encrypt the string
        const encrypted: EncryptedData = encryptApiKey(plaintext);
        
        // Decrypt the encrypted data
        const decrypted: string = decryptApiKey(encrypted);
        
        // The decrypted value must equal the original
        expect(decrypted).toBe(plaintext);
        
        // The encrypted value must differ from original (unless empty after encoding)
        if (plaintext.length > 0) {
          expect(encrypted.encrypted).not.toBe(plaintext);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('encrypted data has valid structure', () => {
    fc.assert(
      fc.property(validApiKeyArb, (apiKey) => {
        const encrypted: EncryptedData = encryptApiKey(apiKey);
        
        // Encrypted data should have both required fields
        expect(encrypted).toHaveProperty('encrypted');
        expect(encrypted).toHaveProperty('iv');
        
        // Both fields should be non-empty strings
        expect(typeof encrypted.encrypted).toBe('string');
        expect(typeof encrypted.iv).toBe('string');
        expect(encrypted.encrypted.length).toBeGreaterThan(0);
        expect(encrypted.iv.length).toBeGreaterThan(0);
        
        // IV should be base64 encoded 16 bytes (approximately 24 chars with padding)
        const ivBuffer = Buffer.from(encrypted.iv, 'base64');
        expect(ivBuffer.length).toBe(16);
      }),
      { numRuns: 100 }
    );
  });
});


// ============================================
// IMPORTS FOR PROPERTY 7
// ============================================

import {
  validateApiKeyFormat,
  LLMProvider,
} from './encryption';

// ============================================
// GENERATORS FOR PROPERTY 7
// ============================================

/**
 * Generator for invalid API keys - strings that should NOT pass validation.
 * 
 * Invalid keys include:
 * - Empty strings
 * - Strings too short (< 20 chars)
 * - Strings too long (> 256 chars)
 * - Strings with wrong prefixes
 * - Strings with invalid characters
 * - Strings that don't match any provider pattern
 */

// Generator for strings that are too short (< 20 chars)
const tooShortKeyArb = fc.string({ minLength: 1, maxLength: 19 });

// Generator for strings that are too long (> 256 chars)
const tooLongKeyArb = fc.string({ minLength: 257, maxLength: 500 });

// Generator for strings with wrong/no prefix (doesn't start with sk-)
const wrongPrefixKeyArb = fc.stringMatching(/^[a-zA-Z0-9_-]{20,100}$/)
  .filter(s => !s.startsWith('sk-'));

// Generator for strings with invalid characters after valid prefix
const invalidCharsAfterPrefixArb = fc.oneof(
  // OpenRouter prefix with invalid chars (spaces, special chars)
  fc.stringMatching(/^[a-zA-Z0-9 !@#$%^&*()]{14,50}$/)
    .filter(s => /[^a-zA-Z0-9_-]/.test(s))
    .map(suffix => `sk-or-${suffix}`),
  // Anthropic prefix with invalid chars
  fc.stringMatching(/^[a-zA-Z0-9 !@#$%^&*()]{12,50}$/)
    .filter(s => /[^a-zA-Z0-9_-]/.test(s))
    .map(suffix => `sk-ant-${suffix}`),
  // OpenAI prefix with invalid chars
  fc.stringMatching(/^[a-zA-Z0-9 !@#$%^&*()]{17,50}$/)
    .filter(s => /[^a-zA-Z0-9_-]/.test(s) && !s.startsWith('or-') && !s.startsWith('ant-'))
    .map(suffix => `sk-${suffix}`)
);

// Generator for OpenRouter keys that are mismatched with OpenAI provider
const openRouterKeyForOpenAIArb = fc.stringMatching(/^[a-zA-Z0-9_-]{14,100}$/)
  .map(suffix => `sk-or-${suffix}`);

// Generator for Anthropic keys that are mismatched with OpenAI provider
// sk-ant- is 7 chars, so suffix needs at least 13 chars to reach 20 total
const anthropicKeyForOpenAIArb = fc.stringMatching(/^[a-zA-Z0-9_-]{13,100}$/)
  .map(suffix => `sk-ant-${suffix}`);

// Generator for valid OpenAI keys (for testing provider mismatch)
const validOpenAIKeyArb = fc.stringMatching(/^[a-zA-Z0-9_-]{17,100}$/)
  .filter(suffix => !suffix.startsWith('or-') && !suffix.startsWith('ant-'))
  .map(suffix => `sk-${suffix}`);

// Generator for valid OpenRouter keys
const validOpenRouterKeyArb = fc.stringMatching(/^[a-zA-Z0-9_-]{14,100}$/)
  .map(suffix => `sk-or-${suffix}`);

// Generator for valid Anthropic keys
// sk-ant- is 7 chars, so suffix needs at least 13 chars to reach 20 total
const validAnthropicKeyArb = fc.stringMatching(/^[a-zA-Z0-9_-]{13,100}$/)
  .map(suffix => `sk-ant-${suffix}`);

// Generator for completely random strings (most will be invalid)
const randomStringArb = fc.string({ minLength: 1, maxLength: 300 });

// ============================================
// PROPERTY 7 TESTS
// ============================================

describe('Feature: bot-system, Property 7: API Key Format Validation', () => {
  /**
   * Property 7: API Key Format Validation
   * 
   * *For any* string that does not match valid API key formats for supported providers,
   * the validation SHALL reject the key.
   * 
   * **Validates: Requirements 2.1**
   */

  describe('Invalid keys are rejected', () => {
    it('rejects keys that are too short (< 20 characters)', () => {
      fc.assert(
        fc.property(
          tooShortKeyArb,
          fc.constantFrom<LLMProvider>('openrouter', 'openai', 'anthropic'),
          (key, provider) => {
            const result = validateApiKeyFormat(key, provider);
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rejects keys that are too long (> 256 characters)', () => {
      fc.assert(
        fc.property(
          tooLongKeyArb,
          fc.constantFrom<LLMProvider>('openrouter', 'openai', 'anthropic'),
          (key, provider) => {
            const result = validateApiKeyFormat(key, provider);
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rejects keys with wrong prefix for the provider', () => {
      fc.assert(
        fc.property(wrongPrefixKeyArb, (key) => {
          // Test against all providers - keys without sk- prefix should fail all
          const openrouterResult = validateApiKeyFormat(key, 'openrouter');
          const openaiResult = validateApiKeyFormat(key, 'openai');
          const anthropicResult = validateApiKeyFormat(key, 'anthropic');
          
          expect(openrouterResult.valid).toBe(false);
          expect(openaiResult.valid).toBe(false);
          expect(anthropicResult.valid).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('rejects keys with invalid characters after valid prefix', () => {
      fc.assert(
        fc.property(invalidCharsAfterPrefixArb, (key) => {
          // Determine which provider this key appears to be for
          let provider: LLMProvider;
          if (key.startsWith('sk-or-')) {
            provider = 'openrouter';
          } else if (key.startsWith('sk-ant-')) {
            provider = 'anthropic';
          } else {
            provider = 'openai';
          }
          
          const result = validateApiKeyFormat(key, provider);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }),
        { numRuns: 100 }
      );
    });

    it('rejects empty strings', () => {
      const providers: LLMProvider[] = ['openrouter', 'openai', 'anthropic'];
      
      for (const provider of providers) {
        const result = validateApiKeyFormat('', provider);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it('rejects non-string inputs', () => {
      const providers: LLMProvider[] = ['openrouter', 'openai', 'anthropic'];
      const invalidInputs = [null, undefined, 123, {}, []];
      
      for (const provider of providers) {
        for (const input of invalidInputs) {
          const result = validateApiKeyFormat(input as unknown as string, provider);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }
      }
    });
  });

  describe('Provider mismatch detection', () => {
    it('rejects OpenRouter keys when validating for OpenAI provider', () => {
      fc.assert(
        fc.property(openRouterKeyForOpenAIArb, (key) => {
          const result = validateApiKeyFormat(key, 'openai');
          expect(result.valid).toBe(false);
          expect(result.error).toContain('OpenRouter');
        }),
        { numRuns: 100 }
      );
    });

    it('rejects Anthropic keys when validating for OpenAI provider', () => {
      fc.assert(
        fc.property(anthropicKeyForOpenAIArb, (key) => {
          const result = validateApiKeyFormat(key, 'openai');
          expect(result.valid).toBe(false);
          expect(result.error).toContain('Anthropic');
        }),
        { numRuns: 100 }
      );
    });

    it('rejects OpenAI keys when validating for OpenRouter provider', () => {
      fc.assert(
        fc.property(validOpenAIKeyArb, (key) => {
          const result = validateApiKeyFormat(key, 'openrouter');
          expect(result.valid).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('rejects OpenAI keys when validating for Anthropic provider', () => {
      fc.assert(
        fc.property(validOpenAIKeyArb, (key) => {
          const result = validateApiKeyFormat(key, 'anthropic');
          expect(result.valid).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Valid keys are accepted', () => {
    it('accepts valid OpenRouter keys', () => {
      fc.assert(
        fc.property(validOpenRouterKeyArb, (key) => {
          const result = validateApiKeyFormat(key, 'openrouter');
          expect(result.valid).toBe(true);
          expect(result.provider).toBe('openrouter');
          expect(result.error).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });

    it('accepts valid OpenAI keys', () => {
      fc.assert(
        fc.property(validOpenAIKeyArb, (key) => {
          const result = validateApiKeyFormat(key, 'openai');
          expect(result.valid).toBe(true);
          expect(result.provider).toBe('openai');
          expect(result.error).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });

    it('accepts valid Anthropic keys', () => {
      fc.assert(
        fc.property(validAnthropicKeyArb, (key) => {
          const result = validateApiKeyFormat(key, 'anthropic');
          expect(result.valid).toBe(true);
          expect(result.provider).toBe('anthropic');
          expect(result.error).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Random string rejection', () => {
    it('most random strings are rejected by all providers', () => {
      fc.assert(
        fc.property(randomStringArb, (key) => {
          // Count how many providers accept this key
          const results = [
            validateApiKeyFormat(key, 'openrouter'),
            validateApiKeyFormat(key, 'openai'),
            validateApiKeyFormat(key, 'anthropic'),
          ];
          
          const validCount = results.filter(r => r.valid).length;
          
          // A random string should be accepted by at most one provider
          // (if it happens to match a valid format)
          expect(validCount).toBeLessThanOrEqual(1);
          
          // If it's valid for one provider, verify it matches the expected format
          if (validCount === 1) {
            const validResult = results.find(r => r.valid)!;
            if (validResult.provider === 'openrouter') {
              expect(key.startsWith('sk-or-')).toBe(true);
            } else if (validResult.provider === 'anthropic') {
              expect(key.startsWith('sk-ant-')).toBe(true);
            } else if (validResult.provider === 'openai') {
              expect(key.startsWith('sk-')).toBe(true);
              expect(key.startsWith('sk-or-')).toBe(false);
              expect(key.startsWith('sk-ant-')).toBe(false);
            }
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
