/**
 * AuthContext Type Tests
 * 
 * Tests the AuthContext interface updates for cryptographic user signing
 * Validates: Requirements US-1.1, US-1.2, US-1.4, US-1.5
 */

import { describe, it, expect } from 'vitest';
import type { User } from './AuthContext';

describe('AuthContext Interface', () => {
  it('should include cryptographic fields in User interface', () => {
    // Create a user object with all required fields
    const user: User = {
      id: '1',
      handle: 'testuser',
      displayName: 'Test User',
      avatarUrl: 'https://example.com/avatar.jpg',
      did: 'did:synapsis:test123',
      publicKey: 'test-public-key',
      privateKeyEncrypted: 'encrypted-key',
    };

    // Verify all fields are present
    expect(user.id).toBe('1');
    expect(user.handle).toBe('testuser');
    expect(user.displayName).toBe('Test User');
    expect(user.avatarUrl).toBe('https://example.com/avatar.jpg');
    expect(user.did).toBe('did:synapsis:test123');
    expect(user.publicKey).toBe('test-public-key');
    expect(user.privateKeyEncrypted).toBe('encrypted-key');
  });

  it('should allow optional cryptographic fields', () => {
    // Create a user object without cryptographic fields
    const user: User = {
      id: '1',
      handle: 'testuser',
      displayName: 'Test User',
    };

    // Verify basic fields are present
    expect(user.id).toBe('1');
    expect(user.handle).toBe('testuser');
    expect(user.displayName).toBe('Test User');
    
    // Verify cryptographic fields are optional
    expect(user.did).toBeUndefined();
    expect(user.publicKey).toBeUndefined();
    expect(user.privateKeyEncrypted).toBeUndefined();
  });
});
