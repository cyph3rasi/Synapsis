import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const filename = `${uuidv4()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '')}`;

        // S3 Configuration
        const s3 = new S3Client({
            region: process.env.STORAGE_REGION || 'us-east-1',
            endpoint: process.env.STORAGE_ENDPOINT,
            credentials: {
                accessKeyId: process.env.STORAGE_ACCESS_KEY || '',
                secretAccessKey: process.env.STORAGE_SECRET_KEY || '',
            },
            forcePathStyle: true, // Needed for many S3-compatible providers
        });

        const bucket = process.env.STORAGE_BUCKET || 'synapsis';

        await s3.send(new PutObjectCommand({
            Bucket: bucket,
            Key: filename,
            Body: buffer,
            ContentType: file.type,
            ACL: 'public-read', // Depends on bucket policy, but often needed
        }));

        // Construct Public URL
        let url = '';
        if (process.env.STORAGE_PUBLIC_BASE_URL) {
            url = `${process.env.STORAGE_PUBLIC_BASE_URL}/${filename}`;
        } else if (process.env.STORAGE_ENDPOINT) {
            url = `${process.env.STORAGE_ENDPOINT}/${bucket}/${filename}`;
        } else {
            return NextResponse.json({ error: 'Storage not configured - missing STORAGE_PUBLIC_BASE_URL or STORAGE_ENDPOINT' }, { status: 500 });
        }

        return NextResponse.json({ url });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}
