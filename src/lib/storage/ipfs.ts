/**
 * User-Owned Storage (IPFS/Pinata) Utilities
 * 
 * Handles uploads to Pinata using user's own API keys
 */

import { decryptPrivateKey, deserializeEncryptedKey } from '@/lib/crypto/private-key';

export type StorageProvider = 'pinata';

interface StorageUploadResult {
  cid: string;
  url: string;
  gatewayUrl: string;
}

/**
 * Upload a file to user's Pinata account
 */
export async function uploadToPinata(
  file: Buffer,
  apiKey: string,
  filename: string
): Promise<StorageUploadResult> {
  const formData = new FormData();
  // Create Blob from Buffer - using ArrayBuffer view
  const blob = new Blob([file as unknown as BlobPart]);
  formData.append('file', blob, filename);
  
  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Pinata upload failed: ${error}`);
  }

  const data = await response.json();
  const cid = data.IpfsHash;
  
  if (!cid) {
    throw new Error('No CID returned from Pinata');
  }

  return {
    cid,
    url: `ipfs://${cid}`,
    gatewayUrl: `https://gateway.pinata.cloud/ipfs/${cid}`,
  };
}

/**
 * Upload file using user's configured storage provider
 */
export async function uploadToUserStorage(
  file: Buffer,
  filename: string,
  provider: StorageProvider,
  encryptedApiKey: string,
  password: string
): Promise<StorageUploadResult> {
  // Decrypt the storage API key
  const decryptedKey = decryptPrivateKey(
    deserializeEncryptedKey(encryptedApiKey),
    password
  );

  switch (provider) {
    case 'pinata':
      return uploadToPinata(file, decryptedKey, filename);
    default:
      throw new Error(`Unknown storage provider: ${provider}`);
  }
}

/**
 * Generate and upload avatar to user's Pinata storage
 */
export async function generateAndUploadAvatarToUserStorage(
  handle: string,
  apiKey: string
): Promise<string | null> {
  try {
    // 1. Fetch the avatar from DiceBear
    const dicebearUrl = `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${handle}`;
    const response = await fetch(dicebearUrl);

    if (!response.ok) {
      console.error(`Failed to fetch avatar from DiceBear: ${response.statusText}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Upload to user's Pinata
    const result = await uploadToPinata(buffer, apiKey, `${handle}-avatar.svg`);

    return result.url; // ipfs://cid format

  } catch (error) {
    console.error('Error generating/uploading avatar:', error);
    return null;
  }
}

/**
 * Get public gateway URL for an IPFS CID
 */
export function getIPFSGatewayUrl(cid: string, preferredGateway?: string): string {
  // Use preferred gateway or fallback to public ones
  const gateway = preferredGateway || 'https://ipfs.io/ipfs';
  return `${gateway}/${cid}`;
}

/**
 * Extract CID from ipfs:// URL or return the CID
 */
export function extractCID(urlOrCid: string): string {
  if (urlOrCid.startsWith('ipfs://')) {
    return urlOrCid.replace('ipfs://', '');
  }
  // Handle gateway URLs
  const match = urlOrCid.match(/\/ipfs\/(Qm[a-zA-Z0-9]+|bafy[a-zA-Z0-9]+)/);
  if (match) {
    return match[1];
  }
  return urlOrCid;
}
