/**
 * Swarm Interactions
 * 
 * Handles direct node-to-node interactions in the swarm network.
 * This is the "Swarm-first" approach - we try direct swarm communication
 * first, and fall back to ActivityPub for non-Synapsis nodes.
 * 
 * Supported interactions:
 * - Likes: Direct like delivery between swarm nodes
 * - Reposts: Direct repost/boost delivery
 * - Follows: Swarm-native follow relationships
 * - Replies: Already implemented in /api/swarm/replies
 * - Mentions: Direct mention notifications
 */

import { getActiveSwarmNodes } from './registry';
import type { SwarmNodeInfo } from './types';

// ============================================
// TYPES
// ============================================

export interface SwarmInteraction {
  type: 'like' | 'unlike' | 'repost' | 'unrepost' | 'follow' | 'unfollow' | 'mention';
  // The actor performing the action
  actor: {
    handle: string;
    displayName: string;
    avatarUrl?: string;
    nodeDomain: string;
  };
  // The target of the action
  target: {
    // For likes/reposts: the post ID and author
    postId?: string;
    postAuthorHandle?: string;
    // For follows: the user being followed
    userHandle?: string;
    // For mentions: the mentioned user and post context
    mentionedHandle?: string;
    mentionPostId?: string;
    mentionContent?: string;
  };
  // Metadata
  timestamp: string;
  interactionId: string; // Unique ID for deduplication
}

export interface SwarmInteractionResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface SwarmLikePayload {
  postId: string;
  like: {
    actorHandle: string;
    actorDisplayName: string;
    actorAvatarUrl?: string;
    actorNodeDomain: string;
    interactionId: string;
    timestamp: string;
  };
}

export interface SwarmUnlikePayload {
  postId: string;
  unlike: {
    actorHandle: string;
    actorNodeDomain: string;
    interactionId: string;
    timestamp: string;
  };
}

export interface SwarmRepostPayload {
  postId: string;
  repost: {
    actorHandle: string;
    actorDisplayName: string;
    actorAvatarUrl?: string;
    actorNodeDomain: string;
    repostId: string; // The ID of the repost on the actor's node
    interactionId: string;
    timestamp: string;
  };
}

export interface SwarmFollowPayload {
  targetHandle: string;
  follow: {
    followerHandle: string;
    followerDisplayName: string;
    followerAvatarUrl?: string;
    followerBio?: string;
    followerNodeDomain: string;
    interactionId: string;
    timestamp: string;
  };
}

export interface SwarmUnfollowPayload {
  targetHandle: string;
  unfollow: {
    followerHandle: string;
    followerNodeDomain: string;
    interactionId: string;
    timestamp: string;
  };
}

export interface SwarmMentionPayload {
  mentionedHandle: string;
  mention: {
    actorHandle: string;
    actorDisplayName: string;
    actorAvatarUrl?: string;
    actorNodeDomain: string;
    postId: string;
    postContent: string;
    interactionId: string;
    timestamp: string;
  };
}

// ============================================
// SWARM NODE DETECTION
// ============================================

/**
 * Check if a domain is a known Synapsis swarm node
 */
export async function isSwarmNode(domain: string): Promise<boolean> {
  const nodes = await getActiveSwarmNodes(500);
  return nodes.some(n => n.domain === domain);
}

/**
 * Get swarm node info if the domain is a swarm node
 */
export async function getSwarmNodeInfo(domain: string): Promise<SwarmNodeInfo | null> {
  const nodes = await getActiveSwarmNodes(500);
  return nodes.find(n => n.domain === domain) || null;
}

/**
 * Extract domain from a handle (e.g., "user@node.example.com" -> "node.example.com")
 */
export function extractDomainFromHandle(handle: string): string | null {
  const clean = handle.toLowerCase().replace(/^@/, '');
  const parts = clean.split('@');
  if (parts.length === 2) {
    return parts[1];
  }
  return null;
}

/**
 * Check if a handle belongs to a swarm node
 */
export async function isSwarmHandle(handle: string): Promise<boolean> {
  const domain = extractDomainFromHandle(handle);
  if (!domain) return false;
  return isSwarmNode(domain);
}

// ============================================
// INTERACTION DELIVERY
// ============================================

/**
 * Deliver a like to a swarm node
 */
export async function deliverSwarmLike(
  targetDomain: string,
  payload: SwarmLikePayload
): Promise<SwarmInteractionResponse> {
  return deliverSwarmInteraction(targetDomain, '/api/swarm/interactions/like', payload);
}

/**
 * Deliver an unlike to a swarm node
 */
export async function deliverSwarmUnlike(
  targetDomain: string,
  payload: SwarmUnlikePayload
): Promise<SwarmInteractionResponse> {
  return deliverSwarmInteraction(targetDomain, '/api/swarm/interactions/unlike', payload);
}

/**
 * Deliver a repost to a swarm node
 */
export async function deliverSwarmRepost(
  targetDomain: string,
  payload: SwarmRepostPayload
): Promise<SwarmInteractionResponse> {
  return deliverSwarmInteraction(targetDomain, '/api/swarm/interactions/repost', payload);
}

/**
 * Deliver a follow to a swarm node
 */
export async function deliverSwarmFollow(
  targetDomain: string,
  payload: SwarmFollowPayload
): Promise<SwarmInteractionResponse> {
  return deliverSwarmInteraction(targetDomain, '/api/swarm/interactions/follow', payload);
}

/**
 * Deliver an unfollow to a swarm node
 */
export async function deliverSwarmUnfollow(
  targetDomain: string,
  payload: SwarmUnfollowPayload
): Promise<SwarmInteractionResponse> {
  return deliverSwarmInteraction(targetDomain, '/api/swarm/interactions/unfollow', payload);
}

/**
 * Deliver a mention notification to a swarm node
 */
export async function deliverSwarmMention(
  targetDomain: string,
  payload: SwarmMentionPayload
): Promise<SwarmInteractionResponse> {
  return deliverSwarmInteraction(targetDomain, '/api/swarm/interactions/mention', payload);
}

/**
 * Generic interaction delivery
 */
async function deliverSwarmInteraction(
  targetDomain: string,
  endpoint: string,
  payload: unknown
): Promise<SwarmInteractionResponse> {
  try {
    const baseUrl = targetDomain.startsWith('http') 
      ? targetDomain 
      : targetDomain.startsWith('localhost') || targetDomain.startsWith('127.0.0.1')
        ? `http://${targetDomain}`
        : `https://${targetDomain}`;
    
    const url = `${baseUrl}${endpoint}`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }
    
    const data = await response.json();
    return {
      success: true,
      message: data.message,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}


// ============================================
// PROFILE FETCHING
// ============================================

export interface SwarmUserProfile {
  handle: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  headerUrl?: string;
  website?: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  createdAt: string;
  isBot?: boolean;
  nodeDomain: string;
}

export interface SwarmUserPost {
  id: string;
  content: string;
  createdAt: string;
  isNsfw: boolean;
  likesCount: number;
  repostsCount: number;
  repliesCount: number;
  media?: { url: string; mimeType?: string; altText?: string }[];
  linkPreviewUrl?: string;
  linkPreviewTitle?: string;
  linkPreviewDescription?: string;
  linkPreviewImage?: string;
}

export interface SwarmProfileResponse {
  profile: SwarmUserProfile;
  posts: SwarmUserPost[];
  nodeDomain: string;
  timestamp: string;
}

/**
 * Fetch a user profile from a swarm node
 */
export async function fetchSwarmUserProfile(
  handle: string,
  domain: string,
  postsLimit: number = 25
): Promise<SwarmProfileResponse | null> {
  try {
    const baseUrl = domain.startsWith('http')
      ? domain
      : domain.startsWith('localhost') || domain.startsWith('127.0.0.1')
        ? `http://${domain}`
        : `https://${domain}`;
    
    const url = `${baseUrl}/api/swarm/users/${handle}?limit=${postsLimit}`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error(`[Swarm] Failed to fetch profile for ${handle}@${domain}:`, error);
    return null;
  }
}

/**
 * Fetch a single post from a swarm node
 */
export async function fetchSwarmPost(
  postId: string,
  domain: string
): Promise<SwarmUserPost | null> {
  try {
    const baseUrl = domain.startsWith('http')
      ? domain
      : domain.startsWith('localhost') || domain.startsWith('127.0.0.1')
        ? `http://${domain}`
        : `https://${domain}`;
    
    const url = `${baseUrl}/api/swarm/posts/${postId}`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error(`[Swarm] Failed to fetch post ${postId} from ${domain}:`, error);
    return null;
  }
}

// ============================================
// MENTION DETECTION & DELIVERY
// ============================================

/**
 * Extract mentions from post content
 * Returns array of { handle, domain } for remote mentions
 */
export function extractMentions(content: string): { handle: string; domain: string | null }[] {
  // Match @handle or @handle@domain patterns
  const mentionRegex = /@([a-zA-Z0-9_]+)(?:@([a-zA-Z0-9.-]+))?/g;
  const mentions: { handle: string; domain: string | null }[] = [];
  
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push({
      handle: match[1].toLowerCase(),
      domain: match[2]?.toLowerCase() || null,
    });
  }
  
  return mentions;
}

/**
 * Deliver mention notifications to swarm nodes
 */
export async function deliverSwarmMentions(
  content: string,
  postId: string,
  actor: {
    handle: string;
    displayName: string;
    avatarUrl?: string;
    nodeDomain: string;
  }
): Promise<{ delivered: number; failed: number }> {
  const mentions = extractMentions(content);
  let delivered = 0;
  let failed = 0;
  
  for (const mention of mentions) {
    // Skip local mentions (no domain)
    if (!mention.domain) continue;
    
    // Check if it's a swarm node
    const isSwarm = await isSwarmNode(mention.domain);
    if (!isSwarm) continue;
    
    // Deliver the mention
    const result = await deliverSwarmMention(mention.domain, {
      mentionedHandle: mention.handle,
      mention: {
        actorHandle: actor.handle,
        actorDisplayName: actor.displayName,
        actorAvatarUrl: actor.avatarUrl,
        actorNodeDomain: actor.nodeDomain,
        postId,
        postContent: content,
        interactionId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    });
    
    if (result.success) {
      delivered++;
    } else {
      failed++;
    }
  }
  
  return { delivered, failed };
}
