import { NextResponse } from 'next/server';
import { registerUser, createSession } from '@/lib/auth';
import { db, nodes, users } from '@/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const registerSchema = z.object({
    handle: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
    email: z.string().email(),
    password: z.string().min(8),
    displayName: z.string().optional(),
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const data = registerSchema.parse(body);

        const user = await registerUser(
            data.handle,
            data.email,
            data.password,
            data.displayName
        );

        // Check if this is an NSFW node and auto-enable NSFW settings
        const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';
        const node = await db.query.nodes.findFirst({
            where: eq(nodes.domain, nodeDomain),
        });

        if (node?.isNsfw) {
            // Auto-enable NSFW viewing and mark account as NSFW for users on NSFW nodes
            await db.update(users)
                .set({ 
                    nsfwEnabled: true,
                    isNsfw: true 
                })
                .where(eq(users.id, user.id));
        }

        // Create session for new user
        await createSession(user.id);

        return NextResponse.json({
            success: true,
            user: {
                id: user.id,
                handle: user.handle,
                displayName: user.displayName,
            },
        });
    } catch (error) {
        console.error('Registration error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid input', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Registration failed' },
            { status: 400 }
        );
    }
}
