/**
 * HTTP Signatures for ActivityPub
 * 
 * ActivityPub uses HTTP Signatures to verify the authenticity of requests.
 * See: https://docs.joinmastodon.org/spec/security/
 */

import { importPKCS8, importSPKI, SignJWT, jwtVerify } from 'jose';
import * as crypto from 'crypto';

/**
 * Generate a new RSA keypair for an actor
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

/**
 * Sign an HTTP request for ActivityPub
 */
export async function signRequest(
    method: string,
    url: string,
    body: string | null,
    privateKeyPem: string,
    keyId: string
): Promise<Record<string, string>> {
    const urlObj = new URL(url);
    const date = new Date().toUTCString();
    const digest = body ? `SHA-256=${crypto.createHash('sha256').update(body).digest('base64')}` : null;

    // Build the string to sign
    const signedHeaders = body ? '(request-target) host date digest' : '(request-target) host date';
    let stringToSign = `(request-target): ${method.toLowerCase()} ${urlObj.pathname}`;
    stringToSign += `\nhost: ${urlObj.host}`;
    stringToSign += `\ndate: ${date}`;
    if (digest) {
        stringToSign += `\ndigest: ${digest}`;
    }

    // Sign the string
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    const signature = crypto.sign('sha256', Buffer.from(stringToSign), privateKey).toString('base64');

    // Build the signature header
    const signatureHeader = `keyId="${keyId}",algorithm="rsa-sha256",headers="${signedHeaders}",signature="${signature}"`;

    const headers: Record<string, string> = {
        'Date': date,
        'Signature': signatureHeader,
    };

    if (digest) {
        headers['Digest'] = digest;
    }

    return headers;
}

/**
 * Verify an HTTP signature from an incoming request
 */
export async function verifySignature(
    method: string,
    path: string,
    headers: Record<string, string>,
    publicKeyPem: string
): Promise<boolean> {
    try {
        const signatureHeader = headers['signature'] || headers['Signature'];
        if (!signatureHeader) {
            return false;
        }

        // Parse the signature header
        const signatureParts: Record<string, string> = {};
        signatureHeader.split(',').forEach(part => {
            const [key, value] = part.split('=');
            signatureParts[key] = value?.replace(/^"|"$/g, '') ?? '';
        });

        const signedHeadersList = signatureParts.headers?.split(' ') ?? [];
        const signature = signatureParts.signature;

        if (!signature || signedHeadersList.length === 0) {
            return false;
        }

        // Reconstruct the string that was signed
        let stringToVerify = '';
        for (const header of signedHeadersList) {
            if (stringToVerify) {
                stringToVerify += '\n';
            }

            if (header === '(request-target)') {
                stringToVerify += `(request-target): ${method.toLowerCase()} ${path}`;
            } else {
                const headerValue = headers[header] || headers[header.toLowerCase()];
                if (headerValue) {
                    stringToVerify += `${header}: ${headerValue}`;
                }
            }
        }

        // Verify the signature
        const publicKey = crypto.createPublicKey(publicKeyPem);
        const signatureBuffer = Buffer.from(signature, 'base64');

        return crypto.verify(
            'sha256',
            Buffer.from(stringToVerify),
            publicKey,
            signatureBuffer
        );
    } catch (error) {
        console.error('Signature verification failed:', error);
        return false;
    }
}

/**
 * Fetch a remote actor's public key
 */
export async function fetchActorPublicKey(actorUrl: string): Promise<string | null> {
    try {
        const response = await fetch(actorUrl, {
            headers: {
                'Accept': 'application/activity+json, application/ld+json',
            },
        });

        if (!response.ok) {
            return null;
        }

        const actor = await response.json();
        return actor.publicKey?.publicKeyPem ?? null;
    } catch (error) {
        console.error('Failed to fetch actor public key:', error);
        return null;
    }
}
