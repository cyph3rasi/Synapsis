import { NextResponse } from 'next/server';
import { db, chatMessages } from '@/db';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const messages = await db.select({
      id: chatMessages.id,
      senderHandle: chatMessages.senderHandle,
      senderChatPublicKey: chatMessages.senderChatPublicKey,
      createdAt: chatMessages.createdAt,
    }).from(chatMessages).limit(50);

    const results = messages.map(msg => {
      let keyInfo = null;
      if (msg.senderChatPublicKey) {
        try {
          const decoded = Buffer.from(msg.senderChatPublicKey, 'base64');
          keyInfo = {
            stringLength: msg.senderChatPublicKey.length,
            decodedBytes: decoded.byteLength,
            isValidSize: decoded.byteLength === 91,
            isCorrupted: decoded.byteLength !== 91,
            firstChars: msg.senderChatPublicKey.substring(0, 20),
          };
        } catch (e) {
          keyInfo = {
            error: 'Not valid base64',
            stringLength: msg.senderChatPublicKey.length,
            isCorrupted: true,
            firstChars: msg.senderChatPublicKey.substring(0, 20),
          };
        }
      }

      return {
        id: msg.id,
        senderHandle: msg.senderHandle,
        createdAt: msg.createdAt,
        hasSenderKey: !!msg.senderChatPublicKey,
        keyInfo,
      };
    });

    const corrupted = results.filter(r => r.keyInfo?.isCorrupted);

    return NextResponse.json({
      total: results.length,
      withKeys: results.filter(r => r.hasSenderKey).length,
      corrupted: corrupted.length,
      corruptedMessages: corrupted,
      allMessages: results,
    });
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({ error: 'Failed to debug messages' }, { status: 500 });
  }
}
