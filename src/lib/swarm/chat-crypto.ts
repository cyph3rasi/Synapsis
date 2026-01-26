/**
 * Swarm Chat Cryptography
 * 
 * End-to-end encryption for chat messages using public key cryptography.
 */

import crypto from 'crypto';

/**
 * Encrypt a message using the recipient's public key
 */
export function encryptMessage(message: string, recipientPublicKey: string): string {
  try {
    // Use RSA-OAEP for encryption
    const encrypted = crypto.publicEncrypt(
      {
        key: recipientPublicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(message, 'utf8')
    );
    
    return encrypted.toString('base64');
  } catch (error) {
    console.error('Failed to encrypt message:', error);
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypt a message using the recipient's private key
 */
export function decryptMessage(encryptedMessage: string, privateKey: string): string {
  try {
    const decrypted = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(encryptedMessage, 'base64')
    );
    
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
