/**
 * Swarm Announce Endpoint
 * 
 * POST: Receive announcements from other nodes joining the swarm
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { upsertSwarmNode } from '@/lib/swarm/registry';
import { buildAnnouncement } from '@/lib/swarm/discovery';
import type { SwarmNodeInfo } from '@/lib/swarm/types';

const announcementSchema = z.object({
  domain: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  logoUrl: z.string().url().optional(),
  publicKey: z.string().optional(),
  softwareVersion: z.string().optional(),
  userCount: z.number().optional(),
  postCount: z.number().optional(),
  capabilities: z.array(z.enum(['handles', 'gossip', 'relay', 'search', 'interactions'])).optional(),
  timestamp: z.string().optional(),
  signature: z.string().optional(),
});

/**
 * POST /api/swarm/announce
 * 
 * Receives an announcement from another node and responds with our info.
 * This is how nodes introduce themselves to the swarm.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const announcement = announcementSchema.parse(body);
    
    const ourDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN;
    
    // Don't process announcements from ourselves
    if (announcement.domain === ourDomain) {
      return NextResponse.json(
        { error: 'Cannot announce to self' },
        { status: 400 }
      );
    }

    // Add/update the announcing node in our registry
    const nodeInfo: SwarmNodeInfo = {
      domain: announcement.domain,
      name: announcement.name,
      description: announcement.description,
      logoUrl: announcement.logoUrl,
      publicKey: announcement.publicKey,
      softwareVersion: announcement.softwareVersion,
      userCount: announcement.userCount,
      postCount: announcement.postCount,
      capabilities: announcement.capabilities,
      lastSeenAt: new Date().toISOString(),
    };

    const { isNew } = await upsertSwarmNode(nodeInfo, 'announcement');

    console.log(`[Swarm] ${isNew ? 'New' : 'Known'} node announced: ${announcement.domain}`);

    // Respond with our own info
    const ourAnnouncement = await buildAnnouncement();
    
    return NextResponse.json({
      domain: ourAnnouncement.domain,
      name: ourAnnouncement.name,
      description: ourAnnouncement.description,
      logoUrl: ourAnnouncement.logoUrl,
      publicKey: ourAnnouncement.publicKey,
      softwareVersion: ourAnnouncement.softwareVersion,
      userCount: ourAnnouncement.userCount,
      postCount: ourAnnouncement.postCount,
      capabilities: ourAnnouncement.capabilities,
      lastSeenAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid announcement payload', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Swarm announce error:', error);
    return NextResponse.json(
      { error: 'Failed to process announcement' },
      { status: 500 }
    );
  }
}
