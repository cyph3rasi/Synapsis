
/**
 * Synapsis Secure Chat Storage
 * 
 * Manages persistence of sensitive chat keys (X25519) and ratchet state.
 * Uses IndexedDB, but all values are AES-GCM encrypted using a key derived 
 * from the user's login password.
 */

import { hkdf, encrypt, decrypt, exportKey, importX25519PrivateKey, KeyPair, arrayBufferToBase64, base64ToArrayBuffer } from './e2ee';

const DB_NAME = 'SynapsisChat';
const DB_VERSION = 1;
const STORE_NAME = 'secure_store';

// In-memory cache of the storage key (derived from password)
let storageKey: ArrayBuffer | null = null;
let dbInstance: IDBDatabase | null = null;

// ----------------------------------------------------------------------------
// 1. Initialization
// ----------------------------------------------------------------------------

/**
 * Initialize storage with user password.
 * Derives a dedicated storage key.
 */
export async function unlockChatStorage(password: string, userId: string): Promise<void> {
    // 1. Derive Storage Key
    // We use the userId as salt to ensure uniqueness per user
    const encoder = new TextEncoder();
    const masterKeyMaterial = encoder.encode(password);
    const salt = encoder.encode(`synapsis_chat_storage_${userId}`);

    storageKey = await hkdf(
        salt,
        masterKeyMaterial,
        encoder.encode('SynapsisChatPersistence'),
        32 // 256-bit AES key
    );

    // 2. Open DB
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME); // Key-Value store
            }
        };

        request.onsuccess = (event) => {
            dbInstance = (event.target as IDBOpenDBRequest).result;
            resolve();
        };

        request.onerror = () => reject('Failed to open IndexedDB');
    });
}

export function isStorageUnlocked(): boolean {
    return storageKey !== null && dbInstance !== null;
}

export function lockStorage() {
    storageKey = null;
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
    }
}

// ----------------------------------------------------------------------------
// 2. Safe Usage Wrappers
// ----------------------------------------------------------------------------

async function setItem(key: string, value: string): Promise<void> {
    if (!dbInstance) throw new Error('Database locked');

    return new Promise((resolve, reject) => {
        const tx = dbInstance!.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function getItem(key: string): Promise<string | undefined> {
    if (!dbInstance) throw new Error('Database locked');
    return new Promise((resolve, reject) => {
        const tx = dbInstance!.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function deleteItem(key: string): Promise<void> {
    if (!dbInstance) throw new Error('Database locked');
    return new Promise((resolve, reject) => {
        const tx = dbInstance!.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// ----------------------------------------------------------------------------
// 3. Encrypted Read/Write
// ----------------------------------------------------------------------------

/**
 * Stores a serializable object encrypted.
 */
export async function storeEncrypted(key: string, data: any): Promise<void> {
    if (!storageKey) throw new Error('Storage locked');

    const json = JSON.stringify(data);
    const encrypted = await encrypt(storageKey, json);

    // Store as stringified JSON wrapper
    const storedValue = JSON.stringify(encrypted);
    await setItem(key, storedValue);
}

/**
 * Retrieves and decrypts an object.
 */
export async function loadEncrypted<T>(key: string): Promise<T | null> {
    if (!storageKey) throw new Error('Storage locked');

    const raw = await getItem(key);
    if (!raw) return null;

    try {
        const { ciphertext, iv } = JSON.parse(raw);
        const json = await decrypt(storageKey, ciphertext, iv);
        return JSON.parse(json) as T;
    } catch (error) {
        console.error(`Failed to decrypt key ${key}:`, error);
        return null;
    }
}

/**
 * Deletes an encrypted item from storage.
 */
export async function deleteEncrypted(key: string): Promise<void> {
    await deleteItem(key);
}

/**
 * Clears all session data (useful for recovery from corruption).
 */
export async function clearAllSessions(): Promise<void> {
    if (!dbInstance) throw new Error('Database locked');
    
    return new Promise((resolve, reject) => {
        const tx = dbInstance!.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.openCursor();
        
        req.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest).result;
            if (cursor) {
                // Only delete session keys, not device keys
                if (cursor.key.toString().startsWith('session:')) {
                    cursor.delete();
                }
                cursor.continue();
            } else {
                resolve();
            }
        };
        
        req.onerror = () => reject(req.error);
    });
}

// ----------------------------------------------------------------------------
// 4. Specific Key Managers
// ----------------------------------------------------------------------------

interface StoredKeyPair {
    pub: string; // Base64 Raw
    priv: string; // Base64 PKCS8
}

export async function storeDeviceKeys(identity: KeyPair, signedPreKey: KeyPair, otks: KeyPair[]) {
    const data = {
        identity: {
            pub: await exportKey(identity.publicKey),
            priv: await exportKey(identity.privateKey)
        },
        signedPreKey: {
            pub: await exportKey(signedPreKey.publicKey),
            priv: await exportKey(signedPreKey.privateKey)
        },
        otks: await Promise.all(otks.map(async k => ({
            pub: await exportKey(k.publicKey),
            priv: await exportKey(k.privateKey)
        })))
    };

    await storeEncrypted('device_keys', data);
}

export async function loadDeviceKeys(): Promise<{ identity: KeyPair, signedPreKey: KeyPair, otks: KeyPair[] } | null> {
    const data = await loadEncrypted<any>('device_keys');
    if (!data) return null;

    // Hydrate keys
    const identity = {
        publicKey: await importX25519PublicKey(data.identity.pub),
        privateKey: await importX25519PrivateKey(data.identity.priv)
    };

    const signedPreKey = {
        publicKey: await importX25519PublicKey(data.signedPreKey.pub),
        privateKey: await importX25519PrivateKey(data.signedPreKey.priv)
    };

    const otks = await Promise.all((data.otks as any[]).map(async k => ({
        publicKey: await importX25519PublicKey(k.pub),
        privateKey: await importX25519PrivateKey(k.priv)
    })));

    return { identity, signedPreKey, otks };
}

// Helper needed to avoid circular dep if importing from e2ee in hydrating
import { importX25519PublicKey } from './e2ee';
