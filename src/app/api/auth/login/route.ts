import { NextResponse } from 'next/server';
import { authenticateUser, createSession } from '@/lib/auth';
import { z } from 'zod';

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const data = loginSchema.parse(body);

        const user = await authenticateUser(data.email, data.password);

        // Create session
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
        console.error('Login error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid input', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Login failed' },
            { status: 401 }
        );
    }
}
