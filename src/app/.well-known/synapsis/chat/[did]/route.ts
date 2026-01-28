
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { chatDeviceBundles } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ did: string }> }
) {
    const { did } = await params;

    // 1. Fetch all devices for this DID
    const bundles = await db.query.chatDeviceBundles.findMany({
        where: eq(chatDeviceBundles.did, did),
        with: {
            oneTimeKeys: {
                limit: 5, // Return a few keys; client picks one
                // Ideally we pick non-conflicted ones or random ones
            }
        }
    });

    if (!bundles || bundles.length === 0) {
        return NextResponse.json([], { status: 404 });
    }

    // 2. Format Response
    const response = bundles.map(b => ({
        did: b.did,
        deviceId: b.deviceId,
        identityKey: b.identityKey, // Base64 X25519
        signedPreKey: JSON.parse(b.signedPreKey),
        oneTimeKeys: b.oneTimeKeys.map(k => ({
            id: k.keyId,
            key: k.publicKey
        })),
        signature: b.signature // ECDSA signature of this bundle
    }));

    return NextResponse.json(response, {
        headers: {
            'Access-Control-Allow-Origin': '*', // Federation Header
            'Cache-Control': 'max-age=60' // Cache for 1 min
        }
    });
}
