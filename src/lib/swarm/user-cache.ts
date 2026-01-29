import { db, users } from '@/db';
import { eq } from 'drizzle-orm';

export interface RemoteProfile {
    handle: string;
    displayName: string;
    avatarUrl?: string | null;
    did: string;
    isBot?: boolean;
}

/**
 * Upsert a remote user into the local database for caching/display purposes.
 */
export async function upsertRemoteUser(profile: RemoteProfile) {
    try {
        if (!db) return;

        // Check if user already exists
        const existing = await db.query.users.findFirst({
            where: eq(users.did, profile.did),
        });

        if (existing) {
            // Update metadata if changed
            await db.update(users)
                .set({
                    displayName: profile.displayName || existing.displayName,
                    avatarUrl: profile.avatarUrl || existing.avatarUrl,
                    isBot: profile.isBot ?? existing.isBot,
                    updatedAt: new Date(),
                })
                .where(eq(users.id, existing.id));
        } else {
            // Create new placeholder user
            await db.insert(users).values({
                did: profile.did,
                handle: profile.handle, // user@domain
                displayName: profile.displayName || profile.handle,
                avatarUrl: profile.avatarUrl || null,
                isBot: profile.isBot || false,
                publicKey: '', // We don't necessarily have their public key yet, but DMs often do
                // Note: nodeId is null for remote placeholders unless we specifically link it
            });
        }
    } catch (error) {
        console.error(`[User Cache] Failed to upsert ${profile.handle}:`, error);
    }
}
