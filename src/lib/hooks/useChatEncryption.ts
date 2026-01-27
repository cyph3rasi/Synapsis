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

      // Encrypt private key with password for server backup
      const encryptedPrivateKey = await encryptPrivateKeyWithPassword(privateKey, password);

      // Store private key locally (NEVER sent unencrypted to server)
      localStorage.setItem(PRIVATE_KEY_STORAGE, privateKey);
      localStorage.setItem(PUBLIC_KEY_STORAGE, publicKey);

      // Register public key + encrypted private key backup with server
      const response = await fetch('/api/chat/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chatPublicKey: publicKey,
          chatPrivateKeyEncrypted: encryptedPrivateKey,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to register chat keys');
      }

      setKeys({ publicKey, privateKey });
      setNeedsPasswordToRestore(false);
      return { publicKey, privateKey };
    } finally {
      setIsRegistering(false);
    }
  }, []);

  // Encrypt a message for a recipient
  const encryptMessage = useCallback(async (
    message: string,
    recipientPublicKey: string
  ): Promise<string> => {
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
    if (!keys?.privateKey) {
      throw new Error('No chat keys available');
    }

    const myPrivateKey = await importPrivateKey(keys.privateKey);
    const theirPublicKey = await importPublicKey(senderPublicKey);
    const sharedKey = await deriveSharedKey(myPrivateKey, theirPublicKey);

    const combined = base64ToBuffer(encryptedMessage);
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      sharedKey,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
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
  const keyBuffer = base64ToBuffer(publicKeyBase64);
  return window.crypto.subtle.importKey(
    'spki',
    keyBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
}

async function importPrivateKey(privateKeyBase64: string): Promise<CryptoKey> {
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
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
