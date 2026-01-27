/**
 * Chat Keys API
 * 
 * GET: Get current user's chat keys (public key + encrypted private key backup)
 * POST: Register/update chat keys with encrypted private key backup
 * 
 * The private key is encrypted CLIENT-SIDE with the user's password before
 * being sent to the server. The server cannot decrypt it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, users } from '@/db';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      chatPublicKey: user.chatPublicKey,
      // Return encrypted private key so client can decrypt with password
      chatPrivateKeyEncrypted: user.chatPrivateKeyEncrypted,
      hasKeys: !!user.chatPublicKey,
    });
  } catch (error) {
    console.error('Get chat keys error:', error);
    return NextResponse.json({ error: 'Failed to get chat keys' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { chatPublicKey, chatPrivateKeyEncrypted } = await request.json();

    if (!chatPublicKey || typeof chatPublicKey !== 'string') {
      return NextResponse.json({ error: 'chatPublicKey required' }, { status: 400 });
    }

    // Validate it looks like a base64 SPKI key
    if (chatPublicKey.length < 50 || chatPublicKey.length > 500) {
      return NextResponse.json({ error: 'Invalid public key format' }, { status: 400 });
    }

    // chatPrivateKeyEncrypted should be a JSON string with encrypted data
    if (chatPrivateKeyEncrypted && typeof chatPrivateKeyEncrypted !== 'string') {
      return NextResponse.json({ error: 'Invalid encrypted private key format' }, { status: 400 });
    }

    await db.update(users)
      .set({ 
        chatPublicKey,
        chatPrivateKeyEncrypted: chatPrivateKeyEncrypted || null,
      })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Register chat keys error:', error);
    return NextResponse.json({ error: 'Failed to register chat keys' }, { status: 500 });
  }
}
