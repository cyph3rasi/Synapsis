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
    const skipped = scheduledResult.skipped;
    const errors = scheduledResult.errors.length + autonomousResult.filter(r => r.error).length;
    
    // Always log bot task results for debugging
    if (scheduledResult.processed > 0 || posted > 0) {
      log('BOTS', `Processed ${scheduledResult.processed} scheduled, ${posted} autonomous posts`);
    } else if (scheduledResult.details.length > 0 || autonomousResult.length > 0) {
      // Log why bots didn't post
      const reasons = scheduledResult.details
        .filter(d => d.status !== 'posted')
        .map(d => `${d.botId.slice(0, 8)}: ${d.status}${d.message ? ` (${d.message})` : ''}`)
        .slice(0, 3);
      
      const autoReasons = autonomousResult
        .filter(r => !r.result.posted)
        .map(r => `${r.botHandle}: ${r.result.reason || r.error || 'unknown'}`)
        .slice(0, 3);
      
      if (reasons.length > 0 || autoReasons.length > 0) {
        log('BOTS', `No posts created. Scheduled: ${scheduledResult.details.length} checked, ${skipped} skipped. Autonomous: ${autonomousResult.length} checked.`);
        if (reasons.length > 0) log('BOTS', `Scheduled skip reasons: ${reasons.join('; ')}`);
        if (autoReasons.length > 0) log('BOTS', `Autonomous skip reasons: ${autoReasons.join('; ')}`);
      }
    } else {
      log('BOTS', 'No active bots found');
    }
    
    if (errors > 0) {
      log('BOTS', `Errors: ${scheduledResult.errors.join('; ')}`);
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
