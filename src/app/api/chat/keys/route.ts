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

    // Validate it looks like a base64 SPKI key (should be ~120 chars for P-256)
    if (chatPublicKey.length < 100 || chatPublicKey.length > 200) {
      console.error('[Chat Keys API] Invalid public key length:', chatPublicKey.length);
      return NextResponse.json({ 
        error: `Invalid public key format: expected ~120 characters, got ${chatPublicKey.length}` 
      }, { status: 400 });
    }

    // Additional validation: try to decode as base64
    try {
      const decoded = Buffer.from(chatPublicKey, 'base64');
      if (decoded.length < 80 || decoded.length > 100) {
        console.error('[Chat Keys API] Invalid decoded key size:', decoded.length);
        return NextResponse.json({ 
          error: `Invalid public key: decoded size ${decoded.length} bytes (expected ~91 bytes for P-256)` 
        }, { status: 400 });
      }
    } catch (e) {
      console.error('[Chat Keys API] Failed to decode public key as base64:', e);
      return NextResponse.json({ error: 'Public key is not valid base64' }, { status: 400 });
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
