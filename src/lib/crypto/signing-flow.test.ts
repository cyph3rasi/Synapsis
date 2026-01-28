/**
 * Property Tests for Cryptographic User Signing
 * 
 * Verifies:
 * 1. Key generation and storage
 * 2. Canonical serialization
 * 3. Signing process
 * 4. Verification process
 * 5. Replay protection logic (mocked DB)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    generateKeyPair,
    keyStore,
    createSignedAction,
    canonicalize,
    exportPublicKey,
    importPublicKey,
    base64UrlToBase64
} from './user-signing';
import { verifyUserAction, type SignedAction } from '../auth/verify-signature';

// Mock DB interactions
const mockDbMethods = {
    findFirst: vi.fn(),
    values: vi.fn(() => ({ onConflictDoUpdate: vi.fn() })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoUpdate: vi.fn() })) }))
};

// We need to hoist the variable if we use it in vi.mock
// Or simpler for this case, simply define it inline or use a factory that doesn't capture outer scope incorrectly.
vi.mock('@/db', () => ({
    db: {
        query: {
            users: { findFirst: vi.fn() },
            remoteIdentityCache: { findFirst: vi.fn() }
        },
        insert: vi.fn(() => ({ values: vi.fn() })),
    },
    users: { did: 'did', publicKey: 'publicKey' },
    signedActionDedupe: { actionId: 'actionId' },
    remoteIdentityCache: { did: 'did' },
}));

// Access the mocked module to manipulate it in tests
import { db } from '@/db';

// Mock Database unique constraint error for replay test
const duplicateKeyError = new Error('Duplicate key');
(duplicateKeyError as any).code = '23505';

describe('Cryptographic User Signing', () => {
    let userKeyPair: CryptoKeyPair;
    let userPublicKeyBase64: string;
    const testDid = 'did:web:test.com:alice';
    const testHandle = 'alice';

    beforeEach(async () => {
        // Setup fresh identity
        userKeyPair = await generateKeyPair();
        keyStore.setPrivateKey(userKeyPair.privateKey);
        userPublicKeyBase64 = await exportPublicKey(userKeyPair.publicKey);

        vi.clearAllMocks();
    });

    it('should canonicalize objects strictly', () => {
        const obj1 = { b: 1, a: 2 };
        const obj2 = { a: 2, b: 1 };

        expect(canonicalize(obj1)).toBe('{"a":2,"b":1}');
        expect(canonicalize(obj2)).toBe('{"a":2,"b":1}');
        expect(canonicalize(obj1)).toBe(canonicalize(obj2));
    });

    it('should throw on invalid canonical types', () => {
        expect(() => canonicalize({ d: new Date() })).toThrow(/Date objects not allowed/);
        expect(() => canonicalize({ n: NaN })).toThrow(/Number is not finite/);
    });

    it('should create a valid signed action', async () => {
        const payload = { content: 'Hello World' };
        const action = 'create_post';

        const signed = await createSignedAction(action, payload, testDid, testHandle);

        expect(signed).toHaveProperty('sig');
        expect(signed).toHaveProperty('nonce');
        expect(signed).toHaveProperty('ts');
        expect(signed.action).toBe(action);
        expect(signed.did).toBe(testDid);
    });

    it('should verify a valid signed action', async () => {
        const payload = { content: 'Hello World' };
        const signed = await createSignedAction('create_post', payload, testDid, testHandle);

        // Mock DB finding the user
        (db.query.users.findFirst as any).mockResolvedValue({
            id: 'uuid-123',
            did: testDid,
            handle: testHandle,
            publicKey: userPublicKeyBase64,
        });

        // Mock DB insert (dedupe) success
        (db.insert as any).mockReturnValue({
            values: vi.fn().mockResolvedValue(true)
        });

        const result = await verifyUserAction(signed);

        expect(result.valid).toBe(true);
        expect(result.user).toBeDefined();
        // Verify dedupe insert was called
        expect(db.insert).toHaveBeenCalled();
    });

    it('should reject invalid signature', async () => {
        const payload = { content: 'Hello World' };
        const signed = await createSignedAction('create_post', payload, testDid, testHandle);

        // Tamper with data
        signed.data.content = 'Hacked';

        (db.query.users.findFirst as any).mockResolvedValue({
            id: 'uuid-123',
            did: testDid,
            handle: testHandle,
            publicKey: userPublicKeyBase64,
        });

        const result = await verifyUserAction(signed);

        expect(result.valid).toBe(false);
        expect(result.error).toBe('INVALID_SIGNATURE');
    });

    it('should reject replay attacks via DB constraint', async () => {
        const payload = { content: 'Replay Me' };
        const signed = await createSignedAction('create_post', payload, testDid, testHandle);

        (db.query.users.findFirst as any).mockResolvedValue({
            id: 'uuid-123',
            did: testDid,
            handle: testHandle,
            publicKey: userPublicKeyBase64,
        });

        // Mock Duplicate Key Error
        const duplicateKeyError = new Error('Duplicate key');
        (duplicateKeyError as any).code = '23505';

        // Second attempt fails with unique violation
        (db.insert as any).mockReturnValue({
            values: vi.fn().mockRejectedValue(duplicateKeyError)
        });

        // Verify failure path
        const result = await verifyUserAction(signed);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('REPLAYED_NONCE');
    });
});
