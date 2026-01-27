'use client';

import { useState, useEffect, useCallback } from 'react';

// Storage keys
const PRIVATE_KEY_STORAGE = 'synapsis_chat_private_key';
const PUBLIC_KEY_STORAGE = 'synapsis_chat_public_key';

interface ChatKeys {
  publicKey: string;
  privateKey: string;
}

interface ServerKeyData {
  chatPublicKey: string | null;
  chatPrivateKeyEncrypted: string | null;
  hasKeys: boolean;
}

/**
 * Hook for managing E2E chat encryption
 * Private keys are encrypted with user's password before server backup
 */
export function useChatEncryption() {
  const [keys, setKeys] = useState<ChatKeys | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [needsPasswordToRestore, setNeedsPasswordToRestore] = useState(false);
  const [serverKeyData, setServerKeyData] = useState<ServerKeyData | null>(null);

  // Check for existing keys on mount
  useEffect(() => {
    // Only run in browser
    if (typeof window === 'undefined') {
      return;
    }
    checkKeys();
  }, []);

  const checkKeys = async () => {
    // First check localStorage
    const publicKey = localStorage.getItem(PUBLIC_KEY_STORAGE);
    const privateKey = localStorage.getItem(PRIVATE_KEY_STORAGE);

    if (publicKey && privateKey) {
      setKeys({ publicKey, privateKey });
      setIsReady(true);
      return;
    }

    // Check if server has encrypted backup
    try {
      const res = await fetch('/api/chat/keys');
      if (res.ok) {
        const data: ServerKeyData = await res.json();
        setServerKeyData(data);

        if (data.hasKeys && data.chatPrivateKeyEncrypted) {
          // Keys exist on server but not locally - need password to restore
          setNeedsPasswordToRestore(true);
        }
      }
    } catch (error) {
      console.error('Failed to check server keys:', error);
    }

    setIsReady(true);
  };

  // Restore keys from server backup using password
  const restoreKeysWithPassword = useCallback(async (password: string): Promise<boolean> => {
    if (!serverKeyData?.chatPrivateKeyEncrypted || !serverKeyData?.chatPublicKey) {
      throw new Error('No keys to restore');
    }

    try {
      // Decrypt the private key using password
      const privateKey = await decryptPrivateKeyWithPassword(
        serverKeyData.chatPrivateKeyEncrypted,
        password
      );

      // Store in localStorage
      localStorage.setItem(PUBLIC_KEY_STORAGE, serverKeyData.chatPublicKey);
      localStorage.setItem(PRIVATE_KEY_STORAGE, privateKey);

      setKeys({ publicKey: serverKeyData.chatPublicKey, privateKey });
      setNeedsPasswordToRestore(false);
      return true;
    } catch (error) {
      console.error('Failed to restore keys:', error);
      return false;
    }
  }, [serverKeyData]);

  // Generate new keys and register with server (encrypted backup)
  const generateAndRegisterKeys = useCallback(async (password: string) => {
    if (typeof window === 'undefined') {
      throw new Error('Key generation can only be performed in the browser');
    }
    setIsRegistering(true);
    try {
      // Generate ECDH key pair using Web Crypto API
      const keyPair = await window.crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveKey']
      );

      const publicKeyBuffer = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
      const privateKeyBuffer = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

      const publicKey = bufferToBase64(publicKeyBuffer);
      const privateKey = bufferToBase64(privateKeyBuffer);

      console.log('[GenerateKeys] Generated keys:', {
        publicKeyLength: publicKey.length,
        privateKeyLength: privateKey.length,
        publicKeyBytes: publicKeyBuffer.byteLength,
        privateKeyBytes: privateKeyBuffer.byteLength
      });

      // Encrypt private key with password for server backup
      const encryptedPrivateKey = await encryptPrivateKeyWithPassword(privateKey, password);

      console.log('[GenerateKeys] Encrypted private key length:', encryptedPrivateKey.length);

      // Register public key + encrypted private key backup with server FIRST
      const response = await fetch('/api/chat/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatPublicKey: publicKey,
          chatPrivateKeyEncrypted: encryptedPrivateKey,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('[GenerateKeys] Server registration failed:', error);
        throw new Error(error.error || 'Failed to register chat keys');
      }

      // Only save to localStorage AFTER server confirms
      localStorage.setItem(PRIVATE_KEY_STORAGE, privateKey);
      localStorage.setItem(PUBLIC_KEY_STORAGE, publicKey);

      setKeys({ publicKey, privateKey });
      setNeedsPasswordToRestore(false);

      console.log('[GenerateKeys] Keys generated and registered successfully');
      return { publicKey, privateKey };
    } catch (error) {
      console.error('[GenerateKeys] Failed:', error);
      throw error;
    } finally {
      setIsRegistering(false);
    }
  }, []);

  // Encrypt a message for a recipient
  const encryptMessage = useCallback(async (
    message: string,
    recipientPublicKey: string
  ): Promise<string> => {
    if (typeof window === 'undefined') {
      throw new Error('Encryption can only be performed in the browser');
    }
    if (!keys?.privateKey) {
      throw new Error('No chat keys available');
    }

    const myPrivateKey = await importPrivateKey(keys.privateKey);
    const theirPublicKey = await importPublicKey(recipientPublicKey);
    const sharedKey = await deriveSharedKey(myPrivateKey, theirPublicKey);

    const encoder = new TextEncoder();
    const messageBytes = encoder.encode(message);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      sharedKey,
      messageBytes
    );

    // Combine iv + ciphertext
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return bufferToBase64(combined.buffer);
  }, [keys]);

  // Decrypt a message from a sender
  const decryptMessage = useCallback(async (
    encryptedMessage: string,
    senderPublicKey: string
  ): Promise<string> => {
    // Early browser check before any operations
    if (typeof window === 'undefined') {
      return '[Decryption only available in browser]';
    }
    
    try {
      if (!keys?.privateKey) {
        console.error('[Decrypt] No private key available');
        return '[No decryption key available]';
      }
      
      if (!senderPublicKey) {
        console.error('[Decrypt] No sender public key provided');
        return '[Sender key missing]';
      }

      const myPrivateKey = await importPrivateKey(keys.privateKey);
      const theirPublicKey = await importPublicKey(senderPublicKey);
      const sharedKey = await deriveSharedKey(myPrivateKey, theirPublicKey);

      const combined = base64ToBuffer(encryptedMessage);

      if (combined.byteLength < 12) {
        throw new Error('Message too short (invalid ciphertext)');
      }

      const iv = combined.slice(0, 12);
      const ciphertext = combined.slice(12);

      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        sharedKey,
        ciphertext
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.warn('[Decrypt] Failed:', error instanceof Error ? error.message : error);
      // Return a descriptive placeholder based on the error
      if (error instanceof Error) {
        if (error.message.includes('public key') || error.message.includes('import key')) {
          return '[Incompatible encryption format]';
        }
        if (error.message.includes('private key')) {
          return '[Invalid private key]';
        }
        if (error.message.includes('base64') || error.message.includes('decode')) {
          return '[Corrupted message data]';
        }
      }
      return '[Cannot decrypt message]';
    }
  }, [keys]);

  // Clear keys (on logout)
  const clearKeys = useCallback(() => {
    localStorage.removeItem(PRIVATE_KEY_STORAGE);
    localStorage.removeItem(PUBLIC_KEY_STORAGE);
    setKeys(null);
  }, []);

  return {
    keys,
    isReady,
    isRegistering,
    hasKeys: !!keys,
    needsPasswordToRestore,
    generateAndRegisterKeys,
    restoreKeysWithPassword,
    encryptMessage,
    decryptMessage,
    clearKeys,
  };
}

// ============================================
// Password-based encryption for private key backup
// ============================================

async function encryptPrivateKeyWithPassword(privateKey: string, password: string): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Encryption can only be performed in the browser');
  }
  
  const encoder = new TextEncoder();
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  // Derive key from password using PBKDF2
  const passwordKey = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const aesKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  // Encrypt the private key
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoder.encode(privateKey)
  );

  // Return as JSON with all components
  return JSON.stringify({
    salt: bufferToBase64(salt.buffer),
    iv: bufferToBase64(iv.buffer),
    ciphertext: bufferToBase64(ciphertext),
  });
}

async function decryptPrivateKeyWithPassword(encryptedData: string, password: string): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Decryption can only be performed in the browser');
  }
  
  const { salt, iv, ciphertext } = JSON.parse(encryptedData);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // Derive key from password
  const passwordKey = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const aesKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: base64ToBuffer(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  // Decrypt
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuffer(iv) },
    aesKey,
    base64ToBuffer(ciphertext)
  );

  return decoder.decode(decrypted);
}

// ============================================
// ECDH Key helpers
// ============================================

async function importPublicKey(publicKeyBase64: string): Promise<CryptoKey> {
  if (typeof window === 'undefined') {
    throw new Error('Crypto operations can only be performed in the browser');
  }
  
  // Validate the key format
  if (!publicKeyBase64 || typeof publicKeyBase64 !== 'string') {
    throw new Error('Invalid public key: must be a non-empty string');
  }
  
  try {
    const keyBuffer = base64ToBuffer(publicKeyBase64);
    
    // Try SPKI format first (standard format, typically ~91 bytes for P-256)
    try {
      return await window.crypto.subtle.importKey(
        'spki',
        keyBuffer,
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        []
      );
    } catch (spkiError) {
      // Try raw format (65 bytes for uncompressed P-256 public key)
      // Raw format is: 0x04 + X coordinate (32 bytes) + Y coordinate (32 bytes)
      if (keyBuffer.byteLength === 65) {
        try {
          return await window.crypto.subtle.importKey(
            'raw',
            keyBuffer,
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            []
          );
        } catch (rawError) {
          // Both formats failed
        }
      }
      
      // If neither worked, throw a descriptive error
      throw new Error(`Cannot import key (${keyBuffer.byteLength} bytes): incompatible format`);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn('[ImportPublicKey] Failed:', errorMsg);
    throw new Error(`Failed to import public key: ${errorMsg}`);
  }
}

async function importPrivateKey(privateKeyBase64: string): Promise<CryptoKey> {
  if (typeof window === 'undefined') {
    throw new Error('Crypto operations can only be performed in the browser');
  }
  const keyBuffer = base64ToBuffer(privateKeyBase64);
  return window.crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey']
  );
}

async function deriveSharedKey(
  myPrivateKey: CryptoKey,
  theirPublicKey: CryptoKey
): Promise<CryptoKey> {
  if (typeof window === 'undefined') {
    throw new Error('Key derivation can only be performed in the browser');
  }
  
  return window.crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ============================================
// Buffer utilities
// ============================================

function bufferToBase64(buffer: ArrayBuffer): string {
  // btoa is available in both browser and Node 16+, but let's be safe
  if (typeof btoa === 'undefined') {
    throw new Error('Base64 encoding not available in this environment');
  }
  
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  // Gracefully handle null/undefined
  if (!base64) return new ArrayBuffer(0);

  // Check for JSON (legacy format)
  if (base64.trim().startsWith('{')) {
    console.warn('[base64ToBuffer] Detected JSON instead of Base64, returning empty buffer');
    throw new Error('Invalid message format: JSON detected');
  }

  // Clean the string: 
  // 1. Remove newlines/tabs (formatting)
  // 2. Replace spaces with '+' (common URL decoding error where + becomes space)
  // 3. Handle URL-safe chars (- -> +, _ -> /)
  const cleaned = base64.replace(/[\n\r\t]/g, '')
    .replace(/ /g, '+')
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  try {
    // atob is available in both browser and Node 16+, but let's be safe
    if (typeof atob === 'undefined') {
      throw new Error('Base64 decoding not available in this environment');
    }
    
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (e) {
    console.error('[base64ToBuffer] Failed to decode base64:', e);
    throw new Error(`Failed to decode base64: ${e instanceof Error ? e.message : String(e)}`);
  }
}
