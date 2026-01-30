/**
 * User Signing Tests
 * 
 * Tests for user-level cryptographic signing functionality
 * Validates: Key management, signing, and verification
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  keyStore,
  hasUserPrivateKey,
  clearUserPrivateKey,
  generateKeyPair,
  exportPublicKey,
  canonicalize
} from './user-signing';

describe('User Signing', () => {
  beforeEach(() => {
    // Clear the key store before each test
    keyStore.clear();
  });

  describe('keyStore', () => {
    it('should store and retrieve identity', () => {
      const identity = {
        did: 'did:web:example.com:alice',
        handle: 'alice',
        publicKey: 'test-public-key'
      };
      
      keyStore.setIdentity(identity);
      const retrieved = keyStore.getIdentity();
      
      expect(retrieved).toEqual(identity);
    });

    it('should return null when no identity is set', () => {
      expect(keyStore.getIdentity()).toBeNull();
    });
  });

  describe('hasUserPrivateKey', () => {
    it('should return false when no key is stored', () => {
      expect(hasUserPrivateKey()).toBe(false);
    });

    it('should return false after key is cleared', () => {
      clearUserPrivateKey();
      expect(hasUserPrivateKey()).toBe(false);
    });
  });

  describe('clearUserPrivateKey', () => {
    it('should be idempotent (safe to call multiple times)', () => {
      expect(() => clearUserPrivateKey()).not.toThrow();
      expect(hasUserPrivateKey()).toBe(false);
    });
  });

  describe('generateKeyPair', () => {
    it('should generate a valid ECDSA P-256 key pair', async () => {
      const keyPair = await generateKeyPair();
      
      expect(keyPair).toHaveProperty('privateKey');
      expect(keyPair).toHaveProperty('publicKey');
      expect(keyPair.privateKey.type).toBe('private');
      expect(keyPair.publicKey.type).toBe('public');
      expect(keyPair.privateKey.algorithm.name).toBe('ECDSA');
      expect(keyPair.publicKey.algorithm.name).toBe('ECDSA');
    });
  });

  describe('exportPublicKey', () => {
    it('should export public key as base64', async () => {
      const keyPair = await generateKeyPair();
      const exported = await exportPublicKey(keyPair.publicKey);
      
      expect(typeof exported).toBe('string');
      expect(exported.length).toBeGreaterThan(0);
      // Should be valid base64
      expect(() => atob(exported)).not.toThrow();
    });
  });

  describe('canonicalize', () => {
    it('should canonicalize objects with sorted keys', () => {
      const obj1 = { b: 1, a: 2 };
      const obj2 = { a: 2, b: 1 };
      
      expect(canonicalize(obj1)).toBe('{"a":2,"b":1}');
      expect(canonicalize(obj2)).toBe('{"a":2,"b":1}');
      expect(canonicalize(obj1)).toBe(canonicalize(obj2));
    });

    it('should handle nested objects', () => {
      const obj = { z: { a: 1, b: 2 }, y: 'test' };
      expect(canonicalize(obj)).toBe('{"y":"test","z":{"a":1,"b":2}}');
    });

    it('should handle arrays', () => {
      const obj = { arr: [3, 1, 2] };
      expect(canonicalize(obj)).toBe('{"arr":[3,1,2]}');
    });

    it('should throw on invalid types', () => {
      expect(() => canonicalize({ d: new Date() })).toThrow(/Date objects not allowed/);
      expect(() => canonicalize({ n: NaN })).toThrow(/Number is not finite/);
      expect(() => canonicalize({ n: Infinity })).toThrow(/Number is not finite/);
    });

    it('should handle strings correctly', () => {
      expect(canonicalize('hello')).toBe('"hello"');
      expect(canonicalize('with"quotes')).toBe('"with\\"quotes"');
    });

    it('should handle numbers', () => {
      expect(canonicalize(42)).toBe('42');
      expect(canonicalize(3.14)).toBe('3.14');
    });

    it('should handle booleans and null', () => {
      expect(canonicalize(true)).toBe('true');
      expect(canonicalize(false)).toBe('false');
      expect(canonicalize(null)).toBe('null');
    });
  });
});
