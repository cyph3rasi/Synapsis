
import { db, handleRegistry, users } from '@/db';
import { eq } from 'drizzle-orm';
import { gossipToNode } from './gossip';
import { fetchSwarmUserProfile, fetchSwarmPost } from './interactions';
import { upsertHandleEntries } from '@/lib/federation/handles';

/**
 * Attempt to "heal" a connection to a user by finding their correct node
 * and syncing with it.
 * 
 * @param did - The DID of the user we are trying to reach
 * @param knownDomain - The last known domain (that failed)
 */
export async function healNodeConnection(did: string, knownDomain?: string): Promise<boolean> {
    console.log(`[Swarm Healing] Attempting to heal connection for DID: ${did} (Last known: ${knownDomain})`);

    // 1. Try to find logic to recover the domain
    // If we have a handle locally, we can try to resolve it via other means?
    // Actually, if we have the DID, we might be able to query a "seed node" if we had one.
    // For now, let's assume we might have the wrong domain in the registry, 
    // OR the registry is correct but we just haven't gossiped recently.

    // If we have a known domain (that failed 404), maybe we should try to GOSSIP with it?
    // Sometimes a node knows about itself but we haven't synced it.
    if (knownDomain) {
        console.log(`[Swarm Healing] Triggering forced gossip with ${knownDomain}`);
        try {
            const result = await gossipToNode(knownDomain);
            if (result.success && result.handlesReceived > 0) {
                console.log(`[Swarm Healing] Gossip successful, handles updated.`);
                // Check if our specific user was updated?
                // We trust upsertHandleEntries handled it if authoritative.
                return true;
            }
        } catch (e) {
            console.error(`[Swarm Healing] Gossip to ${knownDomain} failed:`, e);
        }
    }

    // 2. Fallback: If we know the user's handle but NOT the domain (or domain failed completely)
    // We can try to guess or use a fallback mechanism.

    // Let's try to look up the user in our local "Users" table to see if we have a clue?
    // Or assume the formatting of the DID might give a hint? (Did is meaningless usually).

    return false;
}

/**
 * "Soft" Heal: We successfully fetched a user profile from a URL, 
 * but our registry might be out of date. Update it immediately.
 */
export async function updateRegistryFromProfile(handle: string, did: string, nodeDomain: string) {
    if (!handle || !did || !nodeDomain) return;

    console.log(`[Swarm Healing] Updating registry from valid profile fetch: ${handle}@${nodeDomain}`);

    await upsertHandleEntries([{
        handle,
        did,
        nodeDomain,
        updatedAt: new Date().toISOString()
    }], nodeDomain);
}
