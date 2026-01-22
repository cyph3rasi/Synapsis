import { NextRequest, NextResponse } from 'next/server';
import { db, media } from '@/db';
import { requireAuth } from '@/lib/auth';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export async function POST(req: NextRequest) {
    try {
        const user = await requireAuth();

        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        const altText = (formData.get('alt') as string | null) || null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Validate file type
        if (!ALLOWED_TYPES.includes(file.type)) {
            return NextResponse.json({
                error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP'
            }, { status: 400 });
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({
                error: 'File too large. Maximum size: 10MB'
            }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        // Sanitize filename to be safe for S3 keys
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
            ACL: 'public-read',
        }));

        // Construct Public URL
        let url = '';
        if (process.env.STORAGE_PUBLIC_BASE_URL) {
            url = `${process.env.STORAGE_PUBLIC_BASE_URL}/${filename}`;
        } else {
            url = `${process.env.STORAGE_ENDPOINT}/${bucket}/${filename}`;
        }

        // Store media record
        if (db) {
            const [mediaRecord] = await db.insert(media).values({
                userId: user.id,
                postId: null,
                url,
                altText,
                mimeType: file.type,
                width: 0, // TODO: Get actual dimensions
                height: 0,
            }).returning();

            return NextResponse.json({
                success: true,
                media: mediaRecord,
                url,
            });
        }

        return NextResponse.json({
            success: true,
            url,
        });

    } catch (error) {
        if (error instanceof Error && error.message === 'Authentication required') {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        console.error('Upload error:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}
