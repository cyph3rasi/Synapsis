/**
 * Background Task Scheduler
 * 
 * Runs periodic tasks within the Next.js process:
 * - Bot scheduling (every 1 minute)
 * - Swarm gossip (every 5 minutes)
 * - Swarm announcement (on startup)
 */

import { processScheduledPosts } from '@/lib/bots/scheduler';
import { processAllAutonomousBots } from '@/lib/bots/autonomous';
import { runGossipRound } from '@/lib/swarm/gossip';
import { announceToSeeds } from '@/lib/swarm/discovery';
import { getSwarmStats } from '@/lib/swarm/registry';

const BOT_INTERVAL_MS = 60 * 1000; // 1 minute
const GOSSIP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const STARTUP_DELAY_MS = 10 * 1000; // Wait 10s for server to be ready

let isStarted = false;

function log(category: string, message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] [${category}] ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${timestamp}] [${category}] ${message}`);
  }
}

async function runBotTasks() {
  try {
    const scheduledResult = await processScheduledPosts();
    const autonomousResult = await processAllAutonomousBots();
    
    const posted = autonomousResult.filter(r => r.result.posted).length;
    if (scheduledResult.processed > 0 || posted > 0) {
      log('BOTS', `Processed ${scheduledResult.processed} scheduled, ${posted} autonomous posts`);
    }
  } catch (error) {
    log('BOTS', `Error: ${error}`);
  }
}

async function runSwarmGossip() {
  try {
    const result = await runGossipRound();
    if (result.contacted > 0) {
      log('SWARM', `Gossip: contacted ${result.contacted}, successful ${result.successful}, received ${result.totalNodesReceived} nodes`);
    }
  } catch (error) {
    log('SWARM', `Gossip error: ${error}`);
  }
}

async function announceToSwarm() {
  try {
    const result = await announceToSeeds();
    log('SWARM', `Announced to seeds: ${result.successful.length} successful, ${result.failed.length} failed`);
    
    const stats = await getSwarmStats();
    log('SWARM', `Network: ${stats.activeNodes} active nodes, ${stats.totalUsers} users, ${stats.totalPosts} posts`);
  } catch (error) {
    log('SWARM', `Announcement error: ${error}`);
  }
}

export function startBackgroundTasks() {
  // Prevent double-start (Next.js can call register() multiple times in dev)
  if (isStarted) return;
  isStarted = true;

  log('STARTUP', 'Background task scheduler starting...');
  log('STARTUP', `Bot interval: ${BOT_INTERVAL_MS / 1000}s, Gossip interval: ${GOSSIP_INTERVAL_MS / 1000}s`);

  // Wait for server to be fully ready before starting tasks
  setTimeout(async () => {
    log('STARTUP', 'Starting background tasks...');
    
    // Announce to swarm on startup
    await announceToSwarm();
    
    // Run initial bot check
    await runBotTasks();
    
    // Schedule recurring tasks
    setInterval(runBotTasks, BOT_INTERVAL_MS);
    setInterval(runSwarmGossip, GOSSIP_INTERVAL_MS);
    
    // First gossip after 30s (let announcement propagate)
    setTimeout(runSwarmGossip, 30 * 1000);
    
    log('STARTUP', 'Background tasks running');
  }, STARTUP_DELAY_MS);
}
