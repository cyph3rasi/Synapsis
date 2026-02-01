import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

export async function generateAndUploadAvatar(handle: string): Promise<string | null> {
    try {
        // 1. Fetch the avatar from DiceBear (PNG format for better compatibility)
        const dicebearUrl = `https://api.dicebear.com/9.x/bottts-neutral/png?seed=${handle}`;
        const response = await fetch(dicebearUrl);

        if (!response.ok) {
            console.error(`Failed to fetch avatar from DiceBear: ${response.statusText}`);
            return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 2. Upload to S3
        const s3 = new S3Client({
            region: process.env.STORAGE_REGION || 'us-east-1',
            endpoint: process.env.STORAGE_ENDPOINT,
            credentials: {
                accessKeyId: process.env.STORAGE_ACCESS_KEY || '',
                secretAccessKey: process.env.STORAGE_SECRET_KEY || '',
            },
            forcePathStyle: true,
        });

        const bucket = process.env.STORAGE_BUCKET || 'synapsis';
        // Sanitize handle for filename just in case
        const safeHandle = handle.replace(/[^a-zA-Z0-9]/g, '');
        const filename = `${uuidv4()}-${safeHandle}-avatar.png`;

        await s3.send(new PutObjectCommand({
            Bucket: bucket,
            Key: filename,
            Body: buffer,
            ContentType: 'image/png',
            ACL: 'public-read',
        }));

        // 3. Construct Public URL
        let url = '';
        if (process.env.STORAGE_PUBLIC_BASE_URL) {
            url = `${process.env.STORAGE_PUBLIC_BASE_URL}/${filename}`;
        } else if (process.env.STORAGE_ENDPOINT) {
            // Basic fallback construction if base url is not set but endpoint is
            // This assumes path style access is okay if no custom domain
            const endpoint = process.env.STORAGE_ENDPOINT.replace(/\/+$/, '');
            url = `${endpoint}/${bucket}/${filename}`;
        } else {
            console.warn('Storage public URL not configured properly');
            return null;
        }

        return url;

    } catch (error) {
        console.error('Error generating/uploading avatar:', error);
        return null;
    }
}

