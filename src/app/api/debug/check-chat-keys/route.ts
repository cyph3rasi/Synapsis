import { NextResponse } from 'next/server';
import { db, users, chatDeviceBundles } from '@/db';
import { eq } from 'drizzle-orm';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const handle = searchParams.get('handle');

    if (!handle) {
      return NextResponse.json({ error: 'Missing handle parameter' }, { status: 400 });
    }

    // Find user
    const user = await db.query.users.findFirst({
      where: eq(users.handle, handle.toLowerCase()),
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check for device bundles
    const bundles = await db.query.chatDeviceBundles.findMany({
      where: eq(chatDeviceBundles.userId, user.id),
      with: {
        oneTimeKeys: true,
      },
    });

    return NextResponse.json({
      user: {
        id: user.id,
        handle: user.handle,
        did: user.did,
        hasChatPublicKey: !!user.chatPublicKey,
      },
      bundles: bundles.map(b => ({
        deviceId: b.deviceId,
        identityKey: b.identityKey?.substring(0, 20) + '...',
        hasSignedPreKey: !!b.signedPreKey,
        oneTimeKeysCount: b.oneTimeKeys.length,
      })),
      bundleCount: bundles.length,
    });
  } catch (error) {
    console.error('Check chat keys error:', error);
    return NextResponse.json({ error: 'Failed to check keys' }, { status: 500 });
  }
}
