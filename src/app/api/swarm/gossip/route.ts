/**
 * Swarm Gossip Endpoint
 * 
 * POST: Exchange node and handle information with other nodes
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { processGossip } from '@/lib/swarm/gossip';
import { markNodeSuccess } from '@/lib/swarm/registry';
import type { SwarmGossipPayload } from '@/lib/swarm/types';

const handleSchema = z.object({
  handle: z.string(),
  did: z.string(),
  nodeDomain: z.string(),
  updatedAt: z.string().optional(),
});

const nodeInfoSchema = z.object({
  domain: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  logoUrl: z.string().optional(),
  publicKey: z.string().optional(),
  softwareVersion: z.string().optional(),
  userCount: z.number().optional(),
  postCount: z.number().optional(),
  capabilities: z.array(z.enum(['handles', 'gossip', 'relay', 'search'])).optional(),
  lastSeenAt: z.string().optional(),
});

const gossipPayloadSchema = z.object({
  sender: z.string().min(1),
  nodes: z.array(nodeInfoSchema),
  handles: z.array(handleSchema).optional(),
  timestamp: z.string(),
  since: z.string().optional(),
});

/**
 * POST /api/swarm/gossip
 * 
 * Receives gossip from another node and responds with our own data.
 * This is the core of the epidemic protocol - nodes exchange what they know.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = gossipPayloadSchema.parse(body) as SwarmGossipPayload;
    
    const ourDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN;
    
    // Don't process gossip from ourselves
    if (payload.sender === ourDomain) {
      return NextResponse.json(
        { error: 'Cannot gossip with self' },
        { status: 400 }
      );
    }

    console.log(`[Swarm] Gossip from ${payload.sender}: ${payload.nodes.length} nodes, ${payload.handles?.length || 0} handles`);

    // Process the incoming gossip and build our response
    const response = await processGossip(payload);
    
    // Mark the sender as successfully contacted
    await markNodeSuccess(payload.sender);

    console.log(`[Swarm] Gossip response to ${payload.sender}: ${response.nodes.length} nodes, ${response.handles?.length || 0} handles`);

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid gossip payload', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Swarm gossip error:', error);
    return NextResponse.json(
      { error: 'Failed to process gossip' },
      { status: 500 }
    );
  }
}
