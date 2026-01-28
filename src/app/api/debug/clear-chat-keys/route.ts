import { NextResponse } from 'next/server';
import { db } from '@/db';
import { chatDeviceBundles } from '@/db/schema';

export async function POST() {
  try {
    console.log('[Debug] Clearing all chat device bundles...');
    
    await db.delete(chatDeviceBundles);
    
    console.log('[Debug] Cleared all chat device bundles');
    
    return NextResponse.json({ success: true, message: 'Cleared all chat keys' });
  } catch (error: any) {
    console.error('[Debug] Failed to clear keys:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
