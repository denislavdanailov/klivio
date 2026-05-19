// ── Auto-Reply Handler ──
// Polls IMAP inboxes → classifies replies → auto-responds or escalates
//
// Setup: Reply-To на всички outbound emails сочи към един catch-all inbox.
// Add to .env:
//   INBOX_HOST=imap.gmail.com
//   INBOX_PORT=993
//   INBOX_USER=replies@klivio.bond
//   INBOX_PASS=<app password>
//   TELEGRAM_BOT_TOKEN=<token>
//   TELEGRAM_CHAT_ID=<your chat id>
//
// Run:   node leadgen/inbox.js          → poll once
//        node leadgen/inbox.js --watch  → poll every 5 min
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs   = require('fs');
const path = require('path');
const https = require('https');
const DB   = require('../db');

const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');
const INBOX_LOG  = path.join(__dirname, 'data', 'inbox_log.json');
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Stripe Payment Links — set in .env (one per product)
const STRIPE = {
  lead_responder:    process.env.STRIPE_LEAD_LINK     || '',
  follow_up:         process.env.STRIPE_FOLLOWUP_LINK || '',
  chatbot:           process.env.STRIPE_CHATBOT_LINK  || '',
  live_chat:         process.env.STRIPE_LIVECHAT_LINK || '',
  voice_assistant:   process.env.STRIPE_VOICE_LINK    || '',
  review_system:     process.env.STRIPE_REVIEWS_LINK  || '',
};

// Pick the Stripe link that matches the product the lead was sold on.
// Falls back to the first available link.
function stripeLink(productName) {
  const p = (productName || '').toLowerCase();
  if (p.includes('lead') || p.includes('responder'))   return STRIPE.lead_responder || STRIPE.chatbot || Object.values(STRIPE).find(v => v);
  if (p.includes('follow'))                             return STRIPE.follow_up      || STRIPE.lead_responder || Object.values(STRIPE).find(v => v);
  if (p.includes('chat') && !p.includes('live'))        return STRIPE.chatbot        || STRIPE.lead_responder || Object.values(STRIPE).find(v => v);
  if (p.includes('live'))                               return STRIPE.live_chat      || STRIPE.chatbot        || Object.values(STRIPE).find(v => v);
  if (p.includes('voice'))                              return STRIPE.voice_assistant|| STRIPE.lead_responder || Object.values(STRIPE).find(v => v);
  if (p.includes('review'))                             return STRIPE.review_system  || STRIPE.lead_responder || Object.values(STRIPE).find(v => v);
  return Object.values(STRIPE).find(v => v) || 'https://klivio.online/#pricing';
}

function loadLeads()  { return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8')); }
function saveLeads(l) { fs.writeFileSync(LEADS_FILE, JSON.stringify(l, null, 2)); }
function loadInboxLog() { try { return JSON.parse(fs.readFileSync(INBOX_LOG, 'utf-8')); } catch { return []; } }
function saveInboxLog(l) { fs.writeFileSync(INBOX_LOG, JSON.stringify(l, null, 2)); }

// ── Telegram notifier ──
function notifyTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return Promise.resolve();

  return new Promise(resolve => {
    const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 10000,
    }, res => { res.on('data', () => {}); res.on('end', resolve); });
    req.on('error', () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.write(payload);
    req.end();
  });
}

// ── Classify reply via Groq ──
async function classifyReply(body, business) {
  if (!GROQ_API_KEY) {
    // Fallback: keyword classification
    const b = body.toLowerCase();
    if (/\b(unsubscribe|remove|stop|opt.?out|do not email|don't email)\b/.test(b)) return { intent: 'unsubscribe', confidence: 0.95 };
    if (/\b(not interested|no thank|no thanks|not now|leave me alone|pass)\b/.test(b)) return { intent: 'not_interested', confidence: 0.85 };
    if (/\b(interested|sounds good|tell me more|yes please|yes |demo|call|book|schedule|when can|availability)\b/.test(b)) return { intent: 'interested', confidence: 0.8 };
    if (/\b(angry|scam|spam|reported|legal|sue|how dare)\b/.test(b)) return { intent: 'angry', confidence: 0.9 };
    if (/\?/.test(b)) return { intent: 'question', confidence: 0.6 };
    return { intent: 'unclear', confidence: 0.4 };
  }

  const prompt = `Classify this email reply into ONE category:
- interested — they want a demo, call, or more info
- question — they have a specific question but no clear intent yet
- not_interested — polite no, not now, wrong time
- unsubscribe — opt-out, remove me, stop emailing
- angry — hostile, threatening, spam accusation
- auto_reply — out of office, vacation responder, bounce
- unclear — can't tell

REPLY FROM: ${business}
REPLY BODY:
"""
${body.slice(0, 1500)}
"""

Respond with ONLY a JSON object like: {"intent": "interested", "confidence": 0.9, "summary": "one-sentence summary"}`;

  return new Promise(resolve => {
    const payload = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });
    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 15000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          const parsed = JSON.parse(j.choices[0].message.content);
          resolve(parsed);
        } catch { resolve({ intent: 'unclear', confidence: 0.3, summary: 'Classification failed' }); }
      });
    });
    req.on('error', () => resolve({ intent: 'unclear', confidence: 0.3 }));
    req.on('timeout', () => { req.destroy(); resolve({ intent: 'unclear', confidence: 0.3 }); });
    req.write(payload);
    req.end();
  });
}

// ── Auto-responses — no demo, direct purchase ──
const AUTO_RESPONSES = {
  interested: (d) => {
    const link = stripeLink(d.productName);
    const price = d.productPrice || '$197/mo';
    return `Hi ${d.firstName || 'there'},

Brilliant — thanks for coming back.

${d.productName || 'Klivio'} is fully managed — we handle the entire setup for ${d.business} within 48 hours, you don't lift a finger.

Fixed price: ${price}. No contracts, cancel anytime.

You can get started right now here:
${link}

Once you're in, I'll personally oversee the setup and send you a confirmation.

${d.senderName || 'James'}
Klivio`;
  },

  question: (d) => {
    const link = stripeLink(d.productName);
    const price = d.productPrice || '$197/mo';
    return `Hi ${d.firstName || 'there'},

Happy to answer — here's the quick version:

${d.productName || 'Klivio'} is fully managed. We set it up for ${d.business} in 48 hours, you don't install anything. Price is ${price}/month — fixed, no per-message fees, no contracts.

If that sounds good, you can start directly here:
${link}

Any other questions, just reply and I'll come straight back.

${d.senderName || 'James'}
Klivio`;
  },

  not_interested: (d) => `Hi ${d.firstName || 'there'},

No worries at all — appreciate you letting me know. I'll take ${d.business} off the list.

If anything changes down the line, feel free to reach back.

${d.senderName || 'James'}`,

  unsubscribe: () => null, // Don't reply, just mark DNC

  angry: () => null, // Don't reply, escalate to human

  auto_reply: () => null, // Don't reply to out-of-office

  unclear: () => null, // Don't auto-reply, escalate
};

// ── Process a single received email ──
async function processEmail(msg) {
  const leads = loadLeads();
  const log = loadInboxLog();

  // Skip if already processed
  if (log.some(e => e.messageId === msg.messageId)) return { skipped: 'already_processed' };

  const fromEmail = msg.from.toLowerCase();
  const leadIdx = leads.findIndex(l => l.email.toLowerCase() === fromEmail);

  if (leadIdx === -1) {
    // Not in cold-outreach leads — check LeadRevive client databases
    try {
      const { processReply } = require('./leadrevive');
      const r = await processReply({ from: fromEmail, body: msg.body, subject: msg.subject || '' });
      if (r.matched) {
        log.push({ messageId: msg.messageId, from: fromEmail, at: new Date().toISOString(), source: 'leadrevive', client: r.client, intent: r.intent });
        saveInboxLog(log);
        if (r.intent === 'interested') {
          await notifyTelegram(`🔥 *LeadRevive — HOT REPLY*\n\nClient: *${r.client}*\nFrom: ${fromEmail}\n\n_Body:_ ${msg.body.slice(0, 300)}`);
        }
        return { source: 'leadrevive', client: r.client, intent: r.intent };
      }
    } catch (e) { /* LeadRevive module not yet loaded — ignore */ }

    log.push({ messageId: msg.messageId, from: fromEmail, at: new Date().toISOString(), skipped: 'not_in_leads' });
    saveInboxLog(log);
    return { skipped: 'not_in_leads' };
  }

  const lead = leads[leadIdx];
  const classification = await classifyReply(msg.body, lead.business);
  const intent = classification.intent;

  // Mark lead
  leads[leadIdx].replied = true;
  leads[leadIdx].replyIntent = intent;
  leads[leadIdx].replyBody = msg.body.slice(0, 2000);
  leads[leadIdx].replySummary = classification.summary || '';
  leads[leadIdx].replyAt = new Date().toISOString();
  leads[leadIdx].updatedAt = new Date().toISOString();

  if (intent === 'unsubscribe') leads[leadIdx].unsubscribed = true;
  if (intent === 'interested' || intent === 'question') leads[leadIdx].hot = true;

  saveLeads(leads);

  // Log processing
  log.push({
    messageId: msg.messageId,
    from: fromEmail,
    business: lead.business,
    intent,
    confidence: classification.confidence,
    at: new Date().toISOString(),
  });
  saveInboxLog(log);

  // Prepare context for auto-response
  const respData = {
    firstName: (lead.contactName || '').split(' ')[0],
    business: lead.business,
    productName: lead.sentProduct,
    productPrice: '$197-497/mo',
    senderName: (lead.sentAccount || 'James').split(' ')[0],
  };

  const responseBody = AUTO_RESPONSES[intent] ? AUTO_RESPONSES[intent](respData) : null;

  // Send auto-reply if applicable
  if (responseBody) {
    const { sendEmail } = require('./sender');
    const subject = `Re: ${msg.subject || lead.business}`;
    const result = await sendEmail({ to: lead.email, subject, body: responseBody, skipDupeCheck: true });
    if (result.ok) {
      leads[leadIdx].autoReplied = true;
      leads[leadIdx].autoReplyBody = responseBody;
      saveLeads(leads);
    }
  }

  // Save interested lead as order in Supabase
  if (intent === 'interested') {
    try {
      await DB.createOrder({
        source:  'email',
        name:    lead.contactName || lead.business,
        email:   lead.email,
        website_url: lead.website || '',
        product: lead.sentProduct || 'Unknown',
        price:   '',
        status:  'new',
        notes:   `Email lead — replied interested. Summary: ${classification.summary || ''}`,
      });
    } catch (e) {
      console.error('[DB] Failed to save email lead:', e.message);
    }
  }

  // Notify via Telegram for important events
  if (intent === 'interested') {
    await notifyTelegram(`🔥 *HOT LEAD*\n\n*${lead.business}* (${lead.email}) wants to chat!\n\n_Summary:_ ${classification.summary || '(no summary)'}\n\nAuto-reply with calendar link sent.`);
  } else if (intent === 'angry') {
    await notifyTelegram(`⚠️ *ANGRY REPLY*\n\nFrom: ${lead.business} (${lead.email})\n\n_Body:_ ${msg.body.slice(0, 300)}\n\n❗ Check manually — no auto-reply sent.`);
  } else if (intent === 'question') {
    await notifyTelegram(`❓ *QUESTION*\n\n${lead.business} asked something.\n\n_Summary:_ ${classification.summary}\n\nAuto-reply sent, but you may want to follow up.`);
  }

  return { intent, autoReplied: !!responseBody, business: lead.business, leadId: lead.id };
}

// ── IMAP poller ──
async function pollInbox() {
  let Imap, simpleParser;
  try {
    Imap = require('imap');
    simpleParser = require('mailparser').simpleParser;
  } catch {
    console.error('❌ Missing deps. Run: npm install imap mailparser');
    return;
  }

  const { INBOX_HOST, INBOX_PORT, INBOX_USER, INBOX_PASS } = process.env;
  if (!INBOX_USER || !INBOX_PASS) {
    // Silent skip — inbox monitoring optional. Log once per hour max.
    if (!global.__inboxWarnedAt || Date.now() - global.__inboxWarnedAt > 3600000) {
      console.log('ℹ️  Inbox monitoring disabled (no INBOX_USER/INBOX_PASS) — campaign continues without reply detection');
      global.__inboxWarnedAt = Date.now();
    }
    return [];
  }

  return new Promise(resolve => {
    const imap = new Imap({
      user: INBOX_USER,
      password: INBOX_PASS,
      host: INBOX_HOST || 'imap.gmail.com',
      port: parseInt(INBOX_PORT || '993'),
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
    });

    const results = [];

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err, box) => {
        if (err) { console.error('Open box err:', err); imap.end(); resolve(results); return; }

        // Fetch UNSEEN messages from last 7 days
        const since = new Date(Date.now() - 7 * 86400000);
        imap.search(['UNSEEN', ['SINCE', since]], (err, uids) => {
          if (err || !uids.length) {
            console.log(`  No new unread emails.`);
            imap.end();
            resolve(results);
            return;
          }
          console.log(`  Found ${uids.length} unread messages`);

          const fetch = imap.fetch(uids, { bodies: '', markSeen: true });
          const msgs = [];

          fetch.on('message', (msg) => {
            let raw = '';
            msg.on('body', (stream) => {
              stream.on('data', chunk => raw += chunk.toString('utf8'));
            });
            msg.once('end', () => msgs.push(raw));
          });

          fetch.once('end', async () => {
            for (const raw of msgs) {
              try {
                const parsed = await simpleParser(raw);
                const email = {
                  messageId: parsed.messageId,
                  from: (parsed.from?.value?.[0]?.address || '').toLowerCase(),
                  subject: parsed.subject || '',
                  body: parsed.text || parsed.html || '',
                  date: parsed.date || new Date(),
                };
                console.log(`  📧 From: ${email.from} | Subject: ${email.subject.slice(0, 50)}`);
                const res = await processEmail(email);
                console.log(`     → ${res.intent || res.skipped || 'done'}${res.autoReplied ? ' (auto-replied)' : ''}`);
                results.push({ email, res });
              } catch (e) {
                console.error('  Parse error:', e.message);
              }
            }
            imap.end();
            resolve(results);
          });
        });
      });
    });

    imap.once('error', e => { console.error('IMAP error:', e.message); resolve(results); });
    imap.once('end', () => {});
    imap.connect();
  });
}

async function watchLoop() {
  console.log('👁️  Watching inbox every 5 min... (Ctrl-C to stop)\n');
  while (true) {
    console.log(`\n[${new Date().toLocaleTimeString()}] Polling...`);
    try { await pollInbox(); } catch (e) { console.error('Poll error:', e.message); }
    await new Promise(r => setTimeout(r, 5 * 60 * 1000));
  }
}

module.exports = { pollInbox, processEmail, classifyReply, notifyTelegram, watchLoop };

if (require.main === module) {
  const watch = process.argv.includes('--watch');
  if (watch) watchLoop();
  else pollInbox().then(r => console.log(`\n✅ Processed ${r.length} emails.`));
}
