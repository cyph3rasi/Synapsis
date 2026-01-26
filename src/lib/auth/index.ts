/**
 * Authentication Utilities
 */

import { db, users, sessions } from '@/db';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { generateKeyPair } from '@/lib/activitypub/signatures';
import { cookies } from 'next/headers';
import { upsertHandleEntries } from '@/lib/federation/handles';

const SESSION_COOKIE_NAME = 'synapsis_session';
const SESSION_EXPIRY_DAYS = 30;

/**
 * Hash a password
 */
export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

/**
 * Generate a DID for a new user
 */
export function generateDID(): string {
    // Using a simple did:key-like format for now
    // In production, this would be more sophisticated
    return `did:synapsis:${uuid().replace(/-/g, '')}`;
}

/**
 * Create a new session for a user
 */
export async function createSession(userId: string): Promise<string> {
    const token = uuid();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

    await db.insert(sessions).values({
        userId,
        token,
        expiresAt,
    });

    // Set the session cookie
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        expires: expiresAt,
        path: '/',
    });

    return token;
}

/**
 * Get the current session from cookies
 */
export async function getSession(): Promise<{ user: typeof users.$inferSelect } | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!token) {
        return null;
    }

    const session = await db.query.sessions.findFirst({
        where: eq(sessions.token, token),
        with: {
            user: true,
        },
    });

    if (!session || session.expiresAt < new Date()) {
        return null;
    }

    return { user: session.user };
}

/**
 * Get current user or throw if not authenticated
 */
export async function requireAuth(): Promise<typeof users.$inferSelect> {
    const session = await getSession();

    if (!session) {
        throw new Error('Authentication required');
    }

    return session.user;
}

/**
 * Destroy the current session
 */
export async function destroySession(): Promise<void> {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (token) {
        await db.delete(sessions).where(eq(sessions.token, token));
        cookieStore.delete(SESSION_COOKIE_NAME);
    }
}

/**
 * Register a new user
 */
export async function registerUser(
    handle: string,
    email: string,
    password: string,
    displayName?: string
): Promise<typeof users.$inferSelect> {
    // Validate handle format
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(handle)) {
        throw new Error('Handle must be 3-20 characters, alphanumeric and underscores only');
    }

    // Check if handle is taken
    const existingHandle = await db.query.users.findFirst({
        where: eq(users.handle, handle.toLowerCase()),
    });

    if (existingHandle) {
        throw new Error('Handle is already taken');
    }

    // Check if email is taken
    const existingEmail = await db.query.users.findFirst({
        where: eq(users.email, email.toLowerCase()),
    });

    if (existingEmail) {
        throw new Error('Email is already registered');
    }

    // Generate keys for ActivityPub
    const { publicKey, privateKey } = await generateKeyPair();

    // Create the user
    const did = generateDID();
    const passwordHash = await hashPassword(password);

    const [user] = await db.insert(users).values({
        did,
        handle: handle.toLowerCase(),
        email: email.toLowerCase(),
        passwordHash,
        displayName: displayName || handle,
        publicKey,
        privateKeyEncrypted: privateKey, // TODO: Encrypt with user's password
    }).returning();

    const nodeDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';
    await upsertHandleEntries([{
        handle: user.handle,
        did: user.did,
        nodeDomain,
        updatedAt: new Date().toISOString(),
    }]);

    return user;
}

/**
 * Authenticate a user with email and password
 */
export async function authenticateUser(
    email: string,
    password: string
): Promise<typeof users.$inferSelect> {
    const user = await db.query.users.findFirst({
        where: eq(users.email, email.toLowerCase()),
    });

    if (!user || !user.passwordHash) {
        throw new Error('Invalid email or password');
    }

    const isValid = await verifyPassword(password, user.passwordHash);

    if (!isValid) {
        throw new Error('Invalid email or password');
    }

    return user;
}
