/**
 * End-to-End Encrypted Chat Cryptography
 * 
 * Uses ECDH (Elliptic Curve Diffie-Hellman) for key exchange
 * and AES-GCM for message encryption.
 * 
 * This is a simplified version of the Signal Protocol approach.
 * Private keys NEVER leave the client.
 */

import * as crypto from 'crypto';

/**
 * Generate an ECDH key pair for chat encryption
 * The private key should be stored client-side only
 */
export function generateChatKeyPair(): { publicKey: string; privateKey: string } {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  
  return {
    publicKey: ecdh.getPublicKey('base64'),
    privateKey: ecdh.getPrivateKey('base64'),
  };
}

/**
 * Derive a shared secret from your private key and their public key
 * This is the magic of ECDH - both parties derive the same secret
 */
export function deriveSharedSecret(myPrivateKey: string, theirPublicKey: string): Buffer {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(Buffer.from(myPrivateKey, 'base64'));
  
  const sharedSecret = ecdh.computeSecret(Buffer.from(theirPublicKey, 'base64'));
  
  // Derive a proper AES key from the shared secret using HKDF
  return crypto.createHash('sha256').update(sharedSecret).digest();
}

/**
 * Encrypt a message using the shared secret
 */
export function encryptWithSharedSecret(message: string, sharedSecret: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sharedSecret, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(message, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  
  // Combine: iv (12) + authTag (16) + ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * Decrypt a message using the shared secret
 */
export function decryptWithSharedSecret(encryptedMessage: string, sharedSecret: Buffer): string {
  const combined = Buffer.from(encryptedMessage, 'base64');
  
  const iv = combined.subarray(0, 12);
  const authTag = combined.subarray(12, 28);
  const ciphertext = combined.subarray(28);
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', sharedSecret, iv);
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);
  
  return decrypted.toString('utf8');
}

/**
 * High-level: Encrypt a message for a recipient
 * Uses sender's private key + recipient's public key
 */
export function encryptMessage(
  message: string, 
  senderPrivateKey: string, 
  recipientPublicKey: string
): string {
  const sharedSecret = deriveSharedSecret(senderPrivateKey, recipientPublicKey);
  return encryptWithSharedSecret(message, sharedSecret);
}

/**
 * High-level: Decrypt a message from a sender
 * Uses recipient's private key + sender's public key
 */
export function decryptMessage(
  encryptedMessage: string,
  recipientPrivateKey: string,
  senderPublicKey: string
): string {
  const sharedSecret = deriveSharedSecret(recipientPrivateKey, senderPublicKey);
  return decryptWithSharedSecret(encryptedMessage, sharedSecret);
}
