// ── Telegram Daily Report ──
// Run every morning at 8:00 AM — sends yesterday's campaign stats to Telegram
//
// node leadgen/daily-report.js          → send report for yesterday
// node leadgen/daily-report.js --today  → send report for today (partial)
// node leadgen/daily-report.js --test   → dry-run, print to console only
//
// Schedule via Windows Task Scheduler or cron:
//   0 8 * * *  node D:\KLIVIO\leadgen\daily-report.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const https = require('https');

const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');
const STATS_FILE = path.join(__dirname, 'data', 'send_stats.json');
const INBOX_LOG  = path.join(__dirname, 'data', 'inbox_log.json');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

function loadJson(f, def = []) {
  try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return def; }
}

function ymd(d) { return new Date(d).toISOString().slice(0, 10); }

function sendTelegram(text) {
  return new Promise((resolve) => {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.log('⚠️  TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing in .env');
      return resolve(false);
    }
    const payload = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 15000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(res.statusCode === 200));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.write(payload);
    req.end();
  });
}

function buildReport(targetDate) {
  const target = ymd(targetDate);
  const leads = loadJson(LEADS_FILE, []);
  const stats = loadJson(STATS_FILE, {});
  const inbox = loadJson(INBOX_LOG, []);

  // ── Emails sent on target date ──
  const sentOnDay = leads.filter(l => l.sentAt && ymd(l.sentAt) === target);
  const followupsOnDay = leads.filter(l =>
    [1, 2, 3].some(s => l[`followup${s}At`] && ymd(l[`followup${s}At`]) === target)
  );

  // ── Per-account breakdown ──
  const byAccount = {};
  sentOnDay.forEach(l => {
    const k = l.sentAccount || 'unknown';
    byAccount[k] = (byAccount[k] || 0) + 1;
  });
  const topAccount = Object.entries(byAccount).sort((a, b) => b[1] - a[1])[0];

  // ── Replies ──
  const repliesOnDay = leads.filter(l => l.replied && l.repliedAt && ymd(l.repliedAt) === target);
  const interestedOnDay = leads.filter(l => l.hot && l.repliedAt && ymd(l.repliedAt) === target);
  const bookedOnDay = leads.filter(l => l.booked && l.bookedAt && ymd(l.bookedAt) === target);
  const unsubOnDay = leads.filter(l => l.unsubscribed && l.unsubscribedAt && ymd(l.unsubscribedAt) === target);

  // ── New leads discovered ──
  const newLeadsOnDay = leads.filter(l => l.createdAt && ymd(l.createdAt) === target);

  // ── Reply rate (last 7 days cohort) ──
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const sent7 = leads.filter(l => l.sentAt && new Date(l.sentAt) >= weekAgo);
  const replied7 = sent7.filter(l => l.replied);
  const replyRate = sent7.length ? ((replied7.length / sent7.length) * 100).toFixed(2) : '0.00';

  // ── Totals ──
  const totalLeads = leads.length;
  const totalSent = leads.filter(l => l.status === 'sent').length;
  const totalNew = leads.filter(l => l.status === 'new').length;
  const totalHot = leads.filter(l => l.hot).length;

  // ── Build message ──
  const date = new Date(targetDate);
  const dateLabel = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  const emoji = interestedOnDay.length > 0 ? '🔥' : sentOnDay.length > 100 ? '🚀' : '📊';

  let msg = `${emoji} *Klivio Daily Report — ${dateLabel}*\n\n`;

  msg += `*📤 Outreach*\n`;
  msg += `• Initial emails: *${sentOnDay.length}*\n`;
  msg += `• Follow-ups: *${followupsOnDay.length}*\n`;
  msg += `• Total sent: *${sentOnDay.length + followupsOnDay.length}*\n\n`;

  msg += `*💬 Replies*\n`;
  msg += `• Total replies: *${repliesOnDay.length}*\n`;
  msg += `• 🔥 Interested: *${interestedOnDay.length}*\n`;
  msg += `• 📅 Booked calls: *${bookedOnDay.length}*\n`;
  msg += `• 🚫 Unsubscribed: *${unsubOnDay.length}*\n`;
  msg += `• Reply rate (7d): *${replyRate}%*\n\n`;

  msg += `*🔎 Pipeline*\n`;
  msg += `• New leads found: *${newLeadsOnDay.length}*\n`;
  msg += `• Total leads: *${totalLeads.toLocaleString()}*\n`;
  msg += `• Ready to send: *${totalNew.toLocaleString()}*\n`;
  msg += `• Already contacted: *${totalSent.toLocaleString()}*\n`;
  msg += `• 🔥 Hot leads total: *${totalHot}*\n\n`;

  if (topAccount) {
    msg += `*🏆 Top Performer*\n`;
    msg += `• ${topAccount[0]}: *${topAccount[1]}* emails\n\n`;
  }

  // Alerts
  const alerts = [];
  if (totalNew < 500) alerts.push(`⚠️ Only ${totalNew} leads in queue — run finder.js`);
  if (sentOnDay.length === 0 && new Date().getHours() > 10) alerts.push(`⚠️ Zero sends yesterday — check accounts`);
  if (interestedOnDay.length > 0) alerts.push(`🔥 ${interestedOnDay.length} hot leads waiting — follow up now!`);

  if (alerts.length) {
    msg += `*🚨 Alerts*\n`;
    alerts.forEach(a => msg += `${a}\n`);
    msg += '\n';
  }

  // Hot leads list
  if (interestedOnDay.length > 0 && interestedOnDay.length <= 5) {
    msg += `*🔥 Hot Leads to Contact*\n`;
    interestedOnDay.forEach(l => {
      msg += `• ${l.business} — ${l.email}\n`;
      if (l.replySummary) msg += `  _${l.replySummary}_\n`;
    });
    msg += '\n';
  }

  msg += `_Dashboard: https://klivio.bond/campaign_`;

  return msg;
}

async function main() {
  const args = process.argv.slice(2);
  const isTest = args.includes('--test') || args.includes('--dry');
  const isToday = args.includes('--today');

  const target = isToday ? new Date() : new Date(Date.now() - 86400000);
  const report = buildReport(target);

  console.log('\n' + '─'.repeat(60));
  console.log(report);
  console.log('─'.repeat(60) + '\n');

  if (isTest) {
    console.log('✅ Test mode — not sent to Telegram');
    return;
  }

  const ok = await sendTelegram(report);
  console.log(ok ? '✅ Report sent to Telegram' : '❌ Failed to send');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { buildReport, sendTelegram };
