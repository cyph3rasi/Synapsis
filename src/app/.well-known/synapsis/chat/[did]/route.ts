
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { chatDeviceBundles } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ did: string }> }
) {
    const { did } = await params;

    // Fetch device bundle for this DID
    const bundle = await db.query.chatDeviceBundles.findFirst({
        where: eq(chatDeviceBundles.did, did),
    });

    if (!bundle) {
        return NextResponse.json({ error: 'No keys found' }, { status: 404 });
    }

    const signedPreKey = JSON.parse(bundle.signedPreKey);
    const kyberPreKey = bundle.kyberPreKey ? JSON.parse(bundle.kyberPreKey) : null;

    // Format Response for Olm
    const response = {
        identityKey: bundle.identityKey, // curve25519
        signingKey: signedPreKey.signingKey, // ed25519
        oneTimeKeys: kyberPreKey?.oneTimeKeys || [],
    };

    return NextResponse.json(response, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'max-age=60'
        }
    });
}

export async function OPTIONS() {
    return new NextResponse(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}
