import { NextResponse } from 'next/server';
import { db } from '@/db';
import { chatDeviceBundles } from '@/db/schema';

export async function GET() {
  try {
    const bundles = await db.select({
      did: chatDeviceBundles.did,
      userId: chatDeviceBundles.userId,
      deviceId: chatDeviceBundles.deviceId,
      identityKey: chatDeviceBundles.identityKey,
      createdAt: chatDeviceBundles.createdAt,
    }).from(chatDeviceBundles).orderBy(chatDeviceBundles.createdAt);

    return NextResponse.json({ bundles, count: bundles.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
