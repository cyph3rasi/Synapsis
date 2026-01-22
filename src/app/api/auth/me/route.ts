import { NextResponse } from 'next/server';
import { getSession, requireAuth } from '@/lib/auth';
import { db, users } from '@/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updateProfileSchema = z.object({
    displayName: z.string().min(1).max(50).optional(),
    bio: z.string().max(160).optional().nullable(),
    avatarUrl: z.string().url().optional().nullable(),
    headerUrl: z.string().url().optional().nullable(),
    website: z.string().url().or(z.string().length(0)).optional().nullable(),
});

export async function GET() {
    try {
        // Return null user if no database is connected (for UI testing)
        if (!db) {
            return NextResponse.json({ user: null });
        }

        const session = await getSession();

        if (!session) {
            return NextResponse.json({ user: null });
        }

        return NextResponse.json({
            user: {
                id: session.user.id,
                handle: session.user.handle,
                displayName: session.user.displayName,
                avatarUrl: session.user.avatarUrl,
                bio: session.user.bio,
                website: session.user.website,
            },
        });
    } catch (error) {
        console.error('Session check error:', error);
        return NextResponse.json({ user: null });
    }
}

export async function PATCH(request: Request) {
    try {
        if (!db) {
            return NextResponse.json({ error: 'Database not available' }, { status: 503 });
        }

        const currentUser = await requireAuth();
        const body = await request.json();
        const data = updateProfileSchema.parse(body);

        const updateData: {
            displayName?: string;
            bio?: string | null;
            avatarUrl?: string | null;
            headerUrl?: string | null;
            website?: string | null;
            updatedAt?: Date;
        } = {};

        if (data.displayName !== undefined) updateData.displayName = data.displayName;
        if (data.bio !== undefined) updateData.bio = data.bio === '' ? null : data.bio;
        if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl === '' ? null : data.avatarUrl;
        if (data.headerUrl !== undefined) updateData.headerUrl = data.headerUrl === '' ? null : data.headerUrl;
        if (data.website !== undefined) updateData.website = data.website === '' ? null : data.website;

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({
                user: {
                    id: currentUser.id,
                    handle: currentUser.handle,
                    displayName: currentUser.displayName,
                    avatarUrl: currentUser.avatarUrl,
                    bio: currentUser.bio,
                    headerUrl: currentUser.headerUrl,
                    website: currentUser.website,
                    followersCount: currentUser.followersCount,
                    followingCount: currentUser.followingCount,
                    postsCount: currentUser.postsCount,
                    createdAt: currentUser.createdAt,
                },
            });
        }

        updateData.updatedAt = new Date();

        const [updatedUser] = await db.update(users)
            .set(updateData)
            .where(eq(users.id, currentUser.id))
            .returning();

        return NextResponse.json({
            user: {
                id: updatedUser.id,
                handle: updatedUser.handle,
                displayName: updatedUser.displayName,
                avatarUrl: updatedUser.avatarUrl,
                bio: updatedUser.bio,
                headerUrl: updatedUser.headerUrl,
                website: updatedUser.website,
                followersCount: updatedUser.followersCount,
                followingCount: updatedUser.followingCount,
                postsCount: updatedUser.postsCount,
                createdAt: updatedUser.createdAt,
            },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
        }
        if (error instanceof Error && error.message === 'Authentication required') {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        console.error('Profile update error:', error);
        return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }
}
