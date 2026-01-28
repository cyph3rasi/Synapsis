import { db, handleRegistry } from '@/db';
import { eq } from 'drizzle-orm';

export type HandleEntry = {
    handle: string;
    did: string;
    nodeDomain: string;
    updatedAt?: string;
};

export const normalizeHandle = (handle: string) =>
    handle.toLowerCase().replace(/^@/, '').trim();

// [Modified] Added sourceDomain parameter
export async function upsertHandleEntries(
    entries: HandleEntry[],
    sourceDomain?: string
) {
    if (!db) {
        return { added: 0, updated: 0 };
    }

    let added = 0;
    let updated = 0;

    for (const entry of entries) {
        const cleanHandle = normalizeHandle(entry.handle);
        if (!cleanHandle || !entry.did || !entry.nodeDomain) {
            continue;
        }

        const existing = await db.query.handleRegistry.findFirst({
            where: eq(handleRegistry.handle, cleanHandle),
        });

        // If no timestamp provided, treat it as "now" but be careful
        // Actually, if it's missing, it might be old data. 
        // But if it comes from the authoritative source, we might trust it.
        const incomingUpdatedAt = entry.updatedAt ? new Date(entry.updatedAt) : new Date();

        if (!existing) {
            await db.insert(handleRegistry).values({
                handle: cleanHandle,
                did: entry.did,
                nodeDomain: entry.nodeDomain,
                updatedAt: incomingUpdatedAt,
            });
            added += 1;
            continue;
        }

        // PROPAGATION FIX:
        // 1. If the update comes from the node that OWNS the handle (sourceDomain == entry.nodeDomain),
        //    we treat it as authoritative.
        // 2. We allow updates if the timestamp is newer OR equal (to handle clock skew).
        // 3. We allow updates if the authoritative source is correcting a mismatch (e.g. we thought it was distinct, they say it's them).

        const isAuthoritative = sourceDomain && (sourceDomain === entry.nodeDomain);
        const isNewerOrEqual = incomingUpdatedAt.getTime() >= (existing.updatedAt?.getTime() || 0);

        // If authoritative, we accept it even if timestamps are identical (recovery)
        // If not authoritative, only accept strictly newer
        const shouldUpdate = isAuthoritative
            ? isNewerOrEqual || (existing.nodeDomain !== entry.nodeDomain) // Auto-correct wrong domain
            : incomingUpdatedAt > (existing.updatedAt || new Date(0));

        if (shouldUpdate) {
            await db.update(handleRegistry)
                .set({
                    did: entry.did,
                    nodeDomain: entry.nodeDomain,
                    updatedAt: incomingUpdatedAt,
                })
                .where(eq(handleRegistry.handle, cleanHandle));
            updated += 1;
        }
    }

    return { added, updated };
}
