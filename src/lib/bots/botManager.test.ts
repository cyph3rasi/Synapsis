/**
 * Bot Manager Unit Tests
 * 
 * Tests for the Bot Manager service covering bot CRUD operations,
 * validation, and limit enforcement.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  validateBotHandle,
  validateBotName,
  validatePersonalityConfig,
  validateScheduleConfig,
  getMaxBotsPerUser,
  BotValidationError,
  type PersonalityConfig,
  type ScheduleConfig,
  type ApiKeyStatus,
} from './botManager';

// ============================================
// VALIDATION TESTS
// ============================================

describe('Bot Manager Validation', () => {
  describe('validateBotHandle', () => {
    it('should accept valid handles', () => {
      expect(() => validateBotHandle('bot')).not.toThrow();
      expect(() => validateBotHandle('my_bot')).not.toThrow();
      expect(() => validateBotHandle('Bot123')).not.toThrow();
      expect(() => validateBotHandle('test_bot_123')).not.toThrow();
      expect(() => validateBotHandle('a'.repeat(30))).not.toThrow();
    });

    it('should reject empty handles', () => {
      expect(() => validateBotHandle('')).toThrow(BotValidationError);
      expect(() => validateBotHandle(null as unknown as string)).toThrow(BotValidationError);
      expect(() => validateBotHandle(undefined as unknown as string)).toThrow(BotValidationError);
    });

    it('should reject handles that are too short', () => {
      expect(() => validateBotHandle('ab')).toThrow(BotValidationError);
      expect(() => validateBotHandle('a')).toThrow(BotValidationError);
    });

    it('should reject handles that are too long', () => {
      expect(() => validateBotHandle('a'.repeat(31))).toThrow(BotValidationError);
    });

    it('should reject handles with invalid characters', () => {
      expect(() => validateBotHandle('bot-name')).toThrow(BotValidationError);
      expect(() => validateBotHandle('bot.name')).toThrow(BotValidationError);
      expect(() => validateBotHandle('bot name')).toThrow(BotValidationError);
      expect(() => validateBotHandle('bot@name')).toThrow(BotValidationError);
    });
  });

  describe('validateBotName', () => {
    it('should accept valid names', () => {
      expect(() => validateBotName('My Bot')).not.toThrow();
      expect(() => validateBotName('A')).not.toThrow();
      expect(() => validateBotName('Bot with special chars: @#$%')).not.toThrow();
      expect(() => validateBotName('a'.repeat(100))).not.toThrow();
    });

    it('should reject empty names', () => {
      expect(() => validateBotName('')).toThrow(BotValidationError);
      expect(() => validateBotName(null as unknown as string)).toThrow(BotValidationError);
      expect(() => validateBotName(undefined as unknown as string)).toThrow(BotValidationError);
    });

    it('should reject names that are too long', () => {
      expect(() => validateBotName('a'.repeat(101))).toThrow(BotValidationError);
    });
  });

  describe('validatePersonalityConfig', () => {
    const validConfig: PersonalityConfig = {
      systemPrompt: 'You are a helpful assistant.',
      temperature: 0.7,
      maxTokens: 1000,
    };

    it('should accept valid personality config', () => {
      expect(() => validatePersonalityConfig(validConfig)).not.toThrow();
    });

    it('should accept config with optional responseStyle', () => {
      expect(() => validatePersonalityConfig({
        ...validConfig,
        responseStyle: 'casual',
      })).not.toThrow();
    });

    it('should reject missing config', () => {
      expect(() => validatePersonalityConfig(null as unknown as PersonalityConfig)).toThrow(BotValidationError);
      expect(() => validatePersonalityConfig(undefined as unknown as PersonalityConfig)).toThrow(BotValidationError);
    });

    it('should reject missing system prompt', () => {
      expect(() => validatePersonalityConfig({
        ...validConfig,
        systemPrompt: '',
      })).toThrow(BotValidationError);
    });

    it('should reject system prompt that is too long', () => {
      expect(() => validatePersonalityConfig({
        ...validConfig,
        systemPrompt: 'a'.repeat(10001),
      })).toThrow(BotValidationError);
    });

    it('should reject invalid temperature', () => {
      expect(() => validatePersonalityConfig({
        ...validConfig,
        temperature: -0.1,
      })).toThrow(BotValidationError);

      expect(() => validatePersonalityConfig({
        ...validConfig,
        temperature: 2.1,
      })).toThrow(BotValidationError);

      expect(() => validatePersonalityConfig({
        ...validConfig,
        temperature: 'high' as unknown as number,
      })).toThrow(BotValidationError);
    });

    it('should reject invalid maxTokens', () => {
      expect(() => validatePersonalityConfig({
        ...validConfig,
        maxTokens: 0,
      })).toThrow(BotValidationError);

      expect(() => validatePersonalityConfig({
        ...validConfig,
        maxTokens: 100001,
      })).toThrow(BotValidationError);

      expect(() => validatePersonalityConfig({
        ...validConfig,
        maxTokens: 'many' as unknown as number,
      })).toThrow(BotValidationError);
    });
  });

  describe('validateScheduleConfig', () => {
    it('should accept valid interval schedule', () => {
      expect(() => validateScheduleConfig({
        type: 'interval',
        intervalMinutes: 30,
      })).not.toThrow();
    });

    it('should reject interval less than 5 minutes', () => {
      expect(() => validateScheduleConfig({
        type: 'interval',
        intervalMinutes: 4,
      })).toThrow(BotValidationError);
    });

    it('should accept valid times schedule', () => {
      expect(() => validateScheduleConfig({
        type: 'times',
        times: ['09:00', '12:00', '18:00'],
      })).not.toThrow();
    });

    it('should reject times schedule with invalid time format', () => {
      expect(() => validateScheduleConfig({
        type: 'times',
        times: ['9:00'], // Missing leading zero
      })).toThrow(BotValidationError);

      expect(() => validateScheduleConfig({
        type: 'times',
        times: ['25:00'], // Invalid hour
      })).toThrow(BotValidationError);

      expect(() => validateScheduleConfig({
        type: 'times',
        times: ['12:60'], // Invalid minute
      })).toThrow(BotValidationError);
    });

    it('should reject times schedule with empty array', () => {
      expect(() => validateScheduleConfig({
        type: 'times',
        times: [],
      })).toThrow(BotValidationError);
    });

    it('should accept valid cron schedule', () => {
      expect(() => validateScheduleConfig({
        type: 'cron',
        cronExpression: '0 9 * * *',
      })).not.toThrow();
    });

    it('should reject cron schedule without expression', () => {
      expect(() => validateScheduleConfig({
        type: 'cron',
      } as ScheduleConfig)).toThrow(BotValidationError);
    });

    it('should reject invalid schedule type', () => {
      expect(() => validateScheduleConfig({
        type: 'invalid' as 'interval',
      })).toThrow(BotValidationError);
    });
  });
});

// ============================================
// CONFIGURATION TESTS
// ============================================

describe('Bot Manager Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getMaxBotsPerUser', () => {
    it('should return default value when env not set', () => {
      delete process.env.BOT_MAX_PER_USER;
      expect(getMaxBotsPerUser()).toBe(5);
    });

    it('should return env value when set', () => {
      process.env.BOT_MAX_PER_USER = '10';
      expect(getMaxBotsPerUser()).toBe(10);
    });

    it('should return default for invalid env value', () => {
      process.env.BOT_MAX_PER_USER = 'invalid';
      expect(getMaxBotsPerUser()).toBe(5);
    });

    it('should return default for negative env value', () => {
      process.env.BOT_MAX_PER_USER = '-5';
      expect(getMaxBotsPerUser()).toBe(5);
    });

    it('should return default for zero env value', () => {
      process.env.BOT_MAX_PER_USER = '0';
      expect(getMaxBotsPerUser()).toBe(5);
    });
  });
});


// ============================================
// API KEY STATUS TYPE TESTS
// ============================================

describe('ApiKeyStatus Type', () => {
  it('should have correct structure', () => {
    const status: ApiKeyStatus = {
      hasApiKey: true,
      provider: 'openai',
      model: 'gpt-4',
    };
    
    expect(status.hasApiKey).toBe(true);
    expect(status.provider).toBe('openai');
    expect(status.model).toBe('gpt-4');
  });

  it('should support all LLM providers', () => {
    const providers: ApiKeyStatus['provider'][] = ['openrouter', 'openai', 'anthropic'];
    
    providers.forEach(provider => {
      const status: ApiKeyStatus = {
        hasApiKey: true,
        provider,
        model: 'test-model',
      };
      expect(status.provider).toBe(provider);
    });
  });

  it('should support hasApiKey being false', () => {
    const status: ApiKeyStatus = {
      hasApiKey: false,
      provider: 'openai',
      model: 'gpt-4',
    };
    
    expect(status.hasApiKey).toBe(false);
  });
});
