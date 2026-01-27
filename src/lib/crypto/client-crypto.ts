/**
 * Client-Side E2E Encryption using Web Crypto API
 * 
 * This runs in the browser. Private keys NEVER leave the client.
 * Uses ECDH for key exchange and AES-GCM for encryption.
 */

// Storage keys
const PRIVATE_KEY_STORAGE = 'synapsis_chat_private_key';
const PUBLIC_KEY_STORAGE = 'synapsis_chat_public_key';

/**
 * Generate a new ECDH key pair for chat
 */
export async function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true, // extractable
    ['deriveKey']
  );

  const publicKeyBuffer = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privateKeyBuffer = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: bufferToBase64(publicKeyBuffer),
    privateKey: bufferToBase64(privateKeyBuffer),
  };
}

/**
 * Store keys in localStorage (encrypted with a passphrase in production)
 */
export function storeKeys(publicKey: string, privateKey: string): void {
  localStorage.setItem(PUBLIC_KEY_STORAGE, publicKey);
  localStorage.setItem(PRIVATE_KEY_STORAGE, privateKey);
}

/**
 * Get stored keys
 */
export function getStoredKeys(): { publicKey: string | null; privateKey: string | null } {
  return {
    publicKey: localStorage.getItem(PUBLIC_KEY_STORAGE),
    privateKey: localStorage.getItem(PRIVATE_KEY_STORAGE),
  };
}

/**
 * Check if chat keys exist
 */
export function hasChatKeys(): boolean {
  const keys = getStoredKeys();
  return !!(keys.publicKey && keys.privateKey);
}

/**
 * Clear stored keys (logout)
 */
export function clearKeys(): void {
  localStorage.removeItem(PUBLIC_KEY_STORAGE);
  localStorage.removeItem(PRIVATE_KEY_STORAGE);
}

/**
 * Import a public key from base64
 */
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

/**
 * Import a private key from base64
 */
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

/**
 * Derive a shared AES key from ECDH
 */
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

/**
 * Encrypt a message for a recipient
 */
export async function encryptMessage(
  message: string,
  myPrivateKeyBase64: string,
  theirPublicKeyBase64: string
): Promise<string> {
  const myPrivateKey = await importPrivateKey(myPrivateKeyBase64);
  const theirPublicKey = await importPublicKey(theirPublicKeyBase64);
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
}

/**
 * Decrypt a message from a sender
 */
export async function decryptMessage(
  encryptedMessage: string,
  myPrivateKeyBase64: string,
  theirPublicKeyBase64: string
): Promise<string> {
  const myPrivateKey = await importPrivateKey(myPrivateKeyBase64);
  const theirPublicKey = await importPublicKey(theirPublicKeyBase64);
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
}

// Utility functions
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
