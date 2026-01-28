
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  unlockChatStorage,
  loadDeviceKeys,
  storeDeviceKeys,
  isStorageUnlocked,
  storeEncrypted,
  loadEncrypted
} from '@/lib/crypto/chat-storage';
import {
  generateX25519KeyPair,
  generateX25519KeyPair as generatePreKey,
  exportKey,
  importX25519PublicKey,
  importX25519PrivateKey // Needed?
} from '@/lib/crypto/e2ee';
import {
  initSender,
  initReceiver,
  ratchetEncrypt,
  ratchetDecrypt,
  x3dhSender,
  x3dhReceiver,
  RatchetState
} from '@/lib/crypto/ratchet';
import { useUserIdentity } from './useUserIdentity';
import { v4 as uuidv4 } from 'uuid';

// Helper to check signature (we trust server for V2.1 baseline usually, but client check is better)
// import { verifyUserAction } from '...'; // Client side verification lib?

export function useChatEncryption() {
  const { signUserAction, identity } = useUserIdentity();
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState<string>('idle');

  // Session Cache (In-Memory)
  const sessionsRef = useRef<Map<string, RatchetState>>(new Map());

  const [isLocked, setIsLocked] = useState(false);

  // Auto-detect if storage is unlocked (by AuthContext)
  useEffect(() => {
    if (isReady) {
      setIsLocked(false);
      return;
    }

    const check = async () => {
      const unlocked = isStorageUnlocked();
      setIsLocked(!unlocked);

      if (unlocked) {
        try {
          const keys = await loadDeviceKeys();
          if (keys) {
            // Keys exist locally.
            setIsReady(true);
            setStatus('ready');

            // CRITICAL REPAIR:
            // Just because we have keys doesn't mean the server does.
            // We run a non-blocking check to ensure we aren't a "Zombie".
            // We only do this check if we haven't verified it this session yet.
            if (identity?.did && !sessionStorage.getItem('synapsis_keys_verified')) {
              fetch(`/.well-known/synapsis/chat/${identity.did}`).then(async (res) => {
                if (res.status === 404) {
                  console.warn('[Chat] Zombie State Detected during init. Republishing keys...');
                  // Extract publish logic (duplicated for now to ensure safety without massive refactor)
                  try {
                    const deviceId = localStorage.getItem('synapsis_device_id') || uuidv4();
                    const bundlePayload = {
                      deviceId,
                      identityKey: await exportKey(keys.identity.publicKey),
                      signedPreKey: { id: 1, key: await exportKey(keys.signedPreKey.publicKey) },
                      oneTimeKeys: await Promise.all(keys.otks.map(async (k: any, i: number) => ({ id: 100 + i, key: await exportKey(k.publicKey) })))
                    };
                    const signedAction = await signUserAction('chat.keys.publish', bundlePayload);
                    await fetch('/api/chat/keys', { method: 'POST', body: JSON.stringify(signedAction) });
                    console.log('[Chat] Self-repair successful.');
                    sessionStorage.setItem('synapsis_keys_verified', 'true');
                  } catch (e) {
                    console.error('[Chat] Self-repair failed:', e);
                  }
                } else if (res.ok) {
                  sessionStorage.setItem('synapsis_keys_verified', 'true');
                }
              }).catch(e => console.error('Verification check failed', e));
            }

          } else if (status === 'idle' && identity?.did) {
            // Keys missing but storage unlocked (and we have identity).
            // Attempt to generate/restore keys.
            console.log('[Chat] Storage unlocked but keys missing. Attempting generation...');
            ensureReady('ALREADY_UNLOCKED', 'placeholder-user-id').catch(err => {
              console.error('[Chat] Auto-generation failed:', err);
            });
          }
        } catch (e) {
          console.error("Auto-ready check failed", e);
        }
      }
    };

    check(); // Checks immediately
    const interval = setInterval(check, 1000); // And polls
    return () => clearInterval(interval);
  }, [isReady, identity, status, signUserAction]);

  // ... (ensureReady, sendMessage, decryptMessage) ...



  const ensureReady = useCallback(async (password: string, userId: string) => {
    setStatus('initializing');
    try {
      if (!isStorageUnlocked()) {
        await unlockChatStorage(password, userId);
      }
      let keys = await loadDeviceKeys();

      // Helper to publish keys
      const publishKeys = async (k: any) => {
        const deviceId = localStorage.getItem('synapsis_device_id') || uuidv4();
        if (!localStorage.getItem('synapsis_device_id')) {
          localStorage.setItem('synapsis_device_id', deviceId);
        }

        const bundlePayload = {
          deviceId,
          identityKey: await exportKey(k.identity.publicKey),
          signedPreKey: {
            id: 1,
            key: await exportKey(k.signedPreKey.publicKey),
          },
          oneTimeKeys: await Promise.all(k.otks.map(async (ko: any, i: number) => ({
            id: 100 + i,
            key: await exportKey(ko.publicKey)
          })))
        };

        const signedAction = await signUserAction('chat.keys.publish', bundlePayload);

        const res = await fetch('/api/chat/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(signedAction)
        });

        if (!res.ok) throw new Error('Failed to publish keys');
        console.log('[Chat] Keys published successfully');
      };

      if (!keys) {
        setStatus('generating_keys');
        const identityKey = await generateX25519KeyPair();
        const signedPreKey = await generatePreKey();
        const otks = await Promise.all(Array.from({ length: 5 }).map(() => generatePreKey()));

        keys = { identity: identityKey, signedPreKey, otks };
        await storeDeviceKeys(identityKey, signedPreKey, otks);
        await publishKeys(keys);
      } else {
        // Self-Repair: Check if server actually has our keys. 
        // If the user is in a "Zombie State" (local keys but server 404), we must republish.
        try {
          // Check only if we have a DID
          if (identity?.did) {
            const checkRes = await fetch(`/.well-known/synapsis/chat/${identity.did}`);
            if (checkRes.status === 404) {
              console.warn('[Chat] Detected Zombie State: Local keys exist but server returned 404. Republishing...');
              await publishKeys(keys);
            } else {
              // Also check if OUR deviceId is in the bundle list? 
              // For now, 404 check is the critical fix for the reported issue.
            }
          }
        } catch (repairErr) {
          console.error('[Chat] Self-repair check failed:', repairErr);
        }
      }

      // Restore session cache? 
      // Ideally load all sessions? Lazy load is better.

      setIsReady(true);
      setStatus('ready');
    } catch (error) {
      console.error('Chat init failed:', error);
      setStatus('error');
      throw error;
    }
  }, [signUserAction]);

  const sendMessage = useCallback(async (recipientDid: string, content: string, nodeDomain?: string, recipientHandle?: string) => {
    if (!isReady || !identity) throw new Error('Chat not ready');

    // 1. Fetch Recipient Bundles (via Proxy to avoid CORS)
    // We use our own server to fetch the keys from the remote node.
    let proxyUrl = `/api/chat/keys/fetch?did=${encodeURIComponent(recipientDid)}`;
    if (nodeDomain) {
      proxyUrl += `&nodeDomain=${encodeURIComponent(nodeDomain)}`;
    }
    if (recipientHandle) {
      proxyUrl += `&handle=${encodeURIComponent(recipientHandle)}`;
    }

    let bundles: any[];
    try {
      console.log(`[Chat] Fetching keys via proxy: ${proxyUrl}`);
      const res = await fetch(proxyUrl);
      if (!res.ok) {
        const data = await res.json();
        console.error(`[Chat] Bundle fetch failed (${res.status}):`, data);
        throw new Error(`Recipient keys not found (Status: ${res.status})`);
      }
      bundles = await res.json();
    } catch (err: any) {
      console.error(`[Chat] Network error fetching bundles:`, err);
      throw new Error(`Failed to resolve recipient keys: ${err.message}`);
    }


    const localDeviceId = localStorage.getItem('synapsis_device_id');
    if (!localDeviceId) throw new Error('No local device ID');

    const localKeys = await loadDeviceKeys();
    if (!localKeys) throw new Error('Keys lost');

    // 2. Loop through all devices
    for (const bundle of bundles) {
      // IMPORTANT: Use the DID from the bundle! 
      // This handles the "Aliasing" case where we asked for did:synapsis but got did:web keys.
      // The session should be bound to the DID that signed the keys.
      const targetDid = bundle.did || recipientDid;

      const sessionKey = `session:${targetDid}:${bundle.deviceId}`;

      let state = sessionsRef.current.get(sessionKey);
      if (!state) {
        state = await loadEncrypted<RatchetState>(sessionKey) || undefined;
      }

      let headerData: any = null;

      if (!state) {
        // X3DH Init
        const remoteIdentityKey = await importX25519PublicKey(bundle.identityKey);
        const remoteSignedPreKey = await importX25519PublicKey(bundle.signedPreKey.key);
        const otk = bundle.oneTimeKeys[0];
        const remoteOtk = otk ? await importX25519PublicKey(otk.key) : undefined;

        const { sk, ephemeralKey } = await x3dhSender(
          localKeys.identity,
          { identityKey: remoteIdentityKey, signedPreKey: remoteSignedPreKey, oneTimeKey: remoteOtk },
          `SynapsisV2${[identity.did, targetDid].sort().join('')}${[localDeviceId, bundle.deviceId].sort().join('')}`
        );

        state = await initSender(sk, remoteSignedPreKey);

        headerData = {
          ik: await exportKey(localKeys.identity.publicKey),
          ek: await exportKey(ephemeralKey.publicKey),
          spkId: bundle.signedPreKey.id,
          opkId: otk?.id
        };
      }

      const { ciphertext, newState } = await ratchetEncrypt(state, content);

      sessionsRef.current.set(sessionKey, newState);
      await storeEncrypted(sessionKey, newState);

      // Payload
      const payload = {
        recipientDid,
        recipientDeviceId: bundle.deviceId,
        senderDeviceId: localDeviceId, // V2.1 Addition
        ciphertext: ciphertext.ciphertext,
        header: headerData ? { ...headerData, ...ciphertext.header } : ciphertext.header,
        iv: ciphertext.iv
      };

      const fullData = {
        recipientDid,
        recipientDeviceId: bundle.deviceId,
        ciphertext: JSON.stringify(payload)
      };

      const action = await signUserAction('chat.deliver', fullData);

      await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action)
      });
    }

  }, [isReady, identity, signUserAction]);

  /**
   * Decrypt and verify an incoming envelope
   */
  const decryptMessage = useCallback(async (envelope: any) => {
    if (!isReady || !identity) return '[Chat not ready]';

    try {
      // 1. Check Envelope Structure
      // Envelope is SignedAction.
      // We assume signature verified by server/trusted for now (TODO: Client verify)

      const { did: senderDid, data } = envelope;
      const payloadString = data.ciphertext; // inner JSON payload

      if (!payloadString) return '[Legacy Message]'; // Fail gracefully

      const payload = JSON.parse(payloadString);
      const { recipientDeviceId, senderDeviceId, ciphertext, header, iv } = payload;

      const localDeviceId = localStorage.getItem('synapsis_device_id');
      if (recipientDeviceId !== localDeviceId) return `[Message for device ${recipientDeviceId.slice(0, 4)}...]`;

      // 2. Load Session
      const sessionKey = `session:${senderDid}:${senderDeviceId}`;
      let state = sessionsRef.current.get(sessionKey);
      if (!state) {
        state = await loadEncrypted<RatchetState>(sessionKey) || undefined;
      }

      // 3. X3DH Receiver Init if needed
      if (!state) {
        // If it's a new session, headers MUST contain X3DH info (ik, ek, spkId, opkId)
        if (!header.ik || !header.ek) return '[Invalid Init Header]';

        const localKeys = await loadDeviceKeys();
        if (!localKeys) return '[Keys locked]';

        // Recover keys
        const senderIdentityKey = await importX25519PublicKey(header.ik);
        const senderEphemeralKey = await importX25519PublicKey(header.ek);

        // Find my used OTK
        // Ideally we consume it and delete it.
        // For now, load it.
        // In V2.1 "chat_one_time_keys" table stores them. BUT we need private key locally.
        // localKeys.otks is array.
        // We find the one with id == header.opkId
        // Caution: types for otks is Array<KeyPair>. ID is assumed sequential/mapped?
        // In generation I assigned arbitrary IDs.
        // Re-check generation: `id: 100 + i`.
        // I need to map ID to private key.
        // In `storeDeviceKeys` I stored them as array.
        // I need to match valid key.

        let myOtk: any = undefined;
        if (header.opkId) {
          // Find index? ID 100 -> index 0?
          const index = header.opkId - 100;
          if (index >= 0 && index < localKeys.otks.length) {
            myOtk = localKeys.otks[index];
          }
        }

        const sk = await x3dhReceiver(
          localKeys.identity,
          localKeys.signedPreKey,
          myOtk,
          senderIdentityKey,
          senderEphemeralKey,
          `SynapsisV2${[senderDid, identity.did].sort().join('')}${[senderDeviceId, localDeviceId].sort().join('')}`
        );

        state = await initReceiver(sk, localKeys.signedPreKey); // Using SPK pair as initial
      }

      // 4. Decrypt
      // Reconstruct CiphertextMessage
      const msgStruct: any = {
        header: header, // contains dh, pn, n
        ciphertext: ciphertext,
        iv: iv
      };

      const { plaintext, newState } = await ratchetDecrypt(state, msgStruct);

      // 5. Update Session
      sessionsRef.current.set(sessionKey, newState);
      await storeEncrypted(sessionKey, newState);

      return plaintext;

    } catch (e: any) {
      console.error('Decryption failed:', e);
      return `[Decryption Error: ${e.message}]`;
    }
  }, [isReady, identity]);

  return {
    isReady,
    isLocked,
    status,
    ensureReady,
    sendMessage,
    decryptMessage
  };
}
