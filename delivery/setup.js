// ── Klivio Delivery Automation ──
// Auto-configures each product when client submits setup form.
// Called from POST /api/setup in server.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const https    = require('https');
const crypto   = require('crypto');
const fs       = require('fs');
const path     = require('path');
const nodemailer = require('nodemailer');

const BASE_URL = process.env.BASE_URL || 'https://klivio.online';

const notifyTransport = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com', port: 587, secure: false,
  auth: { user: process.env.BREVO_NOTIFY_LOGIN, pass: process.env.BREVO_NOTIFY_PASS },
});

// ── Clients DB (simple JSON file) ──
const CLIENTS_FILE = path.join(__dirname, '..', 'data', 'clients.json');

function loadClients() {
  try { return JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf-8')); }
  catch { return {}; }
}
function saveClients(clients) {
  if (!fs.existsSync(path.dirname(CLIENTS_FILE))) fs.mkdirSync(path.dirname(CLIENTS_FILE), { recursive: true });
  fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2));
}

function getClient(clientId) {
  return loadClients()[clientId] || null;
}

function createClient(data) {
  const clients = loadClients();
  const clientId = data.clientId || crypto.randomBytes(8).toString('hex');
  clients[clientId] = {
    ...data,
    clientId,
    createdAt: new Date().toISOString(),
    status: 'configuring',
  };
  saveClients(clients);
  return clients[clientId];
}

function updateClient(clientId, updates) {
  const clients = loadClients();
  if (clients[clientId]) {
    Object.assign(clients[clientId], updates, { updatedAt: new Date().toISOString() });
    saveClients(clients);
    return clients[clientId];
  }
  return null;
}

// ── Groq: generate custom AI prompt for client ──
function buildGroqPrompt(client) {
  return new Promise(resolve => {
    if (!process.env.GROQ_API_KEY) return resolve(null);
    const payload = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: `Write a concise system prompt (under 150 words) for an AI assistant for this business:

Business: ${client.businessName}
Industry: ${client.industry}
What they do: ${client.description}
Common customer questions: ${(client.commonQuestions || []).join('; ')}
Tone: professional but friendly, British English
Goal: answer questions, capture contact details, book calls

The prompt should tell the AI its name (use "your assistant"), the business name, what it does, how to handle enquiries, and when to ask for the caller's name/email/phone.

Output ONLY the system prompt text.`
      }],
      max_tokens: 300,
      temperature: 0.5,
    });
    const req = https.request({
      hostname: 'api.groq.com', path: '/openai/v1/chat/completions', method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 20000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d).choices?.[0]?.message?.content?.trim() || null); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(payload);
    req.end();
  });
}

// ── Send admin notification ──
async function notifyAdmin(client, product) {
  if (!process.env.NOTIFY_EMAIL) return;
  await notifyTransport.sendMail({
    from: '"Klivio Setup" <james@klivio.bond>',
    to: process.env.NOTIFY_EMAIL,
    subject: `🚀 New setup: ${product} — ${client.businessName}`,
    html: `<div style="font-family:sans-serif;max-width:560px">
      <h2>New client setup completed</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:8px;color:#777">Business</td><td style="padding:8px"><b>${client.businessName}</b></td></tr>
        <tr style="background:#f9f9f9"><td style="padding:8px;color:#777">Product</td><td style="padding:8px">${product}</td></tr>
        <tr><td style="padding:8px;color:#777">Email</td><td style="padding:8px">${client.email}</td></tr>
        <tr style="background:#f9f9f9"><td style="padding:8px;color:#777">Industry</td><td style="padding:8px">${client.industry}</td></tr>
        <tr><td style="padding:8px;color:#777">Client ID</td><td style="padding:8px;font-family:monospace">${client.clientId}</td></tr>
        <tr style="background:#f9f9f9"><td style="padding:8px;color:#777">Webhook</td><td style="padding:8px;font-family:monospace;font-size:12px">${client.webhookUrl || '—'}</td></tr>
      </table>
      ${client.voicePhone ? `<p><b>Phone to configure:</b> ${client.voicePhone}</p>` : ''}
      ${client.aiPrompt ? `<details><summary>AI Prompt</summary><pre style="font-size:12px;background:#f5f5f5;padding:12px">${client.aiPrompt}</pre></details>` : ''}
    </div>`,
  }).catch(() => {});
}

// ══════════════════════════════════════════════════════════
// PRODUCT SETUP HANDLERS
// ══════════════════════════════════════════════════════════

// ── AI Lead Responder (£197) ──
// Webhook endpoint that catches form submissions, auto-replies within 2 min
async function setupLeadResponder(client) {
  const webhookUrl = `${BASE_URL}/api/leads/hook/${client.clientId}`;
  const aiPrompt   = await buildGroqPrompt(client);

  updateClient(client.clientId, {
    webhookUrl,
    aiPrompt,
    product: 'AI Lead Responder',
    status: 'live',
  });

  const firstName = (client.name || '').split(' ')[0];

  await notifyTransport.sendMail({
    from: '"James at Klivio" <james@klivio.bond>',
    to: client.email,
    subject: `Your AI Lead Responder is live — here's your setup link`,
    html: `<div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:32px;color:#1C1A17">
      <h2>Hey ${firstName}, you're live. 🎉</h2>
      <p>Your <b>AI Lead Responder</b> is configured and ready. Here's what happens next:</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0">

      <h3 style="margin-bottom:8px">Step 1 — Connect your form (2 minutes)</h3>
      <p>Add this webhook URL to your contact form or website. When someone submits an enquiry, our AI replies within 2 minutes.</p>
      <div style="background:#f5f5f5;padding:12px;border-radius:6px;font-family:monospace;font-size:13px;word-break:break-all">${webhookUrl}</div>
      <p style="font-size:13px;color:#777">Using WordPress? Gravity Forms, Contact Form 7, and WPForms all support webhooks. Use the "Webhook" action or plugin.</p>
      <p style="font-size:13px;color:#777">Using Wix, Squarespace, Webflow, or Shopify? We'll configure it for you — just reply to this email.</p>

      <h3 style="margin-bottom:8px">Step 2 — Test it</h3>
      <p>Submit your own contact form. Within 2 minutes you should get an AI reply. If not, reply to this email and we'll debug it immediately.</p>

      <h3 style="margin-bottom:8px">What the AI does</h3>
      <ul style="line-height:1.8">
        <li>Responds to every new enquiry in under 2 minutes, 24/7</li>
        <li>Answers questions, qualifies leads, books calls</li>
        <li>Trained on your business: <b>${client.businessName}</b></li>
        <li>Forwards qualified leads to: <b>${client.notifyEmail || client.email}</b></li>
      </ul>

      <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
      <p style="font-size:13px;color:#999">Questions? Reply to this email or <a href="https://t.me/klivio" style="color:#C8A84B">message us on Telegram</a>. We typically reply in under 30 minutes.</p>
      <p style="font-size:13px">James<br>Klivio</p>
    </div>`,
  });

  await notifyAdmin(client, 'AI Lead Responder');
  return { webhookUrl, status: 'live' };
}

// ── Follow-Up Automator (£197) ──
// Client adds webhook to their form → we handle 3/7/14-day sequences
async function setupFollowUpAutomator(client) {
  const webhookUrl = `${BASE_URL}/api/followup/hook/${client.clientId}`;
  const aiPrompt   = await buildGroqPrompt(client);

  updateClient(client.clientId, {
    webhookUrl,
    aiPrompt,
    product: 'Follow-Up Automator',
    followupDays: [3, 7, 14],
    status: 'live',
  });

  const firstName = (client.name || '').split(' ')[0];

  await notifyTransport.sendMail({
    from: '"James at Klivio" <james@klivio.bond>',
    to: client.email,
    subject: `Your Follow-Up Automator is live`,
    html: `<div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:32px;color:#1C1A17">
      <h2>Hey ${firstName}, your follow-up system is ready.</h2>
      <p>From now on, every lead that doesn't reply gets automatically followed up at <b>day 3, day 7, and day 14</b>. You do nothing.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0">

      <h3>Connect your lead source (2 minutes)</h3>
      <p>Add this webhook to wherever your leads come in:</p>
      <div style="background:#f5f5f5;padding:12px;border-radius:6px;font-family:monospace;font-size:13px;word-break:break-all">${webhookUrl}</div>
      <p style="font-size:13px;color:#777">The webhook expects: <code>name</code>, <code>email</code>, and optionally <code>phone</code>, <code>message</code>.</p>

      <h3>The follow-up sequence</h3>
      <ul style="line-height:1.8">
        <li><b>Day 3</b> — gentle bump, new angle</li>
        <li><b>Day 7</b> — social proof (case study from similar business)</li>
        <li><b>Day 14</b> — soft close ("last one from me")</li>
      </ul>
      <p style="font-size:13px;color:#777">Sequences stop automatically if the lead replies or unsubscribes.</p>

      <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
      <p style="font-size:13px">James<br>Klivio</p>
    </div>`,
  });

  await notifyAdmin(client, 'Follow-Up Automator');
  return { webhookUrl, status: 'live' };
}

// ── Review & Referral System (£197) ──
async function setupReviewReferral(client) {
  const webhookUrl = `${BASE_URL}/api/reviews/hook/${client.clientId}`;

  updateClient(client.clientId, {
    webhookUrl,
    product: 'Review & Referral System',
    googleReviewLink: client.googleReviewLink || '',
    reviewDelay: 1, // days after service completion
    status: 'live',
  });

  const firstName = (client.name || '').split(' ')[0];

  await notifyTransport.sendMail({
    from: '"James at Klivio" <james@klivio.bond>',
    to: client.email,
    subject: `Your Review & Referral System is live`,
    html: `<div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:32px;color:#1C1A17">
      <h2>Hey ${firstName}, you'll start getting reviews automatically.</h2>
      <p>Every time you complete a job/appointment, trigger the system — it sends a review request 24 hours later and a referral ask 7 days after that.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0">

      <h3>How to trigger a review request</h3>
      <p>After completing a service, call this URL (or add it to your booking system's completion webhook):</p>
      <div style="background:#f5f5f5;padding:12px;border-radius:6px;font-family:monospace;font-size:13px;word-break:break-all">${webhookUrl}</div>
      <p style="font-size:13px;color:#777">Send: <code>customer_name</code>, <code>customer_email</code>, <code>service</code> (optional)</p>

      <h3>Your Google Review link</h3>
      <p>${client.googleReviewLink
        ? `<a href="${client.googleReviewLink}" style="color:#C8A84B">${client.googleReviewLink}</a>`
        : 'Not provided — <a href="mailto:hello@klivio.online">send us your Google Business URL</a> and we\'ll add it.'}</p>

      <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
      <p style="font-size:13px">James<br>Klivio</p>
    </div>`,
  });

  await notifyAdmin(client, 'Review & Referral System');
  return { webhookUrl, status: 'live' };
}

// ── Voice Assistant (£497) ──
// Most manual — configures AI prompt, then admin forwards number
async function setupVoiceAssistant(client) {
  const aiPrompt = await buildGroqPrompt(client);

  updateClient(client.clientId, {
    aiPrompt,
    product: 'Voice Assistant',
    voicePhone: client.voicePhone,
    status: 'configuring', // admin needs to forward the number
  });

  const firstName = (client.name || '').split(' ')[0];

  await notifyTransport.sendMail({
    from: '"James at Klivio" <james@klivio.bond>',
    to: client.email,
    subject: `Your Voice Assistant — one last step`,
    html: `<div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:32px;color:#1C1A17">
      <h2>Hey ${firstName}, almost live.</h2>
      <p>We've configured your AI voice agent. One last step: we need to set up call forwarding on your number.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0">

      <h3>What happens next (within 4 hours)</h3>
      <ol style="line-height:1.9">
        <li>We provision your dedicated AI line</li>
        <li>We'll email you the forwarding number to set up on your existing phone</li>
        <li>You add call-forwarding when busy/no-answer (takes 2 minutes in your phone settings)</li>
        <li>We run a test call together to confirm it works</li>
      </ol>

      <h3>Your phone number on file</h3>
      <p style="font-family:monospace;font-size:16px">${client.voicePhone || '— not provided'}</p>
      ${!client.voicePhone ? '<p style="color:#B5522A">Please reply with your business phone number so we can set up forwarding.</p>' : ''}

      <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
      <p style="font-size:13px;color:#777">Expected: fully live within 4-8 business hours of this email.</p>
      <p style="font-size:13px">James<br>Klivio</p>
    </div>`,
  });

  await notifyAdmin(client, 'Voice Assistant');
  return { status: 'configuring', note: 'Admin needs to provision Telnyx number and send forwarding instructions' };
}

// ── AI Chatbot / Live Chat (£297) ──
async function setupChatbot(client) {
  const aiPrompt = await buildGroqPrompt(client);
  const embedKey = crypto.randomBytes(12).toString('hex');

  updateClient(client.clientId, {
    aiPrompt,
    embedKey,
    product: client.product || 'AI Chatbot',
    status: 'live',
  });

  const firstName = (client.name || '').split(' ')[0];
  const embedScript = `<script src="${BASE_URL}/chat.js" data-key="${embedKey}"></script>`;

  await notifyTransport.sendMail({
    from: '"James at Klivio" <james@klivio.bond>',
    to: client.email,
    subject: `Your AI Chatbot is ready — 1-line install`,
    html: `<div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:32px;color:#1C1A17">
      <h2>Hey ${firstName}, your chatbot is configured.</h2>
      <p>Add one line of code to your website and it's live. That's it.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0">

      <h3>Add to your website (before &lt;/body&gt;)</h3>
      <div style="background:#f5f5f5;padding:12px;border-radius:6px;font-family:monospace;font-size:12px;word-break:break-all">${embedScript}</div>

      <h3 style="margin-top:24px">What it does on your site</h3>
      <ul style="line-height:1.8">
        <li>Appears as a chat widget (bottom-right)</li>
        <li>Answers questions about <b>${client.businessName}</b> 24/7</li>
        <li>Qualifies leads and books calls</li>
        <li>Sends you an email notification for every hot lead</li>
      </ul>

      <p style="font-size:13px;color:#777">Can't add the script yourself? Reply with your website login (or WordPress access) and we'll add it for you.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
      <p style="font-size:13px">James<br>Klivio</p>
    </div>`,
  });

  await notifyAdmin(client, client.product || 'AI Chatbot');
  return { embedScript, embedKey, status: 'live' };
}

// ── Cold Outreach Setup (£497) ──
async function setupColdOutreach(client) {
  updateClient(client.clientId, {
    product: 'Cold Outreach Setup',
    targetIndustry: client.targetIndustry,
    targetCity: client.targetCity || 'UK',
    offerDescription: client.description,
    status: 'configuring',
  });

  const firstName = (client.name || '').split(' ')[0];

  await notifyTransport.sendMail({
    from: '"James at Klivio" <james@klivio.bond>',
    to: client.email,
    subject: `Your Cold Outreach Setup — starting today`,
    html: `<div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:32px;color:#1C1A17">
      <h2>Hey ${firstName}, your outreach system is being set up.</h2>
      <p>We're configuring your personalised cold email system. Here's what's happening in the next 48 hours:</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0">

      <ol style="line-height:1.9">
        <li><b>Day 1:</b> We scrape your first 200 leads (${client.targetIndustry || 'your target industry'} businesses in ${client.targetCity || 'the UK'})</li>
        <li><b>Day 1:</b> AI writes a personalised email for each one, based on their website</li>
        <li><b>Day 2:</b> First batch of emails goes out (50/day warmup)</li>
        <li><b>Day 3:</b> You receive a report: leads contacted, opens, replies</li>
        <li><b>Ongoing:</b> 50-200 new emails per day, follow-up sequences, Telegram daily report</li>
      </ol>

      <h3>Your target</h3>
      <table style="font-size:14px;width:100%">
        <tr><td style="padding:4px;color:#777">Industry:</td><td>${client.targetIndustry || '—'}</td></tr>
        <tr><td style="padding:4px;color:#777">Location:</td><td>${client.targetCity || 'UK'}</td></tr>
        <tr><td style="padding:4px;color:#777">Your offer:</td><td>${(client.description || '').slice(0, 120)}</td></tr>
      </table>

      <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
      <p style="font-size:13px;color:#777">You'll get a Telegram notification when the first batch is sent. Questions? Reply here.</p>
      <p style="font-size:13px">James<br>Klivio</p>
    </div>`,
  });

  await notifyAdmin(client, 'Cold Outreach Setup');
  return { status: 'configuring', note: 'Admin configures targeting and launches campaign within 24h' };
}

// ── Main dispatcher ──
async function setupProduct(formData) {
  const client = createClient(formData);

  switch (formData.productKey) {
    case 'booking':
    case 'lead-responder':
      return setupLeadResponder(client);

    case 'followup':
    case 'follow-up':
      return setupFollowUpAutomator(client);

    case 'reviews':
    case 'review-referral':
      return setupReviewReferral(client);

    case 'voice':
    case 'voice-assistant':
      return setupVoiceAssistant(client);

    case 'chatbot':
    case 'chat':
    case 'live-chat':
      return setupChatbot(client);

    case 'outreach':
    case 'cold-outreach':
      return setupColdOutreach(client);

    // Bundles — set up the core products
    case 'starter':
      return setupLeadResponder(client);

    case 'growth':
      await setupLeadResponder(client);
      return setupFollowUpAutomator({ ...client, clientId: client.clientId + '_fu' });

    case 'full':
      await setupLeadResponder(client);
      await setupFollowUpAutomator({ ...client, clientId: client.clientId + '_fu' });
      return setupVoiceAssistant({ ...client, clientId: client.clientId + '_voice' });

    default:
      // Unknown product — notify admin manually
      await notifyAdmin(client, formData.product || 'Unknown');
      return { status: 'manual', note: 'Admin will contact client within 4 hours' };
  }
}

module.exports = { setupProduct, getClient, updateClient, loadClients };
