/**
 * Remote Follows Sync
 * 
 * Periodically syncs posts from remote users that local users follow.
 * This ensures the home timeline shows fresh posts from followed remote users.
 */

import { db, remoteFollows } from '@/db';
import { resolveRemoteUser } from '@/lib/activitypub/fetch';
import { cacheRemoteUserPosts } from '@/lib/activitypub/cache';
import { cacheSwarmUserPosts, isSwarmNode } from '@/lib/swarm/interactions';

// Track last sync time per remote handle to avoid over-fetching
const lastSyncTimes = new Map<string, number>();
const MIN_SYNC_INTERVAL_MS = 60 * 1000; // Don't sync same user more than once per minute

interface SyncResult {
  synced: number;
  skipped: number;
  errors: number;
  details: Array<{ handle: string; cached: number; error?: string }>;
}

/**
 * Sync posts from all remote users that any local user follows
 */
export async function syncRemoteFollowsPosts(origin: string): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, skipped: 0, errors: 0, details: [] };

  try {
    // Get all unique remote handles that are being followed
    const allRemoteFollows = await db.query.remoteFollows.findMany();
    
    // Deduplicate by target handle (multiple users might follow the same remote user)
    const uniqueHandles = new Map<string, typeof allRemoteFollows[0]>();
    for (const follow of allRemoteFollows) {
      if (!uniqueHandles.has(follow.targetHandle)) {
        uniqueHandles.set(follow.targetHandle, follow);
      }
    }

    const now = Date.now();

    for (const [targetHandle, follow] of uniqueHandles) {
      try {
        // Check if we've synced this user recently
        const lastSync = lastSyncTimes.get(targetHandle);
        if (lastSync && (now - lastSync) < MIN_SYNC_INTERVAL_MS) {
          result.skipped++;
          continue;
        }

        // Parse handle to get username and domain
        const atIndex = targetHandle.lastIndexOf('@');
        if (atIndex === -1) {
          result.skipped++;
          continue;
        }

        const handle = targetHandle.slice(0, atIndex);
        const domain = targetHandle.slice(atIndex + 1);

        // Check if this is a swarm node
        const isSwarm = await isSwarmNode(domain);

        let cached = 0;
        if (isSwarm) {
          // Use swarm sync for swarm nodes
          const swarmResult = await cacheSwarmUserPosts(handle, domain, targetHandle, 20);
          cached = swarmResult.cached;
        } else {
          // Use ActivityPub sync for federated nodes
          const remoteProfile = await resolveRemoteUser(handle, domain);
          if (remoteProfile?.outbox) {
            const apResult = await cacheRemoteUserPosts(remoteProfile, targetHandle, origin, 20);
            cached = apResult.cached;
          }
        }

        lastSyncTimes.set(targetHandle, now);
        
        if (cached > 0) {
          result.synced++;
          result.details.push({ handle: targetHandle, cached });
        } else {
          result.skipped++;
        }
      } catch (error) {
        result.errors++;
        result.details.push({ 
          handle: targetHandle, 
          cached: 0, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }
  } catch (error) {
    console.error('[RemoteSync] Error syncing remote follows:', error);
    result.errors++;
  }

  return result;
}

/**
 * Clear the sync cache (useful for testing or forcing a full resync)
 */
export function clearSyncCache(): void {
  lastSyncTimes.clear();
}
