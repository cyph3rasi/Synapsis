/**
 * Swarm Chat Cryptography
 * 
 * End-to-end encryption for chat messages using hybrid encryption:
 * - AES-256-GCM for message encryption (fast, no size limit)
 * - RSA-OAEP for encrypting the AES key (secure key exchange)
 */

import crypto from 'crypto';

interface EncryptedPayload {
  encryptedKey: string;  // RSA-encrypted AES key (base64)
  iv: string;            // AES initialization vector (base64)
  ciphertext: string;    // AES-encrypted message (base64)
  authTag: string;       // GCM authentication tag (base64)
}

/**
 * Encrypt a message using hybrid encryption (AES + RSA)
 */
export function encryptMessage(message: string, recipientPublicKey: string): string {
  try {
    // Generate a random AES-256 key
    const aesKey = crypto.randomBytes(32);
    
    // Generate a random IV for AES-GCM
    const iv = crypto.randomBytes(12);
    
    // Encrypt the message with AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(message, 'utf8'),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();
    
    // Encrypt the AES key with RSA-OAEP
    const encryptedKey = crypto.publicEncrypt(
      {
        key: recipientPublicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      aesKey
    );
    
    // Package everything together
    const payload: EncryptedPayload = {
      encryptedKey: encryptedKey.toString('base64'),
      iv: iv.toString('base64'),
      ciphertext: encrypted.toString('base64'),
      authTag: authTag.toString('base64'),
    };
    
    return JSON.stringify(payload);
  } catch (error) {
    console.error('Failed to encrypt message:', error);
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypt a message using hybrid encryption (AES + RSA)
 */
export function decryptMessage(encryptedMessage: string, privateKey: string): string {
  try {
    // Parse the encrypted payload
    const payload: EncryptedPayload = JSON.parse(encryptedMessage);
    
    // Decrypt the AES key with RSA
    const aesKey = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(payload.encryptedKey, 'base64')
    );
    
    // Decrypt the message with AES-256-GCM
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      aesKey,
      Buffer.from(payload.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
    
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Failed to decrypt message:', error);
    throw new Error('Decryption failed');
  }
}

/**
 * Sign a message payload for authenticity verification
 */
export function signPayload(payload: string, privateKey: string): string {
  try {
    const sign = crypto.createSign('SHA256');
    sign.update(payload);
    sign.end();
    
    const signature = sign.sign(privateKey, 'base64');
    return signature;
  } catch (error) {
    console.error('Failed to sign payload:', error);
    throw new Error('Signing failed');
  }
}

/**
 * Verify a signed payload
 */
export function verifySignature(payload: string, signature: string, publicKey: string): boolean {
  try {
    const verify = crypto.createVerify('SHA256');
    verify.update(payload);
    verify.end();
    
    return verify.verify(publicKey, signature, 'base64');
  } catch (error) {
    console.error('Failed to verify signature:', error);
    return false;
  }
}
