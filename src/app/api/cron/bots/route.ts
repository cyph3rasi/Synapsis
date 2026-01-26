/**
 * Cron endpoint for bot scheduled posting
 * 
 * Call this endpoint periodically (e.g., every minute) via cron job or PM2
 */

import { NextRequest, NextResponse } from 'next/server';
import { processScheduledPosts } from '@/lib/bots/scheduler';
import { processAllAutonomousBots } from '@/lib/bots/autonomous';

export async function POST(request: NextRequest) {
  // Verify using AUTH_SECRET to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  const authSecret = process.env.AUTH_SECRET;
  
  if (authSecret && authHeader !== `Bearer ${authSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Process scheduled posts
    const scheduledResult = await processScheduledPosts();
    
    // Process autonomous bots
    const autonomousResult = await processAllAutonomousBots();

    return NextResponse.json({
      success: true,
      scheduled: {
        processed: scheduledResult.processed,
        skipped: scheduledResult.skipped,
        errors: scheduledResult.errors.length,
      },
      autonomous: {
        total: autonomousResult.length,
        posted: autonomousResult.filter(r => r.result.posted).length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cron bot processing error:', error);
    return NextResponse.json(
      { error: 'Failed to process bots', details: String(error) },
      { status: 500 }
    );
  }
}
