const https = require('https');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { ACTIVE_ACCOUNTS } = require('./accounts');

const STATS_FILE = path.join(__dirname, 'data', 'send_stats.json');
const SENT_LOG   = path.join(__dirname, 'data', 'sent_log.json');

// ── Stats helpers ──
function loadStats() {
  try { return JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8')); } catch { return {}; }
}
function saveStats(s) { fs.writeFileSync(STATS_FILE, JSON.stringify(s, null, 2)); }
function loadLog() {
  try { return JSON.parse(fs.readFileSync(SENT_LOG, 'utf-8')); } catch { return []; }
}
function saveLog(l) { fs.writeFileSync(SENT_LOG, JSON.stringify(l, null, 2)); }

function todayKey() { return new Date().toISOString().slice(0, 10); }

function getSentToday(stats, accountId) {
  return (stats[accountId] && stats[accountId][todayKey()]) || 0;
}

function recordSent(accountId, to, subject) {
  const stats = loadStats();
  if (!stats[accountId]) stats[accountId] = {};
  stats[accountId][todayKey()] = (stats[accountId][todayKey()] || 0) + 1;
  saveStats(stats);

  const log = loadLog();
  log.push({ accountId, to, subject, sentAt: new Date().toISOString() });
  saveLog(log);
}

// ── Warmup schedule — gradually ramp up new accounts to avoid Brevo suspension ──
// Applied automatically: first send date recorded, limit scaled from day 0
const WARMUP_SCHEDULE = [10, 20, 40, 80, 120, 180, 250]; // day 0..6, then full limit

function getWarmupLimit(accountId, fullLimit) {
  const stats = loadStats();
  const rec = stats[accountId] || {};
  // Find earliest send date
  const dates = Object.keys(rec).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  if (!dates.length) return WARMUP_SCHEDULE[0]; // first day
  const firstDate = new Date(dates[0]);
  const today = new Date(todayKey());
  const daysSince = Math.floor((today - firstDate) / 86400000);
  if (daysSince >= WARMUP_SCHEDULE.length) return fullLimit;
  return Math.min(WARMUP_SCHEDULE[daysSince], fullLimit);
}

// ── Pick best account (least sent today, under WARMUP-adjusted limit) ──
function getAvailableAccount(preferProvider = null) {
  const stats = loadStats();
  const available = ACTIVE_ACCOUNTS.filter(a => {
    if (preferProvider && a.provider !== preferProvider) return false;
    const limit = getWarmupLimit(a.id, a.dailyLimit);
    return getSentToday(stats, a.id) < limit;
  });
  if (!available.length) return null;
  available.sort((a, b) => getSentToday(stats, a.id) - getSentToday(stats, b.id));
  return available[0];
}

// ── Already sent to this email? ──
function alreadySent(to) {
  const log = loadLog();
  return log.some(e => e.to.toLowerCase() === to.toLowerCase());
}

// ── Brevo HTTP API send ──
function sendBrevo(account, to, subject, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      sender: { name: account.name, email: account.email },
      to: [{ email: to }],
      subject,
      textContent: body,
      headers: {
        'List-Unsubscribe': `<mailto:${account.email}?subject=unsubscribe>`,
        'X-Entity-Ref-ID': Date.now().toString()
      }
    });

    const req = https.request({
      hostname: 'api.brevo.com',
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        'api-key': account.apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true);
        } else if (res.statusCode === 403 || res.statusCode === 401) {
          // Suspended / not activated — permanently skip this session
          reject(new Error(`BREVO_SUSPENDED: ${res.statusCode}`));
        } else {
          reject(new Error(`Brevo ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── Nodemailer transporter cache ──
const transporterCache = {};

function getTransporter(account) {
  if (transporterCache[account.id]) return transporterCache[account.id];

  let config;
  if (account.provider === 'turbosmtp') {
    config = {
      host: account.smtpHost,
      port: account.smtpPort,
      secure: false,
      auth: { user: account.smtpUser, pass: account.smtpPass }
    };
  } else if (account.provider === 'outlook') {
    config = {
      host: 'smtp-mail.outlook.com',
      port: 587,
      secure: false,
      auth: { user: account.email, pass: account.password },
      tls: { ciphers: 'SSLv3', rejectUnauthorized: false }
    };
  }

  transporterCache[account.id] = nodemailer.createTransport(config);
  return transporterCache[account.id];
}

function sendSmtp(account, to, subject, body) {
  return getTransporter(account).sendMail({
    from: `"${account.name}" <${account.email}>`,
    to,
    subject,
    text: body,
    headers: { 'List-Unsubscribe': `<mailto:${account.email}?subject=unsubscribe>` }
  });
}

// ── Permanently failed accounts this session (SMTP auth errors etc.) ──
const SESSION_FAILED = new Set();

// ── Main send — with account retry ──
async function sendEmail({ to, subject, body, preferProvider = null, skipDupeCheck = false }) {
  if (!skipDupeCheck && alreadySent(to)) return { ok: false, reason: 'already_sent' };

  const stats = loadStats();
  // Sort: brevo first, then turbosmtp, then outlook — reliable providers first
  const PRIORITY = { brevo: 0, turbosmtp: 1, outlook: 2 };
  const candidates = ACTIVE_ACCOUNTS
    .filter(a => {
      if (SESSION_FAILED.has(a.id)) return false;
      if (preferProvider && a.provider !== preferProvider) return false;
      const limit = getWarmupLimit(a.id, a.dailyLimit);
      return getSentToday(stats, a.id) < limit;
    })
    .sort((a, b) => {
      // Sort by provider priority first, then by least sent today
      // Use ?? not || because 0 is a valid priority (brevo=0) but || treats 0 as falsy
      const pa = PRIORITY[a.provider] ?? 9;
      const pb = PRIORITY[b.provider] ?? 9;
      if (pa !== pb) return pa - pb;
      return getSentToday(stats, a.id) - getSentToday(stats, b.id);
    });

  if (!candidates.length) return { ok: false, reason: 'no_accounts_available' };

  // Try up to 5 accounts before giving up
  for (const account of candidates.slice(0, 5)) {
    try {
      if (account.provider === 'brevo') await sendBrevo(account, to, subject, body);
      else await sendSmtp(account, to, subject, body);
      recordSent(account.id, to, subject);
      return { ok: true, account: account.name, provider: account.provider, from: account.email };
    } catch (err) {
      const msg = err.message || '';
      // Permanently disable suspended/auth-failed accounts for this session
      if (
        msg.includes('BREVO_SUSPENDED') ||
        msg.includes('535') ||
        msg.includes('SmtpClientAuthentication') ||
        msg.includes('Username and Password not accepted') ||
        msg.includes('Invalid login') ||
        msg.includes('not yet activated')
      ) {
        SESSION_FAILED.add(account.id);
        process.stdout.write(`  [SKIP] ${account.name} disabled (${msg.split(':')[0]})\n`);
      }
      // Otherwise transient error — try next account
    }
  }

  return { ok: false, reason: 'all_retry_accounts_failed' };
}

// ── Send from specific account (testing) ──
async function sendFromAccount(account, to, subject, body) {
  try {
    if (account.provider === 'brevo') await sendBrevo(account, to, subject, body);
    else await sendSmtp(account, to, subject, body);
    recordSent(account.id, to, subject);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

// ── Stats ──
function getDailyStats() {
  const stats = loadStats();
  const breakdown = ACTIVE_ACCOUNTS.map(a => {
    const sent = getSentToday(stats, a.id);
    const warmLimit = getWarmupLimit(a.id, a.dailyLimit);
    return {
      id: a.id, name: a.name, email: a.email, provider: a.provider,
      sent, limit: warmLimit, fullLimit: a.dailyLimit,
      remaining: warmLimit - sent,
      warming: warmLimit < a.dailyLimit,
    };
  });
  return {
    totalToday: breakdown.reduce((s, a) => s + a.sent, 0),
    totalCapacity: breakdown.reduce((s, a) => s + a.limit, 0),
    fullCapacity: breakdown.reduce((s, a) => s + a.fullLimit, 0),
    breakdown
  };
}

const delay = ms => new Promise(r => setTimeout(r, ms));
const randomDelay = (min = 8000, max = 20000) => delay(Math.floor(Math.random() * (max - min) + min));

// ── Health check — test all Brevo accounts, mark broken ones as SESSION_FAILED ──
// Calls /v3/account (no email sent) to verify API key is active
async function healthCheck({ silent = false } = {}) {
  const brevoAccounts = ACTIVE_ACCOUNTS.filter(a => a.provider === 'brevo');
  const results = { ok: [], suspended: [], error: [] };

  if (!silent) console.log(`\n🔍 Checking ${brevoAccounts.length} Brevo accounts...\n`);

  await Promise.all(brevoAccounts.map(account => new Promise(resolve => {
    const req = https.request({
      hostname: 'api.brevo.com',
      path: '/v3/account',
      method: 'GET',
      headers: { 'api-key': account.apiKey },
      timeout: 10000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          results.ok.push(account.id);
          if (!silent) console.log(`  ✅ ${account.name} (${account.email})`);
        } else if (res.statusCode === 403 || res.statusCode === 401) {
          SESSION_FAILED.add(account.id);
          results.suspended.push(account.id);
          if (!silent) console.log(`  ❌ ${account.name} — SUSPENDED (${res.statusCode})`);
        } else {
          results.error.push(account.id);
          if (!silent) console.log(`  ⚠️  ${account.name} — Error ${res.statusCode}`);
        }
        resolve();
      });
    });
    req.on('error', () => { results.error.push(account.id); resolve(); });
    req.on('timeout', () => { req.destroy(); results.error.push(account.id); resolve(); });
    req.end();
  })));

  if (!silent) {
    console.log(`\n  ✅ Active: ${results.ok.length} | ❌ Suspended: ${results.suspended.length} | ⚠️ Error: ${results.error.length}\n`);
  }
  return results;
}

module.exports = { sendEmail, sendFromAccount, getDailyStats, alreadySent, randomDelay, ACTIVE_ACCOUNTS, healthCheck };
