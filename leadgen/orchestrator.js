// ── Klivio Master Orchestrator ──
// Един процес, върви всичко непрекъснато:
//   · Inbox polling       — всеки 5 мин
//   · Campaign sending    — 09:00-18:00, на всеки 25 мин
//   · Follow-ups          — 09:30-17:30, на всеки час
//   · Lead finder         — 06:00 и 14:00
//   · Lead scorer         — след всеки finder
//   · Daily report        — 08:00
//
// node leadgen/orchestrator.js
// За production: pm2 start leadgen/orchestrator.js --name klivio
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { runCampaign }   = require('./campaign');
const { runFollowups }  = require('./followup');
const { runScoring }    = require('./scorer');
const { buildReport, sendTelegram } = require('./daily-report');
const { watchLoop }     = require('./inbox');

// ── Helpers ──
function hm() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function now() { return new Date(); }
function log(tag, msg) {
  console.log(`[${new Date().toLocaleTimeString('en-GB')}] [${tag}] ${msg}`);
}

// Track last-run times
const lastRun = {
  campaign:     0,
  followup:     0,
  finder:       0,
  dailyReport:  0,
};

// ── Campaign: run every 25 min between 09:00-18:00, max 300/run ──
async function maybeCampaign() {
  const h = now().getHours();
  if (h < 9 || h >= 18) return;
  if (Date.now() - lastRun.campaign < 25 * 60 * 1000) return;
  lastRun.campaign = Date.now();
  log('CAMPAIGN', 'Starting send batch...');
  try {
    await runCampaign({ limit: 300, dryRun: false });
    log('CAMPAIGN', 'Batch done');
  } catch (e) { log('CAMPAIGN', '❌ ' + e.message); }
}

// ── Follow-ups: run every 60 min between 09:30-17:30 ──
async function maybeFollowup() {
  const h = now().getHours(), m = now().getMinutes();
  const mins = h * 60 + m;
  if (mins < 9*60+30 || mins > 17*60+30) return;
  if (Date.now() - lastRun.followup < 60 * 60 * 1000) return;
  lastRun.followup = Date.now();
  log('FOLLOWUP', 'Running follow-up drip...');
  try {
    await runFollowups({ dryRun: false });
    log('FOLLOWUP', 'Done');
  } catch (e) { log('FOLLOWUP', '❌ ' + e.message); }
}

// ── Finder + Scorer: 06:00 and 14:00 ──
async function maybeFinder() {
  const h = now().getHours();
  const shouldRun = (h === 6 || h === 14);
  if (!shouldRun) return;
  if (Date.now() - lastRun.finder < 60 * 60 * 1000) return; // once per hour at most
  lastRun.finder = Date.now();
  log('FINDER', 'Running lead discovery...');
  try {
    const { bulkFind } = require('./finder');
    await bulkFind();
    log('FINDER', 'Done. Scoring new leads...');
    runScoring({ save: true });
    log('FINDER', 'Scored');
  } catch (e) { log('FINDER', '❌ ' + e.message); }
}

// ── Daily report: 08:00 ──
async function maybeDailyReport() {
  const h = now().getHours(), m = now().getMinutes();
  if (h !== 8 || m > 5) return; // only at 08:00-08:05
  if (Date.now() - lastRun.dailyReport < 60 * 60 * 1000) return;
  lastRun.dailyReport = Date.now();
  log('REPORT', 'Sending daily Telegram report...');
  try {
    const yesterday = new Date(Date.now() - 86400000);
    const msg = buildReport(yesterday);
    await sendTelegram(msg);
    log('REPORT', '✅ Sent');
  } catch (e) { log('REPORT', '❌ ' + e.message); }
}

// ── Main loop: tick every 60 seconds ──
async function tick() {
  await Promise.allSettled([
    maybeCampaign(),
    maybeFollowup(),
    maybeFinder(),
    maybeDailyReport(),
  ]);
}

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('  🤖 KLIVIO ORCHESTRATOR — STARTED');
  console.log('  ' + new Date().toLocaleString('en-GB'));
  console.log('═'.repeat(60) + '\n');

  // Start inbox watcher (runs its own internal loop)
  log('INBOX', 'Starting inbox watcher...');
  watchLoop().catch(e => log('INBOX', '❌ ' + e.message));

  // Score existing leads on startup
  try { runScoring({ save: true }); log('SCORER', 'Initial scoring done'); }
  catch (e) { log('SCORER', '⚠️ ' + e.message); }

  // First campaign run immediately if within hours
  await maybeCampaign();

  // Tick every 60 seconds
  setInterval(tick, 60 * 1000);
  log('ORCH', '✅ All systems running. Press Ctrl+C to stop.\n');
}

main().catch(console.error);
