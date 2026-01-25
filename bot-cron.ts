/**
 * Bot Cron Job Script
 * 
 * Run with PM2:
 *   pm2 start bot-cron.ts --name "bot-cron" --cron "* * * * *" --no-autorestart
 * 
 * Or for continuous running with internal interval:
 *   pm2 start bot-cron.ts --name "bot-cron"
 */

const INTERVAL_MS = 60 * 1000; // 1 minute
const API_URL = process.env.NEXT_PUBLIC_NODE_DOMAIN 
  ? `https://${process.env.NEXT_PUBLIC_NODE_DOMAIN}/api/cron/bots`
  : 'http://localhost:3000/api/cron/bots';
const AUTH_SECRET = process.env.AUTH_SECRET || '';

async function runCron() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Running bot cron job...`);
  
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (AUTH_SECRET) {
      headers['Authorization'] = `Bearer ${AUTH_SECRET}`;
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      headers,
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log(`[${timestamp}] Cron completed:`, JSON.stringify(data, null, 2));
    } else {
      console.error(`[${timestamp}] Cron failed:`, data);
    }
  } catch (error) {
    console.error(`[${timestamp}] Cron error:`, error);
  }
}

// Check if running with PM2 cron (single execution) or continuous mode
const isPM2Cron = process.env.PM2_CRON === 'true' || process.argv.includes('--once');

if (isPM2Cron) {
  // Single execution mode (PM2 handles scheduling)
  runCron().then(() => process.exit(0));
} else {
  // Continuous mode with internal interval
  console.log(`Bot cron started. Running every ${INTERVAL_MS / 1000} seconds.`);
  console.log(`API URL: ${API_URL}`);
  
  // Run immediately on start
  runCron();
  
  // Then run on interval
  setInterval(runCron, INTERVAL_MS);
}
