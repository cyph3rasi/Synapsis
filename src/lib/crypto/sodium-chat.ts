/**
 * Libsodium E2EE Chat Implementation
 * Keys stored encrypted in IndexedDB using storage key from identity unlock
 */

import sodium from 'libsodium-wrappers-sumo';

let sodiumReady = false;

const DB_NAME = 'synapsis_chat';
const DB_VERSION = 1;
const STORE_NAME = 'chat_keys';

/**
 * Initialize libsodium (must be called before any crypto operations)
 */
export async function initSodium() {
  if (sodiumReady) return;
  await sodium.ready;
  sodiumReady = true;
}

/**
 * Open IndexedDB
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Generate a new key pair for chat encryption
 */
export async function generateChatKeyPair(): Promise<{
  publicKey: string; // base64
  privateKey: string; // base64
}> {
  await initSodium();
  
  const keyPair = sodium.crypto_box_keypair();
  
  return {
    publicKey: sodium.to_base64(keyPair.publicKey),
    privateKey: sodium.to_base64(keyPair.privateKey),
  };
}

/**
 * Encrypt a message for a recipient
 */
export async function encryptMessage(
  message: string,
  recipientPublicKey: string, // base64
  senderPrivateKey: string // base64
): Promise<{
  ciphertext: string; // base64
  nonce: string; // base64
}> {
  await initSodium();
  
  const messageBytes = sodium.from_string(message);
  const recipientPubKey = sodium.from_base64(recipientPublicKey);
  const senderPrivKey = sodium.from_base64(senderPrivateKey);
  
  // Generate random nonce
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  
  // Encrypt
  const ciphertext = sodium.crypto_box_easy(
    messageBytes,
    nonce,
    recipientPubKey,
    senderPrivKey
  );
  
  return {
    ciphertext: sodium.to_base64(ciphertext),
    nonce: sodium.to_base64(nonce),
  };
}

/**
 * Decrypt a message from a sender
 */
export async function decryptMessage(
  ciphertext: string, // base64
  nonce: string, // base64
  senderPublicKey: string, // base64
  recipientPrivateKey: string // base64
): Promise<string> {
  await initSodium();
  
  const ciphertextBytes = sodium.from_base64(ciphertext);
  const nonceBytes = sodium.from_base64(nonce);
  const senderPubKey = sodium.from_base64(senderPublicKey);
  const recipientPrivKey = sodium.from_base64(recipientPrivateKey);
  
  // Decrypt
  const decrypted = sodium.crypto_box_open_easy(
    ciphertextBytes,
    nonceBytes,
    senderPubKey,
    recipientPrivKey
  );
  
  return sodium.to_string(decrypted);
}

/**
 * Store keys in IndexedDB (encrypted with storage key from memory)
 */
export async function storeKeys(
  userId: string, 
  publicKey: string, 
  privateKey: string, 
  storageKey: Uint8Array
): Promise<void> {
  await initSodium();
  
  // Generate random nonce
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  
  // Encrypt private key with storage key
  const privateKeyBytes = sodium.from_string(privateKey);
  const ciphertext = sodium.crypto_secretbox_easy(privateKeyBytes, nonce, storageKey);
  
  // Combine nonce + ciphertext
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, nonce.length);
  
  // Store in IndexedDB
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  
  await new Promise<void>((resolve, reject) => {
    const request = store.put({
      publicKey,
      encryptedPrivateKey: sodium.to_base64(combined)
    }, userId);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  
  db.close();
}

/**
 * Retrieve keys from IndexedDB (decrypt with storage key from memory)
 */
export async function getStoredKeys(
  userId: string, 
  storageKey: Uint8Array
): Promise<{ publicKey: string; privateKey: string } | null> {
  await initSodium();
  
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    const data = await new Promise<any>((resolve, reject) => {
      const request = store.get(userId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    db.close();
    
    if (!data) {
      console.log('[Sodium] No stored keys found in IndexedDB for user:', userId);
      return null;
    }
    
    console.log('[Sodium] Found stored keys in IndexedDB, attempting to decrypt...');
    
    const { publicKey, encryptedPrivateKey } = data;
    
    // Extract nonce and ciphertext
    const combined = sodium.from_base64(encryptedPrivateKey);
    const nonce = combined.slice(0, sodium.crypto_secretbox_NONCEBYTES);
    const ciphertext = combined.slice(sodium.crypto_secretbox_NONCEBYTES);
    
    // Decrypt with storage key
    const decrypted = sodium.crypto_secretbox_open_easy(ciphertext, nonce, storageKey);
    const privateKey = sodium.to_string(decrypted);
    
    console.log('[Sodium] Successfully decrypted stored keys');
    return { publicKey, privateKey };
  } catch (error) {
    console.error('[Sodium] Failed to decrypt stored keys - storage key mismatch?', error);
    return null;
  }
}

/**
 * Clear stored keys from IndexedDB
 */
export async function clearStoredKeys(userId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(userId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    db.close();
  } catch (error) {
    console.error('[Sodium] Failed to clear keys:', error);
  }
}
