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

      // Auto-sync identity if available in singleton but missing in local state
      const globalIdentity = keyStore.getIdentity();
      if (globalIdentity) {
        setIdentity(prev => {
          // Avoid rerenders if same
          if (prev && prev.did === globalIdentity.did && prev.isUnlocked === hasKey) return prev;
          return { ...globalIdentity, isUnlocked: hasKey };
        });
      } else {
        // If global cleared, clear local
        setIdentity(prev => prev ? null : null);
      }
    };

    check();
    // Poll fast to ensure UI updates are snappy
    const interval = setInterval(check, 500);
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
    // Save to singleton
    const coreIdentity = {
      did: userData.did,
      handle: userData.handle,
      publicKey: userData.publicKey
    };
    keyStore.setIdentity(coreIdentity);

    // If password provided, attempt unlock
    if (password) {
      await unlockIdentity(userData.privateKeyEncrypted, password);
    } else {
      // Just set public identity info if locked
      setIdentity({
        ...coreIdentity,
        isUnlocked: !!keyStore.getPrivateKey()
      });
    }
  };

  /**
   * Unlock the identity with a password
   */
  const unlockIdentity = async (privateKeyEncrypted: string, password: string, userDid?: string, userHandle?: string, userPublicKey?: string) => {
    try {
      console.log('[Identity] Unlocking with DID:', userDid, 'Handle:', userHandle);
      
      // Set identity first if provided (needed for storage key derivation)
      if (userDid && userHandle && userPublicKey) {
        keyStore.setIdentity({
          did: userDid,
          handle: userHandle,
          publicKey: userPublicKey
        });
        console.log('[Identity] Identity set in keyStore');
      } else {
        console.warn('[Identity] Missing user info for identity setup');
      }

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
      console.log('[Identity] Private key stored in memory');

      // 4. Derive and store storage key for chat encryption
      // Use libsodium's pwhash to derive a storage key from the password
      const sodiumModule = await import('libsodium-wrappers-sumo');
      await sodiumModule.default.ready;
      const sodium = sodiumModule.default;
      
      // Use a fixed salt derived from the user's identity to ensure consistency
      const identity = keyStore.getIdentity();
      console.log('[Identity] Retrieved identity from keyStore:', identity);
      
      if (identity) {
        const saltString = `synapsis-chat-storage-${identity.did}`;
        // Generate a fixed-length salt from the DID
        // Hash to 32 bytes, then take first 16 bytes for salt
        const fullHash = sodium.crypto_generichash(32, saltString, null);
        const salt = fullHash.slice(0, sodium.crypto_pwhash_SALTBYTES);
        
        console.log('[Identity] Deriving storage key...');
        const storageKey = sodium.crypto_pwhash(
          32, // 32 bytes for secretbox
          password,
          salt,
          sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
          sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
          sodium.crypto_pwhash_ALG_DEFAULT
        );
        
        keyStore.setStorageKey(storageKey);
        console.log('[Identity] Storage key derived and stored');
      } else {
        console.error('[Identity] No identity in keyStore - cannot derive storage key');
      }

      // 5. Update State
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
    // Re-check global state directly to be safe
    const pk = keyStore.getPrivateKey();
    const id = keyStore.getIdentity();

    if (!id || !pk) {
      console.error('[Identity] Sign failed. Identity:', id, 'HasKey:', !!pk);
      throw new Error('Identity locked');
    }
    // Use the fetched identity to ensure sync
    return await createSignedAction(action, data, id.did, id.handle);
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
