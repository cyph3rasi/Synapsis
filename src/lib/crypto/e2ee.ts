
/**
 * Synapsis E2EE Cryptography Core
 * 
 * Implements:
 * - X25519 for Key Agreement (ECDH)
 * - AES-GCM-256 for Encryption (Standard WebCrypto replacement for ChaCha20)
 * - HKDF-SHA256 for Key Derivation
 * 
 * Note: Uses WebCrypto API available in Node 19+ and Browsers.
 */

// Universal Crypto Access
const cryptoSubtle = typeof window !== 'undefined'
    ? window.crypto.subtle
    : (globalThis.crypto as any)?.subtle || require('crypto').webcrypto?.subtle;

if (!cryptoSubtle) {
    throw new Error('WebCrypto is not available in this environment');
}

// Types
export interface KeyPair {
    publicKey: CryptoKey;
    privateKey: CryptoKey;
}

export interface PreKeyBundle {
    id: number;
    key: CryptoKey;
    signature?: string; // Base64 ECDSA signature if it's a signed prekey
}

// ----------------------------------------------------------------------------
// 1. Primitives
// ----------------------------------------------------------------------------

/**
 * Generate an X25519 Key Pair
 */
export async function generateX25519KeyPair(): Promise<KeyPair> {
    return await cryptoSubtle.generateKey(
        {
            name: 'X25519',
        },
        true, // extractable
        ['deriveKey', 'deriveBits']
    ) as KeyPair;
}

/**
 * Import an X25519 Public Key from Base64 Raw Bytes (32 bytes)
 */
export async function importX25519PublicKey(base64: string): Promise<CryptoKey> {
    const binary = base64ToArrayBuffer(base64);
    return await cryptoSubtle.importKey(
        'raw',
        binary,
        { name: 'X25519' },
        true,
        []
    );
}

/**
 * Import an X25519 Private Key from Base64 PKCS8/Raw
 * Note: WebCrypto usually exports Private Keys as PKCS8.
 */
export async function importX25519PrivateKey(base64: string): Promise<CryptoKey> {
    const binary = base64ToArrayBuffer(base64);
    // Try PKCS8 first (standard export)
    return await cryptoSubtle.importKey(
        'pkcs8',
        binary,
        { name: 'X25519' },
        false,
        ['deriveKey', 'deriveBits']
    );
}

/**
 * Export Key to Base64 (Raw for Public, PKCS8 for Private)
 */
export async function exportKey(key: CryptoKey): Promise<string> {
    if (key.type === 'public') {
        const raw = await cryptoSubtle.exportKey('raw', key);
        return arrayBufferToBase64(raw);
    } else {
        const pkcs8 = await cryptoSubtle.exportKey('pkcs8', key);
        return arrayBufferToBase64(pkcs8);
    }
}

/**
 * ECDH: Compute Shared Secret
 */
export async function computeSharedSecret(privateKey: CryptoKey, publicKey: CryptoKey): Promise<ArrayBuffer> {
    // We derive bits directly (Commonly 32 bytes for X25519)
    return await cryptoSubtle.deriveBits(
        {
            name: 'X25519',
            public: publicKey,
        },
        privateKey,
        256 // 32 bytes * 8
    );
}

// ----------------------------------------------------------------------------
// 2. KDF (HKDF-SHA256)
// ----------------------------------------------------------------------------

/**
 * HKDF Expand & Extract
 */
export async function hkdf(
    salt: ArrayBuffer | Uint8Array,
    ikm: ArrayBuffer | Uint8Array, // Input Key Material (Shared Secret)
    info: ArrayBuffer | Uint8Array,
    length: number // Bytes output
): Promise<ArrayBuffer> {
    const key = await cryptoSubtle.importKey(
        'raw',
        ikm,
        { name: 'HKDF' },
        false,
        ['deriveBits']
    );

    return await cryptoSubtle.deriveBits(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: salt,
            info: info,
        },
        key,
        length * 8
    );
}

// ----------------------------------------------------------------------------
// 3. Encryption (AES-GCM)
// ----------------------------------------------------------------------------

export async function encrypt(
    keyBytes: ArrayBuffer,
    plaintext: string | Uint8Array,
    associatedData?: Uint8Array
): Promise<{ ciphertext: string; iv: string }> {
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV

    const key = await cryptoSubtle.importKey(
        'raw',
        keyBytes,
        { name: 'AES-GCM' },
        false,
        ['encrypt']
    );

    const data = typeof plaintext === 'string'
        ? new TextEncoder().encode(plaintext)
        : plaintext;

    const encrypted = await cryptoSubtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv,
            additionalData: associatedData
        },
        key,
        data
    );

    return {
        ciphertext: arrayBufferToBase64(encrypted),
        iv: arrayBufferToBase64(iv.buffer)
    };
}

export async function decrypt(
    keyBytes: ArrayBuffer,
    ciphertextBase64: string,
    ivBase64: string,
    associatedData?: Uint8Array
): Promise<string> {
    const key = await cryptoSubtle.importKey(
        'raw',
        keyBytes,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
    );

    const ciphertext = base64ToArrayBuffer(ciphertextBase64);
    const iv = base64ToArrayBuffer(ivBase64);

    try {
        const decrypted = await cryptoSubtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv,
                additionalData: associatedData
            },
            key,
            ciphertext
        );
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        throw new Error('Decryption failed');
    }
}

// ----------------------------------------------------------------------------
// 4. Utils
// ----------------------------------------------------------------------------

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
    // Handle URL safe base64 if needed, but we assume standard
    const binary = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}
