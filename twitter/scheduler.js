// ── Klivio X Multi-Account Scheduler ──
// Posts up to account.dailyLimit tweets per active account.
// 4 accounts × 10 tweets = 40 tweets/day.
// node twitter/scheduler.js          → run now
// node twitter/scheduler.js --dry    → preview without posting
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs   = require('fs');
const path = require('path');
const { generateDailyBatch } = require('./content');
const { postTweetAs, replyToTweet, searchTweets } = require('./poster');
const { findXLeads } = require('./leads');
const { ACTIVE_ACCOUNTS } = require('./accounts');

const LOG_FILE = path.join(__dirname, 'logs', 'x-activity.json');
const DRY_RUN  = process.argv.includes('--dry');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(entry) {
  if (!fs.existsSync(path.join(__dirname, 'logs'))) {
    fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });
  }
  const existing = fs.existsSync(LOG_FILE)
    ? JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'))
    : [];
  existing.push({ ...entry, at: new Date().toISOString() });
  fs.writeFileSync(LOG_FILE, JSON.stringify(existing.slice(-1000), null, 2));
}

function sendTelegram(msg) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return Promise.resolve();
  const https = require('https');
  const body  = JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' });
  return new Promise(resolve => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => { res.resume(); resolve(); });
    req.on('error', resolve);
    req.write(body);
    req.end();
  });
}

async function postForAccount(account) {
  const count = account.dailyLimit || 10;
  console.log(`\n  ── ${account.handle} (${count} tweets) ──`);

  const tweets = await generateDailyBatch(count);
  let posted = 0;
  let failed = 0;

  for (let i = 0; i < tweets.length; i++) {
    const t = tweets[i];

    if (DRY_RUN) {
      console.log(`  [DRY ${i + 1}/${count}] [${t.type}]\n  ${t.text}\n`);
      continue;
    }

    try {
      const result = await postTweetAs(account, t.text);
      console.log(`  ✓ [${t.type}] ${t.text.slice(0, 65)}...`);
      log({ account: account.id, type: 'tweet', tweetType: t.type, tweetId: result.id, text: t.text });
      posted++;
    } catch (err) {
      console.log(`  ✗ [${t.type}] ${err.message}`);
      failed++;
    }

    // Space posts out — don't hammer the API
    if (i < tweets.length - 1) await sleep(4000 + Math.random() * 3000);
  }

  return { posted, failed };
}

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log(`  KLIVIO X SCHEDULER — ${new Date().toLocaleString('en-GB')}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no posting)' : 'LIVE'}`);
  console.log(`  Accounts: ${ACTIVE_ACCOUNTS.length} active`);
  console.log('═'.repeat(60));

  if (ACTIVE_ACCOUNTS.length === 0) {
    console.log('\n⚠  No active X accounts found.\n');
    console.log('Add credentials to .env:');
    console.log('  X_API_KEY=...');
    console.log('  X_API_SECRET=...');
    console.log('  X_ACCESS_TOKEN=...');
    console.log('  X_ACCESS_TOKEN_SECRET=...');
    console.log('  X_BEARER_TOKEN=...\n');
    console.log('For 40+ tweets/day, add X2_, X3_, X4_ prefixed keys in accounts.js');
    console.log('Get keys free at: https://developer.twitter.com/en/portal/projects-and-apps');
    process.exit(0);
  }

  const totalTweets = ACTIVE_ACCOUNTS.reduce((s, a) => s + (a.dailyLimit || 10), 0);
  console.log(`\n[1/3] Posting tweets — ${totalTweets} total across ${ACTIVE_ACCOUNTS.length} account(s)\n`);

  let totalPosted = 0;
  let totalFailed = 0;

  for (let i = 0; i < ACTIVE_ACCOUNTS.length; i++) {
    const account = ACTIVE_ACCOUNTS[i];
    const { posted, failed } = await postForAccount(account);
    totalPosted += posted;
    totalFailed += failed;

    // Pause between accounts to avoid rate limit cascade
    if (!DRY_RUN && i < ACTIVE_ACCOUNTS.length - 1) {
      console.log(`\n  Pausing 30s before next account...`);
      await sleep(30000);
    }
  }

  // Lead finding — use bearer token from first account that has one
  const searchAccount = ACTIVE_ACCOUNTS.find(a => a.bearerToken);

  if (!DRY_RUN && searchAccount) {
    console.log('\n[2/3] Finding leads on X...\n');
    try {
      const leads = await findXLeads({ maxPerSearch: 10, scoreThreshold: 8 });
      const topLeads = leads.slice(0, 8); // reply to top 8

      // Reply from the main account
      const replyAccount = ACTIVE_ACCOUNTS[0];

      for (const lead of topLeads) {
        if (!lead.reply || !lead.id) continue;
        try {
          await replyToTweet(lead.id, lead.reply);
          console.log(`  ✓ Replied to @${lead.username} (score: ${lead.score})`);
          log({ account: replyAccount.id, type: 'reply', username: lead.username, tweetId: lead.id, score: lead.score, reply: lead.reply });
          await sleep(5000 + Math.random() * 4000);
        } catch (err) {
          console.log(`  ✗ Reply failed @${lead.username}: ${err.message}`);
        }
      }

      console.log('\n[3/3] Sending Telegram report...');
      const msg = `*Klivio X Daily* ✅\n\nAccounts active: *${ACTIVE_ACCOUNTS.length}*\nTweets posted: *${totalPosted}*\nFailed: ${totalFailed}\nHot leads found: *${leads.length}*\nReplied to: ${topLeads.length}`;
      await sendTelegram(msg);

    } catch (err) {
      console.log(`  Lead search failed: ${err.message}`);
    }
  } else if (DRY_RUN) {
    console.log('\n[2/3] Lead search skipped (dry run)');
    console.log('[3/3] Telegram report skipped (dry run)');
  } else {
    console.log('\n[2/3] Lead search skipped (no X_BEARER_TOKEN set)');
    console.log('[3/3] Telegram report skipped');
  }

  console.log(`\n${'═'.repeat(60)}`);
  if (!DRY_RUN) {
    console.log(`Done.  Posted: ${totalPosted}  Failed: ${totalFailed}  Accounts: ${ACTIVE_ACCOUNTS.length}`);
  } else {
    console.log(`Dry run complete. Would post ~${totalTweets} tweets across ${ACTIVE_ACCOUNTS.length} account(s).`);
  }
  console.log('');
}

main().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
