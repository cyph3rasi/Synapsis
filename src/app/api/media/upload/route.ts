import { NextResponse } from 'next/server';
import { db, media } from '@/db';
import { requireAuth } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export async function POST(request: Request) {
    try {
        const user = await requireAuth();

        const formData = await request.formData();
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

        // Generate unique filename
        const ext = file.name.split('.').pop() || 'jpg';
        const filename = `${randomUUID()}.${ext}`;
        const filepath = join(UPLOAD_DIR, filename);

        // Ensure upload directory exists
        await mkdir(UPLOAD_DIR, { recursive: true });

        // Write file
        const bytes = await file.arrayBuffer();
        await writeFile(filepath, Buffer.from(bytes));

        const url = `/uploads/${filename}`;

        // If database is available, store media record
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
