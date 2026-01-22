import { NextResponse } from 'next/server';
import { registerUser, createSession } from '@/lib/auth';
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
