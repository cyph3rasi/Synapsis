/**
 * Property-Based Tests for Personality Configuration Module
 * 
 * Feature: bot-system
 * - Property 9: Personality Configuration Persistence
 * 
 * Tests the personality configuration storage and retrieval using fast-check
 * for property-based testing.
 * 
 * **Validates: Requirements 3.1, 3.3, 3.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  PersonalityConfig,
  serializePersonalityConfig,
  deserializePersonalityConfig,
  validatePersonalityConfig,
  isValidPersonalityConfig,
  MIN_SYSTEM_PROMPT_LENGTH,
  MAX_SYSTEM_PROMPT_LENGTH,
  MIN_TEMPERATURE,
  MAX_TEMPERATURE,
  MIN_MAX_TOKENS,
  MAX_MAX_TOKENS,
} from './personality';

// ============================================
// GENERATORS
// ============================================

/**
 * Generator for valid system prompts.
 * System prompts must be between MIN_SYSTEM_PROMPT_LENGTH and MAX_SYSTEM_PROMPT_LENGTH characters.
 */
const systemPromptArb = fc.string({
  minLength: MIN_SYSTEM_PROMPT_LENGTH,
  maxLength: Math.min(MAX_SYSTEM_PROMPT_LENGTH, 1000), // Cap at 1000 for test performance
}).filter(s => s.trim().length >= MIN_SYSTEM_PROMPT_LENGTH);

/**
 * Generator for valid temperature values.
 * Temperature must be between MIN_TEMPERATURE (0) and MAX_TEMPERATURE (2).
 */
const temperatureArb = fc.double({
  min: MIN_TEMPERATURE,
  max: MAX_TEMPERATURE,
  noNaN: true,
  noDefaultInfinity: true,
});

/**
 * Generator for valid maxTokens values.
 * MaxTokens must be an integer between MIN_MAX_TOKENS (1) and MAX_MAX_TOKENS (100000).
 */
const maxTokensArb = fc.integer({
  min: MIN_MAX_TOKENS,
  max: MAX_MAX_TOKENS,
});

/**
 * Generator for valid response styles (optional).
 * Response style must be a non-empty string of 100 characters or less if provided.
 */
const responseStyleArb = fc.option(
  fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  { nil: undefined }
);

/**
 * Generator for valid personality configurations.
 * Combines all field generators to create complete valid configurations.
 */
const validPersonalityConfigArb: fc.Arbitrary<PersonalityConfig> = fc.record({
  systemPrompt: systemPromptArb,
  temperature: temperatureArb,
  maxTokens: maxTokensArb,
  responseStyle: responseStyleArb,
});

// ============================================
// PROPERTY TESTS
// ============================================

describe('Feature: bot-system, Property 9: Personality Configuration Persistence', () => {
  /**
   * Property 9: Personality Configuration Persistence
   * 
   * *For any* valid personality configuration, storing then retrieving the configuration
   * SHALL produce an equivalent configuration object.
   * 
   * **Validates: Requirements 3.1, 3.3, 3.4**
   */

  it('serializing then deserializing a valid config produces an equivalent config', async () => {
    await fc.assert(
      fc.asyncProperty(validPersonalityConfigArb, async (config) => {
        // Verify the generated config is valid
        expect(isValidPersonalityConfig(config)).toBe(true);
        
        // Serialize the configuration (simulates storage)
        const serialized = serializePersonalityConfig(config);
        
        // Deserialize the configuration (simulates retrieval)
        const deserialized = deserializePersonalityConfig(serialized);
        
        // The deserialized config should be equivalent to the original
        expect(deserialized.systemPrompt).toBe(config.systemPrompt);
        expect(deserialized.temperature).toBe(config.temperature);
        expect(deserialized.maxTokens).toBe(config.maxTokens);
        expect(deserialized.responseStyle).toBe(config.responseStyle);
      }),
      { numRuns: 100 }
    );
  });

  it('serialized config is a valid JSON string', async () => {
    await fc.assert(
      fc.asyncProperty(validPersonalityConfigArb, async (config) => {
        // Serialize the configuration
        const serialized = serializePersonalityConfig(config);
        
        // The serialized value should be a string
        expect(typeof serialized).toBe('string');
        
        // The serialized value should be valid JSON
        expect(() => JSON.parse(serialized)).not.toThrow();
      }),
      { numRuns: 100 }
    );
  });

  it('deserialized config passes validation', async () => {
    await fc.assert(
      fc.asyncProperty(validPersonalityConfigArb, async (config) => {
        // Serialize then deserialize
        const serialized = serializePersonalityConfig(config);
        const deserialized = deserializePersonalityConfig(serialized);
        
        // The deserialized config should pass validation
        const validationResult = validatePersonalityConfig(deserialized);
        expect(validationResult.valid).toBe(true);
        expect(validationResult.errors).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });

  it('round-trip preserves systemPrompt exactly (Requirement 3.1)', async () => {
    await fc.assert(
      fc.asyncProperty(validPersonalityConfigArb, async (config) => {
        // Serialize then deserialize
        const serialized = serializePersonalityConfig(config);
        const deserialized = deserializePersonalityConfig(serialized);
        
        // System prompt should be preserved exactly
        // This validates Requirement 3.1: storing personality prompt
        expect(deserialized.systemPrompt).toBe(config.systemPrompt);
        expect(deserialized.systemPrompt.length).toBe(config.systemPrompt.length);
      }),
      { numRuns: 100 }
    );
  });

  it('round-trip preserves temperature exactly (Requirement 3.4)', async () => {
    await fc.assert(
      fc.asyncProperty(validPersonalityConfigArb, async (config) => {
        // Serialize then deserialize
        const serialized = serializePersonalityConfig(config);
        const deserialized = deserializePersonalityConfig(serialized);
        
        // Temperature should be preserved exactly
        // This validates Requirement 3.4: temperature and other LLM parameters
        expect(deserialized.temperature).toBe(config.temperature);
      }),
      { numRuns: 100 }
    );
  });

  it('round-trip preserves maxTokens exactly (Requirement 3.4)', async () => {
    await fc.assert(
      fc.asyncProperty(validPersonalityConfigArb, async (config) => {
        // Serialize then deserialize
        const serialized = serializePersonalityConfig(config);
        const deserialized = deserializePersonalityConfig(serialized);
        
        // MaxTokens should be preserved exactly
        // This validates Requirement 3.4: other LLM parameters
        expect(deserialized.maxTokens).toBe(config.maxTokens);
      }),
      { numRuns: 100 }
    );
  });

  it('round-trip preserves responseStyle when present (Requirement 3.4)', async () => {
    // Use a generator that always includes responseStyle
    const configWithStyleArb = fc.record({
      systemPrompt: systemPromptArb,
      temperature: temperatureArb,
      maxTokens: maxTokensArb,
      responseStyle: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
    });

    await fc.assert(
      fc.asyncProperty(configWithStyleArb, async (config) => {
        // Serialize then deserialize
        const serialized = serializePersonalityConfig(config);
        const deserialized = deserializePersonalityConfig(serialized);
        
        // ResponseStyle should be preserved exactly
        expect(deserialized.responseStyle).toBe(config.responseStyle);
      }),
      { numRuns: 100 }
    );
  });

  it('round-trip preserves undefined responseStyle', async () => {
    // Use a generator that never includes responseStyle
    const configWithoutStyleArb = fc.record({
      systemPrompt: systemPromptArb,
      temperature: temperatureArb,
      maxTokens: maxTokensArb,
    });

    await fc.assert(
      fc.asyncProperty(configWithoutStyleArb, async (config) => {
        // Serialize then deserialize
        const serialized = serializePersonalityConfig(config);
        const deserialized = deserializePersonalityConfig(serialized);
        
        // ResponseStyle should remain undefined
        expect(deserialized.responseStyle).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  it('multiple round-trips produce identical results (idempotency)', async () => {
    await fc.assert(
      fc.asyncProperty(validPersonalityConfigArb, async (config) => {
        // First round-trip
        const serialized1 = serializePersonalityConfig(config);
        const deserialized1 = deserializePersonalityConfig(serialized1);
        
        // Second round-trip
        const serialized2 = serializePersonalityConfig(deserialized1);
        const deserialized2 = deserializePersonalityConfig(serialized2);
        
        // Third round-trip
        const serialized3 = serializePersonalityConfig(deserialized2);
        const deserialized3 = deserializePersonalityConfig(serialized3);
        
        // All deserialized configs should be equivalent
        expect(deserialized1.systemPrompt).toBe(deserialized2.systemPrompt);
        expect(deserialized2.systemPrompt).toBe(deserialized3.systemPrompt);
        
        expect(deserialized1.temperature).toBe(deserialized2.temperature);
        expect(deserialized2.temperature).toBe(deserialized3.temperature);
        
        expect(deserialized1.maxTokens).toBe(deserialized2.maxTokens);
        expect(deserialized2.maxTokens).toBe(deserialized3.maxTokens);
        
        expect(deserialized1.responseStyle).toBe(deserialized2.responseStyle);
        expect(deserialized2.responseStyle).toBe(deserialized3.responseStyle);
      }),
      { numRuns: 100 }
    );
  });

  it('config changes are reflected after re-serialization (Requirement 3.3)', async () => {
    await fc.assert(
      fc.asyncProperty(
        validPersonalityConfigArb,
        validPersonalityConfigArb,
        async (originalConfig, updatedConfig) => {
          // Serialize original config
          const originalSerialized = serializePersonalityConfig(originalConfig);
          
          // Simulate updating the config (Requirement 3.3: updates apply to future actions)
          const updatedSerialized = serializePersonalityConfig(updatedConfig);
          
          // Deserialize the updated config
          const deserialized = deserializePersonalityConfig(updatedSerialized);
          
          // The deserialized config should match the updated config, not the original
          expect(deserialized.systemPrompt).toBe(updatedConfig.systemPrompt);
          expect(deserialized.temperature).toBe(updatedConfig.temperature);
          expect(deserialized.maxTokens).toBe(updatedConfig.maxTokens);
          expect(deserialized.responseStyle).toBe(updatedConfig.responseStyle);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('serialized configs with same values produce equivalent JSON', async () => {
    await fc.assert(
      fc.asyncProperty(validPersonalityConfigArb, async (config) => {
        // Create a copy of the config
        const configCopy: PersonalityConfig = {
          systemPrompt: config.systemPrompt,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          responseStyle: config.responseStyle,
        };
        
        // Serialize both
        const serialized1 = serializePersonalityConfig(config);
        const serialized2 = serializePersonalityConfig(configCopy);
        
        // The serialized values should be identical
        expect(serialized1).toBe(serialized2);
      }),
      { numRuns: 100 }
    );
  });

  it('handles special characters in systemPrompt correctly', async () => {
    // Generator for system prompts with special characters
    const specialChars = ['\n', '\t', '\r', '"', '\\', '/', '<', '>', '&', "'", '`', '{', '}', '[', ']'];
    const specialCharPromptArb = fc.array(
      fc.oneof(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.constantFrom(...specialChars)
      ),
      { minLength: MIN_SYSTEM_PROMPT_LENGTH, maxLength: 100 }
    ).map(arr => arr.join('')).filter(s => s.trim().length >= MIN_SYSTEM_PROMPT_LENGTH);

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          systemPrompt: specialCharPromptArb,
          temperature: temperatureArb,
          maxTokens: maxTokensArb,
        }),
        async (config) => {
          // Serialize then deserialize
          const serialized = serializePersonalityConfig(config);
          const deserialized = deserializePersonalityConfig(serialized);
          
          // System prompt with special characters should be preserved
          expect(deserialized.systemPrompt).toBe(config.systemPrompt);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('handles unicode characters in systemPrompt correctly', async () => {
    // Generator for system prompts with unicode characters
    // Using a mix of ASCII and common unicode characters
    const unicodeChars = ['é', 'ñ', 'ü', 'ö', 'ä', '中', '文', '日', '本', '語', '한', '글', '🤖', '👍', '🎉', '→', '←', '↑', '↓', '•', '©', '®', '™'];
    const unicodePromptArb = fc.array(
      fc.oneof(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.constantFrom(...unicodeChars)
      ),
      { minLength: MIN_SYSTEM_PROMPT_LENGTH, maxLength: 100 }
    ).map(arr => arr.join('')).filter(s => s.trim().length >= MIN_SYSTEM_PROMPT_LENGTH);

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          systemPrompt: unicodePromptArb,
          temperature: temperatureArb,
          maxTokens: maxTokensArb,
        }),
        async (config) => {
          // Serialize then deserialize
          const serialized = serializePersonalityConfig(config);
          const deserialized = deserializePersonalityConfig(serialized);
          
          // System prompt with unicode should be preserved
          expect(deserialized.systemPrompt).toBe(config.systemPrompt);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('handles boundary temperature values correctly', async () => {
    // Test with boundary temperature values
    const boundaryTemperatureArb = fc.oneof(
      fc.constant(MIN_TEMPERATURE),
      fc.constant(MAX_TEMPERATURE),
      fc.constant((MIN_TEMPERATURE + MAX_TEMPERATURE) / 2),
      temperatureArb
    );

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          systemPrompt: systemPromptArb,
          temperature: boundaryTemperatureArb,
          maxTokens: maxTokensArb,
        }),
        async (config) => {
          // Serialize then deserialize
          const serialized = serializePersonalityConfig(config);
          const deserialized = deserializePersonalityConfig(serialized);
          
          // Temperature should be preserved exactly
          expect(deserialized.temperature).toBe(config.temperature);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('handles boundary maxTokens values correctly', async () => {
    // Test with boundary maxTokens values
    const boundaryMaxTokensArb = fc.oneof(
      fc.constant(MIN_MAX_TOKENS),
      fc.constant(MAX_MAX_TOKENS),
      fc.constant(Math.floor((MIN_MAX_TOKENS + MAX_MAX_TOKENS) / 2)),
      maxTokensArb
    );

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          systemPrompt: systemPromptArb,
          temperature: temperatureArb,
          maxTokens: boundaryMaxTokensArb,
        }),
        async (config) => {
          // Serialize then deserialize
          const serialized = serializePersonalityConfig(config);
          const deserialized = deserializePersonalityConfig(serialized);
          
          // MaxTokens should be preserved exactly
          expect(deserialized.maxTokens).toBe(config.maxTokens);
        }
      ),
      { numRuns: 100 }
    );
  });
});
