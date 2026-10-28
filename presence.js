// Synergy presence keeper — runs inside a GitHub Actions job.
//
// A Discord bot shows "online" only while it holds a gateway websocket.
// GitHub Actions jobs are capped at 6 hours, so this script holds the connection
// for just under 5h45m and then exits cleanly; the next scheduled run takes over.
// Expect a short grey gap (a few minutes) between runs — that is the trade for
// running on a free host.
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('Missing DISCORD_TOKEN secret. Add it in Settings → Secrets and variables → Actions.');
  process.exit(1);
}

// Stop before GitHub's 6h job ceiling so the run ends on our terms, not a kill.
const MAX_RUNTIME_MS = 5 * 60 * 60 * 1000 + 45 * 60 * 1000; // 5h45m
const startedAt = Date.now();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
let exiting = false;

function shutdown(reason) {
  if (exiting) return;
  exiting = true;
  console.log(`[${new Date().toISOString()}] shutting down: ${reason}`);
  try {
    client.destroy();
  } catch (e) {
    /* ignore */
  }
  process.exit(0);
}

client.once('clientReady', () => {
  console.log(`[${new Date().toISOString()}] logged in as ${client.user.tag}`);
  console.log(
    `[${new Date().toISOString()}] servers: ${client.guilds.cache.map((g) => g.name).join(', ') || 'none'}`
  );
  client.user.setPresence({
    status: 'online',
    activities: [{ name: 'channel requests in #welcome', type: ActivityType.Watching }],
  });
  console.log(`[${new Date().toISOString()}] presence online`);
});

client.on('error', (e) => console.error('gateway error:', e.message));
client.on('shardReconnecting', () => console.log('reconnecting…'));

// GitHub sends SIGTERM when it cancels or times out; leave politely.
process.on('SIGTERM', () => shutdown('SIGTERM from runner'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Hold the connection, logging a heartbeat so the job never looks dead.
const beat = setInterval(() => {
  const mins = Math.round((Date.now() - startedAt) / 60000);
  console.log(`[${new Date().toISOString()}] alive ${mins}m — status ${client.isReady() ? 'online' : 'not ready'}`);
}, 15 * 60 * 1000);

setTimeout(() => {
  clearInterval(beat);
  shutdown('reached the 5h45m limit — next scheduled run continues');
}, MAX_RUNTIME_MS);

client.login(TOKEN).catch((e) => {
  console.error('login failed:', e.message);
  process.exit(1);
});
