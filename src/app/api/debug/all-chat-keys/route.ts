import { NextResponse } from 'next/server';
import { db, users } from '@/db';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allUsers = await db.select({
      id: users.id,
      handle: users.handle,
      chatPublicKey: users.chatPublicKey,
      chatPrivateKeyEncrypted: users.chatPrivateKeyEncrypted,
    }).from(users);

    const results = allUsers.map(user => {
      let publicKeyInfo = null;
      if (user.chatPublicKey) {
        try {
          const decoded = Buffer.from(user.chatPublicKey, 'base64');
          publicKeyInfo = {
            stringLength: user.chatPublicKey.length,
            decodedBytes: decoded.byteLength,
            isValidSize: decoded.byteLength === 91,
            isCorrupted: decoded.byteLength !== 91,
          };
        } catch (e) {
          publicKeyInfo = {
            error: 'Not valid base64',
            stringLength: user.chatPublicKey.length,
            isCorrupted: true,
          };
        }
      }

      return {
        handle: user.handle,
        hasPublicKey: !!user.chatPublicKey,
        publicKeyInfo,
        encryptedPrivateKeyLength: user.chatPrivateKeyEncrypted?.length || 0,
      };
    });

    const corrupted = results.filter(r => r.publicKeyInfo?.isCorrupted);

    return NextResponse.json({
      total: results.length,
      withKeys: results.filter(r => r.hasPublicKey).length,
      corrupted: corrupted.length,
      corruptedUsers: corrupted.map(r => r.handle),
      allUsers: results,
    });
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({ error: 'Failed to debug keys' }, { status: 500 });
  }
}
