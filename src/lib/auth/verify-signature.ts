/**
 * Server-side signature verification for user actions
 * 
 * Strict Verification Rules:
 * - ECDSA P-256 (ES256) ONLY.
 * - DB-backed deduplication (signed_action_dedupe).
 * - Strict 5-minute freshness window.
 * - Canonical verification (must match client exactly).
 */

import { db } from '@/db';
import { users, signedActionDedupe } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { canonicalize, importPublicKey, base64UrlToBase64 } from '@/lib/crypto/user-signing';
// Note: user-signing helpers are isomorphic (work in Node via webcrypto polyfill/availability)
import crypto from 'crypto';

// Use Node's webcrypto for server-side if not global
const cryptoSubtle = globalThis.crypto?.subtle || require('crypto').webcrypto.subtle;

export interface SignedAction {
  action: string;
  data: any;
  did: string;
  handle: string;
  ts: number;
  nonce: string;
  sig: string;
}

/**
 * Verify a signed user action
 * 
 * @param signedAction - The signed action payload
 * @returns The user if signature is valid and not replayed
 */
export async function verifyUserAction(signedAction: SignedAction): Promise<{
  valid: boolean;
  user?: typeof users.$inferSelect;
  error?: string;
}> {
  if (!db) {
    return { valid: false, error: 'Database not available' };
  }

  const { sig, ...payload } = signedAction;

  // 1. FRESHNESS CHECK (Fail fast before DB/Crypto)
  const now = Date.now();
  const diff = Math.abs(now - payload.ts);
  const fiveMinutesMs = 5 * 60 * 1000;

  if (diff > fiveMinutesMs) {
    return { valid: false, error: 'INVALID_TIMESTAMP: Request too old or in future' };
  }

  // 2. FETCH USER & KEY
  const user = await db.query.users.findFirst({
    where: eq(users.did, payload.did),
  });

  if (!user) {
    // If federation, we might need to look up in remote_identity_cache here.
    // For now, assume local user or user must exist in users table (synced).
    return { valid: false, error: 'User not found' };
  }

  if (user.handle !== payload.handle) {
    return { valid: false, error: 'Handle mismatch' };
  }

  // 3. CRYPTOGRAPHIC VERIFICATION
  try {
    const canonicalString = canonicalize(payload);
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(canonicalString);

    // Convert signature from Base64Url to buffer
    const sigBase64 = base64UrlToBase64(sig);
    const sigBuffer = Buffer.from(sigBase64, 'base64');

    // Import public key (stored as SPKI Base64 in DB)
    const publicKey = await importPublicKey(user.publicKey);

    const isValid = await cryptoSubtle.verify(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' },
      },
      publicKey,
      sigBuffer,
      dataBytes
    );

    if (!isValid) {
      return { valid: false, error: 'INVALID_SIGNATURE' };
    }

    // 4. ACTION ID HASH COMPUTATION
    // SHA-256(canonicalPayload)
    // We use the same canonical string we just verified.
    const actionIdHash = crypto.createHash('sha256').update(canonicalString).digest('hex');

    // 5. REPLAY PROTECTION (DB)
    try {
      await db.insert(signedActionDedupe).values({
        actionId: actionIdHash,
        did: payload.did,
        nonce: payload.nonce,
        ts: payload.ts,
      });
    } catch (err: any) {
      // Check for unique constraint violation (duplicate key)
      if (err.code === '23505') { // Postgres unique_violation code
        return { valid: false, error: 'REPLAYED_NONCE' };
      }
      console.error('[Verify] Dedupe error:', err);
      throw err; // Internal error
    }

    return { valid: true, user };

  } catch (error) {
    console.error('[Verify] Verification exception:', error);
    return { valid: false, error: 'VERIFICATION_ERROR' };
  }
}

/**
 * Middleware to require a signed action
 * Throws an error if signature is invalid
 */
export async function requireSignedAction(signedAction: SignedAction): Promise<typeof users.$inferSelect> {
  const result = await verifyUserAction(signedAction);

  if (!result.valid) {
    throw new Error(result.error || 'Invalid signature');
  }

  return result.user!;
}
