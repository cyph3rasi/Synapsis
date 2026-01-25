/**
 * Swarm Timeline
 * 
 * Fetches and aggregates posts from across the swarm network.
 */

import { getActiveSwarmNodes } from './registry';
import type { SwarmPost } from '@/app/api/swarm/timeline/route';

interface TimelineResult {
  posts: SwarmPost[];
  sources: { domain: string; postCount: number; isNsfw?: boolean; error?: string }[];
  fetchedAt: string;
}

interface TimelineOptions {
  includeNsfw?: boolean; // Whether to include NSFW content
}

/**
 * Fetch timeline from a single node
 */
async function fetchNodeTimeline(
  domain: string,
  limit: number = 20
): Promise<{ posts: SwarmPost[]; nodeIsNsfw?: boolean; error?: string }> {
  try {
    const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
    const url = `${baseUrl}/api/swarm/timeline?limit=${limit}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return { posts: [], error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { posts: data.posts || [], nodeIsNsfw: data.nodeIsNsfw };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { posts: [], error: message };
  }
}

/**
 * Fetch aggregated timeline from the swarm
 * 
 * Queries multiple nodes in parallel and merges results.
 * Filters out NSFW content unless explicitly requested.
 */
export async function fetchSwarmTimeline(
  maxNodes: number = 10,
  postsPerNode: number = 10,
  options: TimelineOptions = {}
): Promise<TimelineResult> {
  const { includeNsfw = false } = options;
  
  // Get active nodes to query
  const nodes = await getActiveSwarmNodes(maxNodes);
  
  // Always include our own posts
  const ourDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost';
  
  // Filter out NSFW nodes if not including NSFW content
  const eligibleNodes = includeNsfw 
    ? nodes 
    : nodes.filter(n => !n.isNsfw);
  
  const nodesToQuery = [
    ourDomain,
    ...eligibleNodes.map(n => n.domain).filter(d => d !== ourDomain)
  ].slice(0, maxNodes);

  // Fetch from all nodes in parallel
  const results = await Promise.all(
    nodesToQuery.map(async (domain) => {
      const result = await fetchNodeTimeline(domain, postsPerNode);
      return {
        domain,
        ...result,
      };
    })
  );

  // Collect all posts and track sources
  const allPosts: SwarmPost[] = [];
  const sources: TimelineResult['sources'] = [];

  for (const result of results) {
    sources.push({
      domain: result.domain,
      postCount: result.posts.length,
      isNsfw: result.nodeIsNsfw,
      error: result.error,
    });
    
    // Filter NSFW posts if not including NSFW
    const filteredPosts = includeNsfw 
      ? result.posts 
      : result.posts.filter(p => !p.isNsfw);
    
    allPosts.push(...filteredPosts);
  }

  // Sort by createdAt descending and dedupe by id
  const seen = new Set<string>();
  const uniquePosts = allPosts
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .filter(post => {
      const key = `${post.nodeDomain}:${post.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return {
    posts: uniquePosts,
    sources,
    fetchedAt: new Date().toISOString(),
  };
}
