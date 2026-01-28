import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { chatDeviceBundles } from '@/db/schema';
import { requireAuth } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';

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

    console.log('[Chat Keys GET] Found bundle:', bundle ? 'YES' : 'NO');
    if (bundle) {
      console.log('[Chat Keys GET] Bundle data:', {
        userId: bundle.userId,
        did: bundle.did,
        deviceId: bundle.deviceId,
        hasIdentityKey: !!bundle.identityKey,
      });
    }

    if (!bundle) {
      return NextResponse.json({ error: 'No keys found' }, { status: 404 });
    }

    // For libsodium, we just need the public key
    return NextResponse.json({
      publicKey: bundle.identityKey, // Reusing identityKey field for libsodium public key
    });
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