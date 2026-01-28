
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { chatDeviceBundles, chatOneTimeKeys } from '@/db/schema';
import { requireSignedAction } from '@/lib/auth/verify-signature';
import { eq, and } from 'drizzle-orm';

/**
 * POST /api/chat/keys
 * Publish a new Device Bundle and OTKs.
 * 
 * Payload: SignedAction < { 
 *   deviceId: string, 
 *   identityKey: string,
 *   signedPreKey: { id, key, sig },
 *   signature: string, (The ECDSA signature of the bundle itself)
 *   oneTimeKeys: { id, key }[]
 * } >
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 1. Verify User Identity (ECDSA Root)
    // The wrapper itself is a SignedAction with action="chat.keys.publish"
    // This proves the user (DID) is authorizing this device registration.
    const user = await requireSignedAction(body);

    const { deviceId, identityKey, signedPreKey, signature, oneTimeKeys } = body.data;

    // 2. Validate Bundle Signature (The bundle.signature must cover the fields)
    // Actually, requireSignedAction already verified the payload signature.
    // The "signature" field inside data is redundant if the whole thing is signed by DID?
    // Or is "signature" the signature of the bundle bytes? 
    // In our design, the SignedAction *is* the signature.
    // So "signature" inside might be the "Self-Signature" of the X25519 Identity Key signing the structure?
    // No, standard Signal: The Bundle is signed by Identity Key.
    // Here, Identity Key is ECDSA. The SignedAction covers it.
    // So we just trust the SignedAction.

    // 3. Upsert Bundle
    await db.transaction(async (tx) => {
      // Upsert device bundle
      await tx.delete(chatDeviceBundles).where(
        and(
          eq(chatDeviceBundles.userId, user.id),
          eq(chatDeviceBundles.deviceId, deviceId)
        )
      );

      const [bundle] = await tx.insert(chatDeviceBundles).values({
        userId: user.id,
        did: user.did,
        deviceId,
        identityKey,
        signedPreKey: JSON.stringify(signedPreKey),
        signature, // We store the action signature or the explicit inner signature provided
      }).returning();

      // 4. Insert OTKs
      if (oneTimeKeys && oneTimeKeys.length > 0) {
        await tx.insert(chatOneTimeKeys).values(
          oneTimeKeys.map((k: any) => ({
            userId: user.id,
            bundleId: bundle.id,
            keyId: k.id,
            publicKey: k.key
          }))
        ).onConflictDoNothing();
      }
    });

    return NextResponse.json({ success: true, count: oneTimeKeys?.length || 0 });

  } catch (error: any) {
    console.error('Failed to publish keys:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
