/**
 * User Signing Tests
 * 
 * Tests for user-level cryptographic signing functionality
 * Validates: Requirements US-1.2, US-1.4, US-6.3, US-6.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  getUserPrivateKey, 
  setUserPrivateKey, 
  clearUserPrivateKey,
  hasUserPrivateKey 
} from './user-signing';

// Mock localStorage for Node environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

// Set up global mocks
global.localStorage = localStorageMock as any;
global.window = { localStorage: localStorageMock } as any;

describe('User Private Key Management', () => {
  // Clean up localStorage before and after each test
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('setUserPrivateKey and getUserPrivateKey', () => {
    it('should store and retrieve private key from localStorage', () => {
      const testKey = '-----BEGIN PRIVATE KEY-----\ntest-key-content\n-----END PRIVATE KEY-----';
      
      // Store the key
      setUserPrivateKey(testKey);
      
      // Retrieve the key
      const retrievedKey = getUserPrivateKey();
      
      // Verify it matches
      expect(retrievedKey).toBe(testKey);
    });

    it('should return null when no key is stored', () => {
      const retrievedKey = getUserPrivateKey();
      expect(retrievedKey).toBeNull();
    });

    it('should overwrite existing key when setting a new one', () => {
      const firstKey = '-----BEGIN PRIVATE KEY-----\nfirst-key\n-----END PRIVATE KEY-----';
      const secondKey = '-----BEGIN PRIVATE KEY-----\nsecond-key\n-----END PRIVATE KEY-----';
      
      // Store first key
      setUserPrivateKey(firstKey);
      expect(getUserPrivateKey()).toBe(firstKey);
      
      // Store second key
      setUserPrivateKey(secondKey);
      expect(getUserPrivateKey()).toBe(secondKey);
    });
  });

  describe('clearUserPrivateKey', () => {
    it('should remove private key from localStorage', () => {
      const testKey = '-----BEGIN PRIVATE KEY-----\ntest-key-content\n-----END PRIVATE KEY-----';
      
      // Store the key
      setUserPrivateKey(testKey);
      expect(getUserPrivateKey()).toBe(testKey);
      
      // Clear the key
      clearUserPrivateKey();
      
      // Verify it's removed
      expect(getUserPrivateKey()).toBeNull();
    });

    it('should be idempotent (safe to call multiple times)', () => {
      const testKey = '-----BEGIN PRIVATE KEY-----\ntest-key-content\n-----END PRIVATE KEY-----';
      
      // Store and clear
      setUserPrivateKey(testKey);
      clearUserPrivateKey();
      
      // Clear again (should not throw)
      expect(() => clearUserPrivateKey()).not.toThrow();
      expect(getUserPrivateKey()).toBeNull();
    });

    it('should work when no key was stored', () => {
      // Clear when nothing is stored (should not throw)
      expect(() => clearUserPrivateKey()).not.toThrow();
      expect(getUserPrivateKey()).toBeNull();
    });
  });

  describe('hasUserPrivateKey', () => {
    it('should return true when key is stored', () => {
      const testKey = '-----BEGIN PRIVATE KEY-----\ntest-key-content\n-----END PRIVATE KEY-----';
      setUserPrivateKey(testKey);
      expect(hasUserPrivateKey()).toBe(true);
    });

    it('should return false when no key is stored', () => {
      expect(hasUserPrivateKey()).toBe(false);
    });

    it('should return false after key is cleared', () => {
      const testKey = '-----BEGIN PRIVATE KEY-----\ntest-key-content\n-----END PRIVATE KEY-----';
      setUserPrivateKey(testKey);
      expect(hasUserPrivateKey()).toBe(true);
      
      clearUserPrivateKey();
      expect(hasUserPrivateKey()).toBe(false);
    });
  });

  describe('localStorage key name', () => {
    it('should use the correct localStorage key', () => {
      const testKey = '-----BEGIN PRIVATE KEY-----\ntest-key-content\n-----END PRIVATE KEY-----';
      setUserPrivateKey(testKey);
      
      // Verify the key is stored with the correct name
      const storedValue = localStorage.getItem('synapsis_user_private_key');
      expect(storedValue).toBe(testKey);
    });
  });
});
