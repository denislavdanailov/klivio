// ── Auto Follow-Up Sequence ──
// 3-step drip: Day +3, +7, +14 after initial send
// Stops automatically if lead replies, unsubscribes, or books
//
// node leadgen/followup.js         → run all pending follow-ups
// node leadgen/followup.js --dry   → preview without sending
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs   = require('fs');
const path = require('path');
const https = require('https');
const { sendEmail, getDailyStats } = require('./sender');

const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');
const GROQ_API_KEY = process.env.GROQ_API_KEY;

function loadLeads()  { return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8')); }
function saveLeads(l) { fs.writeFileSync(LEADS_FILE, JSON.stringify(l, null, 2)); }

// ── Follow-up templates by step (different angle each time) ──
const FOLLOWUP_ANGLES = {
  1: { // Day 3 — bump with a new angle
    name: 'gentle bump',
    templates: [
      (d) => `Hi ${d.firstName || 'there'},

Following up on my note from earlier — didn't want it to get lost.

Quick context: we've helped ${d.industry} businesses recover 15-25% more enquiries just by making sure nothing falls through the cracks.

Is now a bad time? Happy to wait, just let me know.

${d.senderName}
Klivio`,
      (d) => `${d.firstName || 'Hi'},

Quick bump on my email from a few days ago.

Not sure if it reached you — it was about ${d.weakness}. We fix that for ${d.industry} businesses in 2-3 days (fully managed, no work for you).

Worth a 10-min chat?

${d.senderName}
Klivio`,
      (d) => `Hi ${d.firstName || 'there'} — just circling back.

Did my last email land OK? Happy to share a quick video walkthrough instead if easier.

${d.senderName}`,
    ],
  },
  2: { // Day 7 — social proof angle
    name: 'social proof',
    templates: [
      (d) => `${d.firstName || 'Hi'},

Third time's the charm — one more try and I'll leave you alone.

We just finished setting up ${d.productName} for a ${d.industry} business in London last week. They captured 11 new enquiries in 5 days — ones that would have been missed before.

Worth 10 minutes to see if it'd fit ${d.business}?

${d.senderName}
Klivio`,
      (d) => `Hi ${d.firstName || 'there'},

Wanted to share something in case it's useful.

Last month we helped a ${d.industry} firm stop losing evening enquiries. In 30 days: 14 extra bookings, ~£4,200 in additional revenue. Setup was 3 days.

Same playbook would work for ${d.business}. Shall I send the 2-page case study?

${d.senderName}
Klivio`,
    ],
  },
  3: { // Day 14 — breakup / soft close
    name: 'breakup',
    templates: [
      (d) => `Hi ${d.firstName || 'there'},

Last email from me — don't want to keep cluttering your inbox.

If the timing is wrong, no hard feelings. If you'd ever like to explore this later, just reply with "later" and I'll ping you in 3 months.

Otherwise, wishing ${d.business} the best.

${d.senderName}
Klivio`,
      (d) => `${d.firstName || 'Hi'},

I'll stop here — promise.

Just in case you missed them: we help ${d.industry} businesses capture 15-25% more enquiries via AI automation, £197-497/mo, 3-day setup.

If this is ever relevant, I'm at ${d.senderEmail}.

${d.senderName}`,
    ],
  },
};

function pickTemplate(step, data) {
  const opts = FOLLOWUP_ANGLES[step].templates;
  return opts[Math.floor(Math.random() * opts.length)](data);
}

// ── Groq-powered follow-up (better than templates when available) ──
async function generateFollowup(step, data) {
  if (!GROQ_API_KEY) return pickTemplate(step, data);

  const angleInstructions = {
    1: 'This is follow-up #1 (day 3). Keep it SHORT (40-70 words). Just a gentle bump referencing the previous email without re-pitching heavily. End with a soft question.',
    2: 'This is follow-up #2 (day 7). Use social proof: mention a similar business you helped and a specific outcome (made-up OK, realistic numbers). 60-90 words.',
    3: 'This is follow-up #3 (day 14, final). Soft "breakup" email. Acknowledge you\'ll stop reaching out. No hard pitch. Give them an easy opt-in ("reply later" to re-engage in 3 months). 50-80 words.',
  };

  const prompt = `Write a cold email FOLLOW-UP to "${data.business}" (${data.industry} business in UK).

PREVIOUS EMAIL CONTEXT:
- Weakness we mentioned: ${data.weakness}
- Product we pitched: ${data.productName} at ${data.productPrice}
- Recipient first name: ${data.firstName || '(unknown, use "Hi there" or "Hi,")'}
- Our sender: ${data.senderName} from Klivio

FOLLOW-UP TYPE: ${angleInstructions[step]}

RULES:
- Plain text only. No HTML, no bullets, no emojis.
- Sign off with exactly: "${data.senderName}\\nKlivio"
- Do NOT include subject line.
- Reference the previous email naturally — don't pretend it's first contact.

Output ONLY the email body.`;

  return new Promise(resolve => {
    const payload = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
      temperature: 0.85,
    });
    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 20000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          resolve((j.choices?.[0]?.message?.content || pickTemplate(step, data)).trim());
        } catch { resolve(pickTemplate(step, data)); }
      });
    });
    req.on('error', () => resolve(pickTemplate(step, data)));
    req.on('timeout', () => { req.destroy(); resolve(pickTemplate(step, data)); });
    req.write(payload);
    req.end();
  });
}

function followupSubject(step, business, firstName) {
  const subjects = {
    1: [`Re: ${business}`, `Following up — ${business}`, `${firstName ? firstName + ', ' : ''}quick follow-up`, `Circling back on ${business}`],
    2: [`Re: ${business}`, `One more thought for ${business}`, `case study for ${business}?`, `quick example for ${business}`],
    3: [`Re: ${business}`, `Closing the loop — ${business}`, `last one for ${business}`, `${firstName ? firstName + ' — ' : ''}last email`],
  };
  const opts = subjects[step];
  return opts[Math.floor(Math.random() * opts.length)];
}

function daysBetween(d1, d2) {
  return Math.floor((new Date(d2) - new Date(d1)) / 86400000);
}

// ── Main: find leads eligible for follow-up and send ──
async function runFollowups({ dryRun = false, limit = 9999 } = {}) {
  const leads = loadLeads();
  const now = new Date();

  const FOLLOWUP_DAYS = { 1: 3, 2: 7, 3: 14 };
  const stats = getDailyStats();
  const capacity = stats.totalCapacity - stats.totalToday;

  console.log('\n' + '═'.repeat(60));
  console.log('  🔁 AUTO FOLLOW-UP RUNNER');
  console.log('═'.repeat(60));
  console.log(`  Capacity: ${capacity} | Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  const pending = [];
  for (const lead of leads) {
    // Only follow up if initial was sent and no reply yet
    if (lead.status !== 'sent') continue;
    if (lead.replied || lead.unsubscribed || lead.booked) continue;
    if (!lead.sentAt) continue;

    const followupStep = (lead.followupStep || 0) + 1;
    if (followupStep > 3) continue; // max 3 follow-ups

    const lastSendAt = lead[`followup${followupStep - 1}At`] || lead.sentAt;
    const daysSince = daysBetween(lastSendAt, now);
    const requiredDays = FOLLOWUP_DAYS[followupStep];

    if (daysSince >= requiredDays) {
      pending.push({ lead, step: followupStep });
    }
  }

  console.log(`  Eligible: ${pending.length} leads for follow-up\n`);

  if (!pending.length) { console.log('  Nothing to send.\n'); return; }

  const max = Math.min(limit, dryRun ? pending.length : capacity, pending.length);
  let sent = 0, failed = 0;

  for (let i = 0; i < max; i++) {
    const { lead, step } = pending[i];
    const firstName = (lead.contactName || '').split(' ')[0] || '';

    const data = {
      business: lead.business,
      firstName,
      industry: lead.industry,
      weakness: lead.sentWeakness || 'missed enquiries',
      productName: lead.sentProduct || 'AI Lead Responder',
      productPrice: '£197/mo',
      senderName: (lead.sentAccount || 'James').split(' ')[0],
      senderEmail: lead.sentFrom || 'hello@klivio.online',
    };

    const body = await generateFollowup(step, data);
    const subject = followupSubject(step, lead.business, firstName);

    if (dryRun) {
      console.log(`\n┌─ [${i+1}/${max}] FOLLOW-UP #${step} → ${lead.email}`);
      console.log(`│ ${lead.business}`);
      console.log(`│ SUBJECT: ${subject}`);
      console.log('│');
      body.split('\n').forEach(l => console.log(`│ ${l}`));
      console.log('└─');
      continue;
    }

    const result = await sendEmail({ to: lead.email, subject, body, skipDupeCheck: true });

    if (result.ok) {
      sent++;
      const idx = leads.findIndex(l => l.id === lead.id);
      if (idx !== -1) {
        leads[idx].followupStep = step;
        leads[idx][`followup${step}At`] = new Date().toISOString();
        leads[idx][`followup${step}Subject`] = subject;
        leads[idx][`followup${step}Body`] = body;
        leads[idx][`followup${step}Account`] = result.account;
        leads[idx].updatedAt = new Date().toISOString();
      }
      saveLeads(leads);
      console.log(`[${i+1}/${max}] ✅ Follow-up #${step} → ${lead.email} (${result.account})`);
    } else {
      failed++;
      console.log(`[${i+1}/${max}] ❌ ${lead.email}: ${result.reason}`);
    }

    // Anti-spam delay
    if (!dryRun && i < max - 1) {
      const sec = Math.floor(Math.random() * 15) + 10;
      await new Promise(r => setTimeout(r, sec * 1000));
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`  ✅ Sent: ${sent} | ❌ Failed: ${failed}`);
  console.log('═'.repeat(60) + '\n');
}

module.exports = { runFollowups };

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry') || args.includes('--preview');
  const limitArg = args.find(a => !isNaN(parseInt(a)));
  const limit = limitArg ? parseInt(limitArg) : 9999;
  runFollowups({ dryRun, limit }).catch(console.error);
}
