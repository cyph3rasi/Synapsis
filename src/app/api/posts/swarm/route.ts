/**
 * Swarm Posts Endpoint
 * 
 * GET: Returns aggregated posts from across the swarm
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchSwarmTimeline } from '@/lib/swarm/timeline';

// Simple in-memory cache for swarm timeline
let cachedTimeline: Awaited<ReturnType<typeof fetchSwarmTimeline>> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

/**
 * GET /api/posts/swarm
 * 
 * Returns aggregated posts from across the swarm network.
 * Results are cached for 1 minute to reduce load on other nodes.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === 'true';
    
    const now = Date.now();
    
    // Return cached data if fresh
    if (!refresh && cachedTimeline && (now - cacheTimestamp) < CACHE_TTL_MS) {
      return NextResponse.json({
        posts: cachedTimeline.posts,
        sources: cachedTimeline.sources,
        cached: true,
        fetchedAt: cachedTimeline.fetchedAt,
      });
    }

    // Fetch fresh data
    const timeline = await fetchSwarmTimeline(10, 15);
    
    // Update cache
    cachedTimeline = timeline;
    cacheTimestamp = now;

    return NextResponse.json({
      posts: timeline.posts,
      sources: timeline.sources,
      cached: false,
      fetchedAt: timeline.fetchedAt,
    });
  } catch (error) {
    console.error('Swarm posts error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch swarm posts' },
      { status: 500 }
    );
  }
}
