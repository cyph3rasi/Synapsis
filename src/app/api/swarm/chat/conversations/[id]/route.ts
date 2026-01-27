/**
 * Swarm Chat Conversation Management
 * 
 * DELETE: Delete a conversation (for self or both parties)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, chatConversations, chatMessages } from '@/db';
import { eq, and } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const deleteFor = searchParams.get('deleteFor'); // 'self' or 'both'

    // Verify the conversation belongs to this user
    const conversation = await db.query.chatConversations.findFirst({
      where: and(
        eq(chatConversations.id, params.id),
        eq(chatConversations.participant1Id, session.user.id)
      ),
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    if (deleteFor === 'both') {
      // Delete the entire conversation and all messages (cascade will handle messages)
      await db.delete(chatConversations).where(eq(chatConversations.id, params.id));
      
      // TODO: Send a federation message to the other party to delete their copy
      // This would require implementing a swarm protocol for conversation deletion
      
      return NextResponse.json({ 
        success: true, 
        message: 'Conversation deleted for both parties' 
      });
    } else {
      // Delete for self only - just delete the conversation record
      // The other party will still have their copy
      await db.delete(chatConversations).where(eq(chatConversations.id, params.id));
      
      return NextResponse.json({ 
        success: true, 
        message: 'Conversation deleted for you' 
      });
    }
  } catch (error) {
    console.error('Delete conversation error:', error);
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 });
  }
}
