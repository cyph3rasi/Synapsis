/**
 * User Identity Hook
 * 
 * Manages the user's cryptographic identity using in-memory storage.
 * strict: NO localStorage for decrypted keys.
 */

import { useState, useEffect } from 'react';
import { decryptPrivateKey } from '@/lib/crypto/private-key-client';
import {
  keyStore,
  importPrivateKey,
  generateKeyPair,
  exportPrivateKey,
  exportPublicKey,
  base64UrlToBase64,
  createSignedAction
} from '@/lib/crypto/user-signing';

export interface UserIdentity {
  did: string;
  handle: string;
  publicKey: string;
  isUnlocked: boolean;
}

export function useUserIdentity() {
  const [identity, setIdentity] = useState<UserIdentity | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);

  // Check status on mount / updates
  // Check status on mount / updates and poll for changes in singleton
  useEffect(() => {
    const check = () => {
      const hasKey = !!keyStore.getPrivateKey();
      setIsUnlocked(hasKey);
      // We could also try to recover identity data if it's missing but key exists?
      // But identity data usually comes from initializeIdentity
    };

    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, []);

  /**
   * Initialize identity from user data & password
   */
  const initializeIdentity = async (userData: {
    did: string;
    handle: string;
    publicKey: string;
    privateKeyEncrypted: string;
  }, password?: string) => {

    // If password provided, attempt unlock
    if (password) {
      await unlockIdentity(userData.privateKeyEncrypted, password);
    } else {
      // Just set public identity info if locked
      setIdentity({
        did: userData.did,
        handle: userData.handle,
        publicKey: userData.publicKey,
        isUnlocked: !!keyStore.getPrivateKey()
      });
    }
  };

  /**
   * Unlock the identity with a password
   */
  const unlockIdentity = async (privateKeyEncrypted: string, password: string) => {
    try {
      // 1. Decrypt the PEM/String from server (which is actually a base64 encoded PKCS8 export usually?)
      // Wait, existing implementation returns a string.
      // We need to verify what `decryptPrivateKey` returns.
      // Assuming it returns the decrypted string (Base64 of PKCS8)

      const privateKeyPemOrBase64 = await decryptPrivateKey(privateKeyEncrypted, password);

      // Clean up if it's PEM to get Base64
      let privateKeyBase64 = privateKeyPemOrBase64;
      if (privateKeyBase64.includes('-----BEGIN')) {
        privateKeyBase64 = privateKeyBase64
          .replace(/-----BEGIN [A-Z ]+-----/, '')
          .replace(/-----END [A-Z ]+-----/, '')
          .replace(/\s/g, '');
      }

      // 2. Import into CryptoKey
      // We need ArrayBuffer
      const binaryDer = Buffer.from(privateKeyBase64, 'base64');
      const cryptoKey = await importPrivateKey(binaryDer); // This is P-256 specific now

      // 3. Store in Memory
      keyStore.setPrivateKey(cryptoKey);

      // 4. Update State
      setIdentity(prev => prev ? { ...prev, isUnlocked: true } : null); // We need the other data...
      setIsUnlocked(true);

      // If we didn't have identity wrapper set yet, we might need it.
      // Usually initializeIdentity handles both.

    } catch (error) {
      console.error('[Identity] Failed to unlock identity:', error);
      throw new Error('Failed to unlock identity. Incorrect password?');
    }
  };

  /**
   * Lock the identity
   */
  const lockIdentity = () => {
    keyStore.clear();
    setIsUnlocked(false);
    setIdentity(prev => prev ? { ...prev, isUnlocked: false } : null);
  };

  /**
   * Clear the identity (logout)
   */
  const clearIdentity = () => {
    keyStore.clear();
    setIdentity(null);
    setIsUnlocked(false);
  };

  /**
   * Sign a user action
   */
  const signUserAction = async (action: string, data: any) => {
    if (!identity || !isUnlocked) {
      throw new Error('Identity locked');
    }
    return await createSignedAction(action, data, identity.did, identity.handle);
  };

  return {
    identity,
    isUnlocked,
    initializeIdentity,
    unlockIdentity,
    lockIdentity,
    clearIdentity,
    signUserAction
  };
}
