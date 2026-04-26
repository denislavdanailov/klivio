// ── Klivio Campaign Runner ──
// node leadgen/campaign.js           → пуска всички нови leads
// node leadgen/campaign.js 50        → само 50
// node leadgen/campaign.js --dry     → preview без изпращане
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { sendEmail, getDailyStats, healthCheck } = require('./sender');
const { analyzeWebsite } = require('./analyzer');
const { generateEmail } = require('./personalizer');

const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');

function loadLeads() { return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8')); }
function saveLeads(leads) { fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2)); }

function markLead(leads, id, status, extra = {}) {
  const idx = leads.findIndex(l => l.id === id);
  if (idx !== -1) Object.assign(leads[idx], { status, updatedAt: new Date().toISOString(), ...extra });
}

function log(msg) {
  const ts = new Date().toLocaleTimeString('en-GB');
  console.log(`[${ts}] ${msg}`);
}

async function runCampaign({ limit = 9999, dryRun = false } = {}) {
  // Check which Brevo accounts are actually active before starting
  if (!dryRun) await healthCheck({ silent: false });

  const stats = getDailyStats();
  const remaining = stats.totalCapacity - stats.totalToday;

  console.log('\n' + '═'.repeat(60));
  console.log('  KLIVIO CAMPAIGN RUNNER');
  console.log('═'.repeat(60));
  stats.breakdown.forEach(a => {
    const bar = '█'.repeat(Math.floor(a.sent / a.limit * 10)) + '░'.repeat(10 - Math.floor(a.sent / a.limit * 10));
    console.log(`  ${a.name.padEnd(20)} [${bar}] ${a.sent}/${a.limit} (${a.provider})`);
  });
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Capacity remaining: ${remaining}  |  Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('═'.repeat(60) + '\n');

  if (!dryRun && remaining === 0) {
    console.log('⚠️  Daily limit reached for all accounts. Run again tomorrow.');
    return;
  }

  const maxToSend = dryRun ? limit : Math.min(limit, remaining);
  const leads = loadLeads();

  // ── Pre-dedup: mark any 'new' lead whose email is already in sent_log ──
  const SENT_LOG = path.join(__dirname, 'data', 'sent_log.json');
  let sentSet = new Set();
  let sentDomains = new Set();
  try {
    const sl = JSON.parse(fs.readFileSync(SENT_LOG, 'utf-8'));
    sl.forEach(e => {
      if (e.to) sentSet.add(e.to.toLowerCase());
      // Track domain to avoid multiple emails to same business
      const dom = (e.to||'').split('@')[1];
      if (dom) sentDomains.add(dom.toLowerCase());
    });
  } catch {}
  let preMarked = 0;
  leads.forEach(l => {
    if (l.status !== 'new') return;
    const email = (l.email||'').toLowerCase();
    const domain = email.split('@')[1];
    if (sentSet.has(email) || (domain && sentDomains.has(domain))) {
      l.status = 'duplicate';
      l.updatedAt = new Date().toISOString();
      preMarked++;
    }
  });
  if (preMarked > 0) {
    saveLeads(leads);
    log(`Pre-dedup: marked ${preMarked} already-sent leads as duplicate`);
  }

  // Sort by lead score (highest first) — prioritize A-tier leads
  const toSend = leads
    .filter(l => l.status === 'new')
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, maxToSend);

  if (toSend.length === 0) {
    console.log('✅ No new leads. Add more: node leadgen/run.js scrape "dentist london"');
    return;
  }

  log(`Processing ${toSend.length} leads...\n`);
  let sent = 0, failed = 0, skipped = 0;

  const senderNames = ['James', 'Oliver', 'Harry', 'George', 'Samuel', 'Daniel'];

  for (let i = 0; i < toSend.length; i++) {
    const lead = toSend[i];
    const n = `[${i + 1}/${toSend.length}]`;

    // Check capacity per iteration
    if (!dryRun) {
      const cur = getDailyStats();
      if (cur.totalToday >= cur.totalCapacity) {
        log('Daily limit reached — stopping.');
        break;
      }
    }

    // 1. Analyze
    process.stdout.write(`${n} ${lead.business} → analyzing... `);
    const analysis = await analyzeWebsite(lead.website, lead.industry);
    process.stdout.write(`weakness found (${analysis.found ? 'website' : 'industry fallback'})\n`);

    // 2. Personalize (with deep website context)
    const senderName = senderNames[i % senderNames.length];
    const { subject, body, source } = await generateEmail({
      business: lead.business,
      contactName: lead.contactName || '',
      industry: lead.industry,
      city: lead.city || '',
      website: lead.website || '',
      weakness: analysis.weakness,
      productName: analysis.productName,
      productPrice: analysis.productPrice,
      senderName,
      websiteContext: analysis.context || {},
      ownerName: analysis.context?.ownerName || '',
    });

    log(`${n} Subject: "${subject}" | Email: ${source}`);

    // 3. Dry run preview
    if (dryRun) {
      console.log('\n┌─ PREVIEW ─────────────────────────────────────');
      console.log(`│ TO:      ${lead.email}`);
      console.log(`│ SUBJECT: ${subject}`);
      console.log(`│ PRODUCT: ${analysis.productName} ${analysis.productPrice}`);
      console.log('│');
      body.split('\n').forEach(l => console.log(`│ ${l}`));
      console.log('└───────────────────────────────────────────────\n');
      skipped++;
      continue;
    }

    // 4. Send
    const result = await sendEmail({ to: lead.email, subject, body });

    if (result.ok) {
      log(`${n} ✅ ${result.account} (${result.provider}) → ${lead.email}`);
      markLead(leads, lead.id, 'sent', {
        sentSubject: subject,
        sentBody: body,
        sentWeakness: analysis.weakness,
        sentProduct: analysis.productName,
        sentFrom: result.from,
        sentAccount: result.account,
        sentProvider: result.provider,
        sentVia: source,
        sentAt: new Date().toISOString()
      });
      sent++;
    } else if (result.reason === 'already_sent') {
      log(`${n} ⏭ Duplicate: ${lead.email}`);
      markLead(leads, lead.id, 'duplicate');
      skipped++;
    } else {
      log(`${n} ❌ ${result.reason}`);
      markLead(leads, lead.id, 'error', { errorMsg: result.reason });
      failed++;
    }

    saveLeads(leads);

    // Anti-spam delay
    if (i < toSend.length - 1 && !dryRun) {
      const sec = Math.floor(Math.random() * 17) + 8;
      await new Promise(r => setTimeout(r, sec * 1000));
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`  ✅ Sent: ${sent}   ❌ Failed: ${failed}   ⏭ Skipped: ${skipped}`);
  if (!dryRun) {
    const final = getDailyStats();
    console.log(`  Total today: ${final.totalToday}/${final.totalCapacity}`);
  }
  console.log('═'.repeat(60) + '\n');
}

module.exports = { runCampaign };

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry') || args.includes('--preview');
  const limitArg = args.find(a => !isNaN(parseInt(a)));
  const limit = limitArg ? parseInt(limitArg) : 9999;
  runCampaign({ limit, dryRun }).catch(console.error);
}
