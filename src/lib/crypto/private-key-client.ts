/**
 * Private Key Encryption/Decryption (Client-Side)
 * 
 * Client-side version of private key decryption using Web Crypto API.
 * This allows the browser to decrypt the user's private key with their password.
 */

export interface EncryptedPrivateKey {
  encrypted: string;  // Base64 encoded ciphertext + auth tag
  salt: string;       // Base64 encoded salt for PBKDF2
  iv: string;         // Base64 encoded initialization vector
}

/**
 * Decrypt a private key with the user's password (client-side using Web Crypto API)
 */
export async function decryptPrivateKey(encryptedData: string | EncryptedPrivateKey, password: string): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Decryption can only be performed in the browser');
  }

  // Parse encrypted data if it's a string
  const data: EncryptedPrivateKey = typeof encryptedData === 'string' 
    ? JSON.parse(encryptedData) 
    : encryptedData;

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

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
      salt: base64ToBuffer(data.salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  // Decode the combined encrypted data + auth tag
  const combined = base64ToBuffer(data.encrypted);
  
  // Split encrypted data and auth tag (auth tag is last 16 bytes)
  const authTagLength = 16;
  const encryptedContent = combined.slice(0, combined.byteLength - authTagLength);
  const authTag = combined.slice(combined.byteLength - authTagLength);

  // Combine encrypted content and auth tag for AES-GCM
  const ciphertext = new Uint8Array(combined.byteLength);
  ciphertext.set(new Uint8Array(encryptedContent), 0);
  ciphertext.set(new Uint8Array(authTag), encryptedContent.byteLength);

  // Decrypt using AES-256-GCM
  try {
    const decrypted = await window.crypto.subtle.decrypt(
      { 
        name: 'AES-GCM', 
        iv: base64ToBuffer(data.iv),
      },
      aesKey,
      ciphertext
    );

    return decoder.decode(decrypted);
  } catch (error) {
    console.error('[Crypto] Decryption failed:', error);
    throw new Error('Failed to decrypt private key. Incorrect password?');
  }
}

/**
 * Helper: Convert base64 string to ArrayBuffer
 */
function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Deserialize encrypted private key from database
 */
export function deserializeEncryptedKey(serialized: string): EncryptedPrivateKey {
  return JSON.parse(serialized);
}

/**
 * Check if a stored value is an encrypted private key (vs plaintext)
 */
export function isEncryptedPrivateKey(value: string): boolean {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value);
    return !!(parsed.encrypted && parsed.salt && parsed.iv);
  } catch {
    return false;
  }
}
