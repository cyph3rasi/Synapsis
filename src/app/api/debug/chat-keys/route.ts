import { NextResponse } from 'next/server';
import { db, users } from '@/db';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, session.user.id),
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let publicKeyInfo = null;
    if (user.chatPublicKey) {
      try {
        const decoded = Buffer.from(user.chatPublicKey, 'base64');
        publicKeyInfo = {
          stringLength: user.chatPublicKey.length,
          decodedBytes: decoded.byteLength,
          isValidSize: decoded.byteLength === 91,
          firstChars: user.chatPublicKey.substring(0, 20),
        };
      } catch (e) {
        publicKeyInfo = {
          error: 'Not valid base64',
          stringLength: user.chatPublicKey.length,
          firstChars: user.chatPublicKey.substring(0, 20),
        };
      }
    }

    return NextResponse.json({
      handle: user.handle,
      hasPublicKey: !!user.chatPublicKey,
      hasEncryptedPrivateKey: !!user.chatPrivateKeyEncrypted,
      publicKeyInfo,
      encryptedPrivateKeyLength: user.chatPrivateKeyEncrypted?.length || 0,
    });
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({ error: 'Failed to debug keys' }, { status: 500 });
  }
}
