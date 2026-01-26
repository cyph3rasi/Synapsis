/**
 * Unit tests for Personality Configuration Module
 * 
 * Tests validation, serialization, and prompt building functionality.
 */

import { describe, it, expect } from 'vitest';
import {
  validateSystemPrompt,
  validateTemperature,
  validateMaxTokens,
  validateResponseStyle,
  validatePersonalityConfig,
  isValidPersonalityConfig,
  serializePersonalityConfig,
  deserializePersonalityConfig,
  buildPromptWithPersonality,
  getPersonalityPreset,
  getAllPersonalityPresets,
  createDefaultPersonalityConfig,
  PersonalityConfig,
  PersonalityError,
  MIN_SYSTEM_PROMPT_LENGTH,
  MAX_SYSTEM_PROMPT_LENGTH,
  MIN_TEMPERATURE,
  MAX_TEMPERATURE,
  MIN_MAX_TOKENS,
  MAX_MAX_TOKENS,
} from './personality';

describe('Personality Configuration Module', () => {
  // ============================================
  // SYSTEM PROMPT VALIDATION
  // ============================================
  
  describe('validateSystemPrompt', () => {
    it('should accept valid system prompts', () => {
      const errors = validateSystemPrompt('You are a helpful assistant bot.');
      expect(errors).toHaveLength(0);
    });
    
    it('should reject undefined system prompt', () => {
      const errors = validateSystemPrompt(undefined);
      expect(errors).toContain('System prompt is required');
    });
    
    it('should reject null system prompt', () => {
      const errors = validateSystemPrompt(null);
      expect(errors).toContain('System prompt is required');
    });
    
    it('should reject non-string system prompt', () => {
      const errors = validateSystemPrompt(123);
      expect(errors).toContain('System prompt must be a string');
    });
    
    it('should reject system prompt that is too short', () => {
      const errors = validateSystemPrompt('Hi');
      expect(errors).toContain(`System prompt must be at least ${MIN_SYSTEM_PROMPT_LENGTH} characters`);
    });
    
    it('should reject system prompt that is too long', () => {
      const longPrompt = 'a'.repeat(MAX_SYSTEM_PROMPT_LENGTH + 1);
      const errors = validateSystemPrompt(longPrompt);
      expect(errors).toContain(`System prompt must be ${MAX_SYSTEM_PROMPT_LENGTH} characters or less`);
    });
    
    it('should accept system prompt at minimum length', () => {
      const minPrompt = 'a'.repeat(MIN_SYSTEM_PROMPT_LENGTH);
      const errors = validateSystemPrompt(minPrompt);
      expect(errors).toHaveLength(0);
    });
    
    it('should accept system prompt at maximum length', () => {
      const maxPrompt = 'a'.repeat(MAX_SYSTEM_PROMPT_LENGTH);
      const errors = validateSystemPrompt(maxPrompt);
      expect(errors).toHaveLength(0);
    });
  });
  
  // ============================================
  // TEMPERATURE VALIDATION
  // ============================================
  
  describe('validateTemperature', () => {
    it('should accept valid temperature values', () => {
      expect(validateTemperature(0)).toHaveLength(0);
      expect(validateTemperature(0.5)).toHaveLength(0);
      expect(validateTemperature(1)).toHaveLength(0);
      expect(validateTemperature(1.5)).toHaveLength(0);
      expect(validateTemperature(2)).toHaveLength(0);
    });
    
    it('should reject undefined temperature', () => {
      const errors = validateTemperature(undefined);
      expect(errors).toContain('Temperature is required');
    });
    
    it('should reject null temperature', () => {
      const errors = validateTemperature(null);
      expect(errors).toContain('Temperature is required');
    });
    
    it('should reject non-number temperature', () => {
      const errors = validateTemperature('0.5');
      expect(errors).toContain('Temperature must be a number');
    });
    
    it('should reject NaN temperature', () => {
      const errors = validateTemperature(NaN);
      expect(errors).toContain('Temperature must be a valid number');
    });
    
    it('should reject temperature below minimum', () => {
      const errors = validateTemperature(-0.1);
      expect(errors).toContain(`Temperature must be at least ${MIN_TEMPERATURE}`);
    });
    
    it('should reject temperature above maximum', () => {
      const errors = validateTemperature(2.1);
      expect(errors).toContain(`Temperature must be at most ${MAX_TEMPERATURE}`);
    });
  });
  
  // ============================================
  // MAX TOKENS VALIDATION
  // ============================================
  
  describe('validateMaxTokens', () => {
    it('should accept valid maxTokens values', () => {
      expect(validateMaxTokens(1)).toHaveLength(0);
      expect(validateMaxTokens(100)).toHaveLength(0);
      expect(validateMaxTokens(1000)).toHaveLength(0);
      expect(validateMaxTokens(100000)).toHaveLength(0);
    });
    
    it('should reject undefined maxTokens', () => {
      const errors = validateMaxTokens(undefined);
      expect(errors).toContain('Max tokens is required');
    });
    
    it('should reject null maxTokens', () => {
      const errors = validateMaxTokens(null);
      expect(errors).toContain('Max tokens is required');
    });
    
    it('should reject non-number maxTokens', () => {
      const errors = validateMaxTokens('100');
      expect(errors).toContain('Max tokens must be a number');
    });
    
    it('should reject NaN maxTokens', () => {
      const errors = validateMaxTokens(NaN);
      expect(errors).toContain('Max tokens must be a valid number');
    });
    
    it('should reject non-integer maxTokens', () => {
      const errors = validateMaxTokens(100.5);
      expect(errors).toContain('Max tokens must be an integer');
    });
    
    it('should reject maxTokens below minimum', () => {
      const errors = validateMaxTokens(0);
      expect(errors).toContain(`Max tokens must be at least ${MIN_MAX_TOKENS}`);
    });
    
    it('should reject maxTokens above maximum', () => {
      const errors = validateMaxTokens(100001);
      expect(errors).toContain(`Max tokens must be at most ${MAX_MAX_TOKENS}`);
    });
  });
  
  // ============================================
  // RESPONSE STYLE VALIDATION
  // ============================================
  
  describe('validateResponseStyle', () => {
    it('should accept undefined response style (optional)', () => {
      const errors = validateResponseStyle(undefined);
      expect(errors).toHaveLength(0);
    });
    
    it('should accept null response style (optional)', () => {
      const errors = validateResponseStyle(null);
      expect(errors).toHaveLength(0);
    });
    
    it('should accept valid response styles', () => {
      expect(validateResponseStyle('formal')).toHaveLength(0);
      expect(validateResponseStyle('casual')).toHaveLength(0);
      expect(validateResponseStyle('custom style')).toHaveLength(0);
    });
    
    it('should reject non-string response style', () => {
      const errors = validateResponseStyle(123);
      expect(errors).toContain('Response style must be a string');
    });
    
    it('should reject empty response style', () => {
      const errors = validateResponseStyle('');
      expect(errors).toContain('Response style cannot be empty if provided');
    });
    
    it('should reject whitespace-only response style', () => {
      const errors = validateResponseStyle('   ');
      expect(errors).toContain('Response style cannot be empty if provided');
    });
    
    it('should reject response style that is too long', () => {
      const longStyle = 'a'.repeat(101);
      const errors = validateResponseStyle(longStyle);
      expect(errors).toContain('Response style must be 100 characters or less');
    });
  });
  
  // ============================================
  // COMPLETE CONFIG VALIDATION
  // ============================================
  
  describe('validatePersonalityConfig', () => {
    const validConfig: PersonalityConfig = {
      systemPrompt: 'You are a helpful assistant bot.',
      temperature: 0.7,
      maxTokens: 500,
    };
    
    it('should accept valid configuration', () => {
      const result = validatePersonalityConfig(validConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('should accept valid configuration with response style', () => {
      const result = validatePersonalityConfig({
        ...validConfig,
        responseStyle: 'formal',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('should reject non-object configuration', () => {
      const result = validatePersonalityConfig('not an object');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Personality configuration must be an object');
    });
    
    it('should reject null configuration', () => {
      const result = validatePersonalityConfig(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Personality configuration must be an object');
    });
    
    it('should collect all validation errors', () => {
      const result = validatePersonalityConfig({
        systemPrompt: 'Hi', // too short
        temperature: 3, // too high
        maxTokens: 0, // too low
        responseStyle: '', // empty
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
  
  describe('isValidPersonalityConfig', () => {
    it('should return true for valid config', () => {
      const config: PersonalityConfig = {
        systemPrompt: 'You are a helpful assistant bot.',
        temperature: 0.7,
        maxTokens: 500,
      };
      expect(isValidPersonalityConfig(config)).toBe(true);
    });
    
    it('should return false for invalid config', () => {
      expect(isValidPersonalityConfig(null)).toBe(false);
      expect(isValidPersonalityConfig({ systemPrompt: 'Hi' })).toBe(false);
    });
  });
  
  // ============================================
  // SERIALIZATION
  // ============================================
  
  describe('serializePersonalityConfig', () => {
    it('should serialize config to JSON string', () => {
      const config: PersonalityConfig = {
        systemPrompt: 'You are a helpful assistant bot.',
        temperature: 0.7,
        maxTokens: 500,
      };
      const serialized = serializePersonalityConfig(config);
      expect(typeof serialized).toBe('string');
      expect(JSON.parse(serialized)).toEqual(config);
    });
    
    it('should preserve all fields including optional ones', () => {
      const config: PersonalityConfig = {
        systemPrompt: 'You are a helpful assistant bot.',
        temperature: 0.7,
        maxTokens: 500,
        responseStyle: 'formal',
      };
      const serialized = serializePersonalityConfig(config);
      const parsed = JSON.parse(serialized);
      expect(parsed.responseStyle).toBe('formal');
    });
  });
  
  describe('deserializePersonalityConfig', () => {
    it('should deserialize valid JSON to config', () => {
      const config: PersonalityConfig = {
        systemPrompt: 'You are a helpful assistant bot.',
        temperature: 0.7,
        maxTokens: 500,
      };
      const json = JSON.stringify(config);
      const deserialized = deserializePersonalityConfig(json);
      expect(deserialized).toEqual(config);
    });
    
    it('should throw PersonalityError for invalid JSON', () => {
      expect(() => deserializePersonalityConfig('not json')).toThrow(PersonalityError);
    });
    
    it('should throw PersonalityError for invalid config', () => {
      const invalidJson = JSON.stringify({ systemPrompt: 'Hi' });
      expect(() => deserializePersonalityConfig(invalidJson)).toThrow(PersonalityError);
    });
  });
  
  // ============================================
  // PROMPT BUILDING
  // ============================================
  
  describe('buildPromptWithPersonality', () => {
    const personality: PersonalityConfig = {
      systemPrompt: 'You are a helpful assistant bot.',
      temperature: 0.7,
      maxTokens: 500,
    };
    
    it('should build basic prompt with personality', () => {
      const result = buildPromptWithPersonality(personality);
      expect(result.systemMessage).toContain('You are a helpful assistant bot.');
      expect(result.temperature).toBe(0.7);
      expect(result.maxTokens).toBe(500);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('system');
    });
    
    it('should include response style in system message', () => {
      const personalityWithStyle: PersonalityConfig = {
        ...personality,
        responseStyle: 'formal',
      };
      const result = buildPromptWithPersonality(personalityWithStyle);
      expect(result.systemMessage).toContain('Response Style: formal');
    });
    
    it('should include context in system message', () => {
      const result = buildPromptWithPersonality(personality, {
        context: 'This is additional context.',
      });
      expect(result.systemMessage).toContain('Additional Context:');
      expect(result.systemMessage).toContain('This is additional context.');
    });
    
    it('should include user message', () => {
      const result = buildPromptWithPersonality(personality, {
        userMessage: 'Hello, how are you?',
      });
      expect(result.messages).toHaveLength(2);
      expect(result.messages[1].role).toBe('user');
      expect(result.messages[1].content).toBe('Hello, how are you?');
    });
    
    it('should include source content', () => {
      const result = buildPromptWithPersonality(personality, {
        sourceContent: {
          title: 'Test Article',
          content: 'Article content here.',
          url: 'https://example.com/article',
        },
      });
      expect(result.messages).toHaveLength(2);
      expect(result.messages[1].role).toBe('user');
      expect(result.messages[1].content).toContain('Test Article');
      expect(result.messages[1].content).toContain('Article content here.');
      expect(result.messages[1].content).toContain('https://example.com/article');
    });
    
    it('should include conversation history', () => {
      const result = buildPromptWithPersonality(personality, {
        conversationHistory: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
        userMessage: 'How are you?',
      });
      expect(result.messages).toHaveLength(4);
      expect(result.messages[1].role).toBe('user');
      expect(result.messages[1].content).toBe('Hello');
      expect(result.messages[2].role).toBe('assistant');
      expect(result.messages[2].content).toBe('Hi there!');
      expect(result.messages[3].role).toBe('user');
      expect(result.messages[3].content).toBe('How are you?');
    });
  });
  
  // ============================================
  // PRESETS
  // ============================================
  
  describe('getPersonalityPreset', () => {
    it('should return preset by ID', () => {
      const preset = getPersonalityPreset('news-curator');
      expect(preset).toBeDefined();
      expect(preset?.name).toBe('News Curator');
    });
    
    it('should return undefined for unknown preset', () => {
      const preset = getPersonalityPreset('unknown-preset');
      expect(preset).toBeUndefined();
    });
  });
  
  describe('getAllPersonalityPresets', () => {
    it('should return all presets', () => {
      const presets = getAllPersonalityPresets();
      expect(presets.length).toBeGreaterThan(0);
      expect(presets.every(p => p.id && p.name && p.config)).toBe(true);
    });
    
    it('should return a copy of presets array', () => {
      const presets1 = getAllPersonalityPresets();
      const presets2 = getAllPersonalityPresets();
      expect(presets1).not.toBe(presets2);
    });
    
    it('should have valid configs for all presets', () => {
      const presets = getAllPersonalityPresets();
      for (const preset of presets) {
        expect(isValidPersonalityConfig(preset.config)).toBe(true);
      }
    });
  });
  
  describe('createDefaultPersonalityConfig', () => {
    it('should create a valid default config', () => {
      const config = createDefaultPersonalityConfig();
      expect(isValidPersonalityConfig(config)).toBe(true);
    });
    
    it('should have reasonable default values', () => {
      const config = createDefaultPersonalityConfig();
      expect(config.systemPrompt.length).toBeGreaterThan(0);
      expect(config.temperature).toBeGreaterThanOrEqual(0);
      expect(config.temperature).toBeLessThanOrEqual(2);
      expect(config.maxTokens).toBeGreaterThan(0);
    });
  });
});
