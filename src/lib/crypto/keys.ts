/**
 * Cryptographic Key Generation
 * 
 * Generates RSA key pairs for signing posts and verifying identity.
 */

import * as crypto from 'crypto';

/**
 * Generate an RSA key pair for signing
 */
export async function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    return new Promise((resolve, reject) => {
        crypto.generateKeyPair(
            'rsa',
            {
                modulusLength: 2048,
                publicKeyEncoding: {
                    type: 'spki',
                    format: 'pem',
                },
                privateKeyEncoding: {
                    type: 'pkcs8',
                    format: 'pem',
                },
            },
            (err, publicKey, privateKey) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({ publicKey, privateKey });
                }
            }
        );
    });
}
