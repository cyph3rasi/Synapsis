/**
 * React Hook for Libsodium E2EE Chat
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { keyStore } from '@/lib/crypto/user-signing';
import * as SodiumChat from '@/lib/crypto/sodium-chat';

export function useSodiumChat() {
  const { user, isIdentityUnlocked } = useAuth();
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState<string>('idle');
  const keysRef = useRef<{ publicKey: string; privateKey: string } | null>(null);

  // Initialize and load/generate keys
  useEffect(() => {
    if (!user?.id || !isIdentityUnlocked) return;

    const init = async () => {
      try {
        setStatus('initializing');

        await SodiumChat.initSodium();

        // Get storage key from memory
        const storageKey = keyStore.getStorageKey();
        if (!storageKey) {
          throw new Error('Storage key not available - identity must be unlocked first');
        }

        // Try to load existing keys (encrypted in IndexedDB)
        let keys = await SodiumChat.getStoredKeys(user.id, storageKey);

        if (!keys) {
          // Generate new keys
          console.log('[Sodium] Generating new key pair...');
          keys = await SodiumChat.generateChatKeyPair();
          await SodiumChat.storeKeys(user.id, keys.publicKey, keys.privateKey, storageKey);

          // Publish public key to server
          console.log('[Sodium] Publishing public key to server...');
          const response = await fetch('/api/chat/keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ publicKey: keys.publicKey }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: response.statusText }));
            console.error('[Sodium] Failed to publish key:', errorData);
            throw new Error(`Failed to publish key: ${errorData.error || response.statusText}`);
          }

          const result = await response.json();
          console.log('[Sodium] Keys generated and published successfully:', result);
        } else {
          console.log('[Sodium] Loaded existing keys from IndexedDB');

          // Verify key exists on server
          console.log('[Sodium] Verifying key on server...');
          const checkResponse = await fetch(`/api/chat/keys?did=${encodeURIComponent(user.did)}`);

          let shouldPublish = false;

          if (!checkResponse.ok) {
            console.log('[Sodium] Key not found on server, re-publishing...');
            shouldPublish = true;
          } else {
            // Check if the key on server MATCHES our local key
            const serverData = await checkResponse.json();
            if (serverData.publicKey !== keys.publicKey) {
              console.warn('[Sodium] Server key mismatch! Re-publishing local key...');
              shouldPublish = true;
            } else {
              console.log('[Sodium] Key verified on server');
            }
          }

          if (shouldPublish) {
            // Re-publish the key
            const response = await fetch('/api/chat/keys', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ publicKey: keys.publicKey }),
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ error: response.statusText }));
              console.error('[Sodium] Failed to re-publish key:', errorData);
              throw new Error(`Failed to re-publish key: ${errorData.error || response.statusText}`);
            }

            console.log('[Sodium] Key re-published successfully');
          }
        }

        keysRef.current = keys;
        setIsReady(true);
        setStatus('ready');
      } catch (error) {
        console.error('[Sodium] Initialization failed:', error);
        setStatus('error');
      }
    };

    init();
  }, [user?.id, user?.did, isIdentityUnlocked]);

  const sendMessage = useCallback(async (
    recipientDid: string,
    message: string,
    recipientHandle?: string
  ): Promise<void> => {
    if (!keysRef.current || !isReady || !user?.id) {
      throw new Error('Sodium not ready');
    }

    try {
      // Fetch recipient's public key
      console.log('[Sodium] Fetching recipient public key for:', recipientDid);
      let response = await fetch(`/api/chat/keys?did=${encodeURIComponent(recipientDid)}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error('[Sodium] Failed to fetch recipient keys:', errorData);
        throw new Error(`Failed to fetch recipient keys: ${errorData.error || response.statusText}`);
      }

      const { publicKey: recipientPublicKey } = await response.json();
      console.log('[Sodium] Got recipient public key:', recipientPublicKey ? 'YES' : 'NO');

      if (!recipientPublicKey) {
        throw new Error('Recipient has no public key');
      }

      // Encrypt message
      console.log('[Sodium] Encrypting message...');
      const encrypted = await SodiumChat.encryptMessage(
        message,
        recipientPublicKey,
        keysRef.current.privateKey
      );

      // Send to server
      console.log('[Sodium] Sending encrypted message to server...');
      response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientDid,
          senderPublicKey: keysRef.current.publicKey,
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
          recipientHandle,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error('[Sodium] Failed to send message:', errorData);
        throw new Error(`Failed to send message: ${errorData.error || response.statusText}`);
      }

      console.log('[Sodium] Message sent successfully');
    } catch (error) {
      console.error('[Sodium] Send failed:', error);
      throw error;
    }
  }, [isReady, user?.id]);

  const decryptMessage = useCallback(async (
    ciphertext: string,
    nonce: string,
    senderPublicKey: string
  ): Promise<string> => {
    if (!keysRef.current || !isReady) {
      throw new Error('Sodium not ready');
    }

    try {
      const plaintext = await SodiumChat.decryptMessage(
        ciphertext,
        nonce,
        senderPublicKey,
        keysRef.current.privateKey
      );

      return plaintext;
    } catch (error) {
      console.error('[Sodium] Decryption failed:', error);
      throw error;
    }
  }, [isReady]);

  return {
    isReady,
    status,
    sendMessage,
    decryptMessage,
  };
}
