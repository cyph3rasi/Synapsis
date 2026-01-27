/**
 * Private Key Encryption/Decryption
 * 
 * Encrypts user private keys with their password using AES-256-GCM.
 * This ensures server admins cannot read private keys without the user's password.
 */

import * as crypto from 'crypto';

export interface EncryptedPrivateKey {
  encrypted: string;  // Base64 encoded ciphertext + auth tag
  salt: string;       // Base64 encoded salt for PBKDF2
  iv: string;         // Base64 encoded initialization vector
}

/**
 * Encrypt a private key with the user's password
 */
export function encryptPrivateKey(privateKey: string, password: string): EncryptedPrivateKey {
  const salt = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);

  // Derive key from password using PBKDF2
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

  // Encrypt with AES-256-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  // Combine encrypted data with auth tag
  const combined = Buffer.concat([Buffer.from(encrypted, 'base64'), authTag]).toString('base64');

  return {
    encrypted: combined,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
  };
}

/**
 * Decrypt a private key with the user's password
 */
export function decryptPrivateKey(encryptedData: EncryptedPrivateKey, password: string): string {
  const salt = Buffer.from(encryptedData.salt, 'base64');
  const iv = Buffer.from(encryptedData.iv, 'base64');
  const combined = Buffer.from(encryptedData.encrypted, 'base64');

  // Derive key from password
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

  // Split encrypted data and auth tag (auth tag is last 16 bytes)
  const authTag = combined.subarray(combined.length - 16);
  const encryptedContent = combined.subarray(0, combined.length - 16);

  // Decrypt
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedContent);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}

/**
 * Serialize encrypted private key for database storage
 */
export function serializeEncryptedKey(data: EncryptedPrivateKey): string {
  return JSON.stringify(data);
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
    return parsed.encrypted && parsed.salt && parsed.iv;
  } catch {
    return false;
  }
}
