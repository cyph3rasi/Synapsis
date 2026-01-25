/**
 * Well-Known Synapsis Swarm Endpoint
 * 
 * GET /.well-known/synapsis-swarm
 * 
 * Returns information about this node and the swarm it knows about.
 * This is a standardized discovery endpoint that other nodes can use
 * to find and join the swarm.
 */

import { NextResponse } from 'next/server';
import { buildAnnouncement } from '@/lib/swarm/discovery';
import { getActiveSwarmNodes, getSwarmStats, getSeedNodes } from '@/lib/swarm/registry';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeNodes = searchParams.get('nodes') !== 'false';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

    const announcement = await buildAnnouncement();
    const stats = await getSwarmStats();
    const seeds = await getSeedNodes();

    const response: {
      // This node's info
      node: {
        domain: string;
        name: string;
        description?: string;
        publicKey: string;
        softwareVersion: string;
        capabilities: string[];
      };
      // Swarm metadata
      swarm: {
        totalNodes: number;
        activeNodes: number;
        totalUsers: number;
        totalPosts: number;
        seeds: string[];
      };
      // Known nodes (optional)
      nodes?: Awaited<ReturnType<typeof getActiveSwarmNodes>>;
    } = {
      node: {
        domain: announcement.domain,
        name: announcement.name,
        description: announcement.description,
        publicKey: announcement.publicKey,
        softwareVersion: announcement.softwareVersion,
        capabilities: announcement.capabilities,
      },
      swarm: {
        ...stats,
        seeds,
      },
    };

    if (includeNodes) {
      response.nodes = await getActiveSwarmNodes(limit);
    }

    return NextResponse.json(response, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error('Synapsis swarm well-known error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch swarm info' },
      { status: 500 }
    );
  }
}
