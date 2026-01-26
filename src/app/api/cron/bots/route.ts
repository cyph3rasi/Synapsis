/**
 * Cron endpoint for bot autonomous posting
 * 
 * Call this endpoint periodically (e.g., every minute) via cron job or PM2
 */

import { NextRequest, NextResponse } from 'next/server';
import { processAllAutonomousBots } from '@/lib/bots/autonomous';

export async function POST(request: NextRequest) {
  // Verify using AUTH_SECRET to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  const authSecret = process.env.AUTH_SECRET;
  
  if (authSecret && authHeader !== `Bearer ${authSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await processAllAutonomousBots();

    return NextResponse.json({
      success: true,
      total: results.length,
      posted: results.filter(r => r.result.posted).length,
      errors: results.filter(r => r.error).length,
      details: results.map(r => ({
        handle: r.botHandle,
        posted: r.result.posted,
        reason: r.result.reason || r.error,
      })),
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
