import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { chatDeviceBundles, handleRegistry, remoteIdentityCache } from '@/db/schema';
import { requireAuth } from '@/lib/auth';
import { eq, and, gt } from 'drizzle-orm';

/**
 * GET /api/chat/keys?did=<did>
 * Fetch public key for a user
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const did = searchParams.get('did');

    if (!did) {
      return NextResponse.json({ error: 'Missing did parameter' }, { status: 400 });
    }

    console.log('[Chat Keys GET] Looking for DID:', did);

    const bundle = await db.query.chatDeviceBundles.findFirst({
      where: eq(chatDeviceBundles.did, did),
    });

    console.log('[Chat Keys GET] Found local bundle:', bundle ? 'YES' : 'NO');
    if (bundle) {
      console.log('[Chat Keys GET] Bundle data:', {
        userId: bundle.userId,
        did: bundle.did,
        deviceId: bundle.deviceId,
        hasIdentityKey: !!bundle.identityKey,
      });

      // For libsodium, we just need the public key
      return NextResponse.json({
        publicKey: bundle.identityKey,
      });
    }

    // If not found locally, check remote identity cache
    const cached = await db.query.remoteIdentityCache.findFirst({
      where: and(
        eq(remoteIdentityCache.did, did),
        gt(remoteIdentityCache.expiresAt, new Date())
      ),
    });

    // DEBUG: Force refresh for now to fix development key mismatches
    // if (cached) {
    //   console.log('[Chat Keys GET] Found cached remote key');
    //   return NextResponse.json({
    //     publicKey: cached.publicKey,
    //   });
    // }

    // If not in cache, try to resolve DID to a node
    console.log('[Chat Keys GET] resolving DID to node...');
    const handleEntry = await db.query.handleRegistry.findFirst({
      where: eq(handleRegistry.did, did),
    });

    if (handleEntry) {
      const { nodeDomain } = handleEntry;
      console.log('[Chat Keys GET] Resolved to node:', nodeDomain);

      // Fetch from remote node
      const remoteUrl = `https://${nodeDomain}/api/chat/keys?did=${encodeURIComponent(did)}`;
      console.log('[Chat Keys GET] Fetching from remote:', remoteUrl);

      try {
        const remoteRes = await fetch(remoteUrl);
        if (remoteRes.ok) {
          const data = await remoteRes.json();
          if (data.publicKey) {
            console.log('[Chat Keys GET] Successfully fetched remote key');

            // Cache it
            await db.insert(remoteIdentityCache).values({
              did: did,
              publicKey: data.publicKey,
              fetchedAt: new Date(),
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            }).onConflictDoUpdate({
              target: remoteIdentityCache.did,
              set: {
                publicKey: data.publicKey,
                fetchedAt: new Date(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              }
            });

            return NextResponse.json({
              publicKey: data.publicKey,
            });
          }
        } else {
          console.warn('[Chat Keys GET] Remote fetch failed:', remoteRes.status, remoteRes.statusText);
        }
      } catch (err) {
        console.error('[Chat Keys GET] Remote fetch error:', err);
      }

      // FALLBACK: Try fetching from Swarm User Profile (standard endpoint)
      if (!cached) {
        console.log('[Chat Keys GET] Trying fallback to Swarm Profile...');
        const swarmUrl = `https://${nodeDomain}/api/swarm/users/${handleEntry.handle}`;
        console.log('[Chat Keys GET] Fetching Swarm Profile:', swarmUrl);

        try {
          const swarmRes = await fetch(swarmUrl);
          if (swarmRes.ok) {
            const data = await swarmRes.json();
            const chatKey = data.profile?.chatPublicKey;

            if (chatKey) {
              console.log('[Chat Keys GET] Found key in Swarm Profile');

              // Cache it
              await db.insert(remoteIdentityCache).values({
                did: did,
                publicKey: chatKey,
                fetchedAt: new Date(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
              }).onConflictDoUpdate({
                target: remoteIdentityCache.did,
                set: {
                  publicKey: chatKey,
                  fetchedAt: new Date(),
                  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                }
              });

              return NextResponse.json({
                publicKey: chatKey,
              });
            } else {
              console.warn('[Chat Keys GET] Swarm Profile found but no chatPublicKey');
            }
          } else {
            console.warn('[Chat Keys GET] Swarm Profile fetch failed:', swarmRes.status);
          }
        } catch (err) {
          console.error('[Chat Keys GET] Swarm Profile fetch error:', err);
        }
      }
    } else {
      console.log('[Chat Keys GET] DID not found in handle registry');
    }

    return NextResponse.json({ error: 'No keys found' }, { status: 404 });
  } catch (error: any) {
    console.error('[Chat Keys] Failed to fetch keys:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/chat/keys
 * Publish public key
 * 
 * Body: {
 *   publicKey: string (base64)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    console.log('[Chat Keys POST] User:', user.handle, 'DID:', user.did, 'UserID:', user.id);

    const body = await request.json();
    const { publicKey } = body;

    console.log('[Chat Keys POST] Received publicKey:', publicKey ? publicKey.substring(0, 20) + '...' : 'MISSING');

    if (!publicKey) {
      return NextResponse.json({ error: 'Missing publicKey' }, { status: 400 });
    }

    // Check if bundle exists
    const existing = await db.query.chatDeviceBundles.findFirst({
      where: and(
        eq(chatDeviceBundles.userId, user.id),
        eq(chatDeviceBundles.deviceId, '1')
      )
    });

    console.log('[Chat Keys POST] Existing bundle found:', existing ? 'YES' : 'NO');

    if (existing) {
      // Update existing bundle
      console.log('[Chat Keys POST] Updating existing bundle...');
      await db.update(chatDeviceBundles)
        .set({
          identityKey: publicKey,
          did: user.did, // Update DID too in case it changed
          lastSeenAt: new Date(),
        })
        .where(
          and(
            eq(chatDeviceBundles.userId, user.id),
            eq(chatDeviceBundles.deviceId, '1')
          )
        );
      console.log('[Chat Keys POST] Updated existing key');
    } else {
      // Insert new bundle
      console.log('[Chat Keys POST] Inserting new bundle...');
      await db.insert(chatDeviceBundles).values({
        userId: user.id,
        did: user.did,
        deviceId: '1',
        identityKey: publicKey,
        signedPreKey: 'libsodium', // Placeholder
        registrationId: 1,
        signature: 'libsodium',
      });
      console.log('[Chat Keys POST] Inserted new key');
    }

    console.log('[Chat Keys POST] Key published successfully for', user.handle);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Chat Keys] Failed to publish key:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}