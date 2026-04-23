require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { chat } = require('./chatbot');
const { handleWebhook } = require('./voice');

const app = express();
app.use(express.json());
app.use(express.static(__dirname, { index: 'index.html' }));

// ── Storage ──
const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]');

function readOrders() { return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf-8')); }
function writeOrders(orders) { fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2)); }

// ── Deadline logic (business days) ──
const DELIVERY_DAYS = {
  'AI Lead Responder':       2,
  'Follow-Up Automator':     3,
  'AI Chatbot':              4,
  'Review & Referral System':2,
  'Valuation Bot':           3,
  'Report Generator':        3,
  'Cold Outreach Setup':     5,
  'Live Chat Assistant':     3,
  'Voice Assistant':         5,
  'Custom Build':            10
};

function addBusinessDays(date, days) {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const d = result.getDay();
    if (d !== 0 && d !== 6) added++;
  }
  return result;
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

// ── Onboarding questions per product ──
const ONBOARDING = {
  'AI Lead Responder': [
    'What email address do your leads contact you on?',
    "What should the AI say when it replies to a new lead? (Or leave blank and we'll craft it for you)",
    "Should it try to book a call/appointment? If yes — what's your calendar link or availability?"
  ],
  'Follow-Up Automator': [
    'What tool do you use to manage customers? (Gmail, spreadsheet, CRM — any is fine)',
    'At what point does a lead go cold for you? (e.g. after 3 days of no reply)',
    'What tone should follow-ups have — formal or friendly?'
  ],
  'AI Chatbot': [
    'What is your website URL?',
    'What are the 5 most common questions your customers ask?',
    'Should the chatbot book appointments? If yes — what booking tool do you use (Calendly, etc.)?',
    'What is your website built on? (WordPress, Wix, Shopify, custom...)'
  ],
  'Review & Referral System': [
    'What is your Google Business Profile link? (search your business on Google Maps and copy the URL)',
    'How do you currently contact customers after a job? (email / SMS / WhatsApp)',
    'What is a typical job you do? (e.g. "dental cleaning", "house valuation")'
  ],
  'Valuation Bot': [
    'What service or product are you pricing? (e.g. cleaning, web design, roofing)',
    'What factors affect your price? (e.g. size, location, urgency)',
    'What should happen after the bot gives an estimate — book a call, send an email, or just display the price?'
  ],
  'Report Generator': [
    'What type of report do you generate? (e.g. inspection, audit, SEO report)',
    'What data goes into it? (please list the fields/sections)',
    'Can you attach a sample report so we can match the format?'
  ],
  'Cold Outreach Setup': [
    'Who is your ideal customer? (industry, size, location)',
    'What do you sell and what problem does it solve?',
    'Do you have an existing lead list or should we build one from scratch?',
    'What email address should outreach come from?'
  ],
  'Live Chat Assistant': [
    'What is your website URL?',
    'What are the 5 most common questions your customers ask?',
    'What is your website built on? (WordPress, Wix, Shopify, custom...)',
    'Should the chat capture name + email before answering, or just answer directly?'
  ],
  'Voice Assistant': [
    'What is your business name and what do you do?',
    'What is your current business phone number?',
    'What do callers typically ask about? (e.g. pricing, availability, location)',
    'What are your opening hours?',
    "When the AI can't help — should it take a message, transfer the call, or book a callback?"
  ],
  'Custom Build': [
    'Describe in detail what you need built',
    'What problem are you trying to solve?',
    'What tools/systems do you currently use in your business?',
    'Do you have a deadline or launch date in mind?'
  ]
};

// ── Brevo SMTP ──
const notifyTransport = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_NOTIFY_LOGIN || '',
    pass: process.env.BREVO_NOTIFY_PASS || ''
  }
});

// ── POST /api/order ──
app.post('/api/order', async (req, res) => {
  try {
    const { name, email, website, language, notes, product, price } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email required' });

    const deliveryDays = DELIVERY_DAYS[product] || 5;
    const deadline = addBusinessDays(new Date(), deliveryDays);

    const order = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name, email,
      website: website || '',
      language: language || 'English',
      notes: notes || '',
      product: product || 'Unknown',
      price: price || '',
      status: 'pending',
      deadline: deadline.toISOString(),
      deliveryDays,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      statusHistory: [{ status: 'pending', at: new Date().toISOString() }]
    };

    const orders = readOrders();
    orders.push(order);
    writeOrders(orders);

    // ── Emails ──
    if (process.env.BREVO_NOTIFY_LOGIN && process.env.BREVO_NOTIFY_PASS) {
      const questions = (ONBOARDING[product] || []).map((q, i) => `<li style="margin-bottom:8px">${q}</li>`).join('');

      // Notify admin
      notifyTransport.sendMail({
        from: '"Klivio Orders" <james@klivio.bond>',
        to: process.env.NOTIFY_EMAIL || 'hello@klivio.bond',
        subject: `🆕 New Order: ${product} — ${name}`,
        html: `<div style="font-family:sans-serif;max-width:560px">
          <h2 style="color:#1C1A17">New Order #${order.id}</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:8px;color:#777">Product</td><td style="padding:8px"><b>${product}</b> (${price})</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;color:#777">Client</td><td style="padding:8px">${name} — ${email}</td></tr>
            <tr><td style="padding:8px;color:#777">Website</td><td style="padding:8px">${website || 'N/A'}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;color:#777">Language</td><td style="padding:8px">${language}</td></tr>
            <tr><td style="padding:8px;color:#777">Notes</td><td style="padding:8px">${notes || 'None'}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;color:#777">Deadline</td><td style="padding:8px"><b style="color:#B5522A">${formatDate(deadline)} (${deliveryDays} business days)</b></td></tr>
            <tr><td style="padding:8px;color:#777">Order ID</td><td style="padding:8px;font-family:monospace">${order.id}</td></tr>
          </table>
        </div>`
      }).catch(e => console.error('Admin notify failed:', e.message));

      // Onboarding email to client
      notifyTransport.sendMail({
        from: '"James at Klivio" <james@klivio.bond>',
        to: email,
        subject: `Your ${product} — a few quick questions`,
        html: `<div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:32px;color:#1C1A17">
          <h2 style="margin-bottom:4px">Hey ${name.split(' ')[0]}, we're on it.</h2>
          <p style="color:#777;margin-top:0">Order confirmed — <b>${product}</b> · Deadline: <b>${formatDate(deadline)}</b></p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p>To get started, we just need a few quick answers. <b>Reply to this email</b> with your answers and we'll handle everything else.</p>
          <ol style="line-height:1.8;padding-left:20px">
            ${questions}
          </ol>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="font-size:13px;color:#999">Order ID: ${order.id} · Questions? <a href="https://t.me/klivio" style="color:#C8A84B">Message us on Telegram</a></p>
        </div>`
      }).catch(e => console.error('Client onboarding email failed:', e.message));
    }

    res.json({ success: true, orderId: order.id, deadline: deadline.toISOString() });
  } catch (err) {
    console.error('Order error:', err.message);
    res.status(500).json({ error: 'Failed to process order' });
  }
});

// ── PUT /api/order/:id/status — Update order status ──
app.put('/api/order/:id/status', (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  const { status, note } = req.body;
  const validStatuses = ['pending', 'in_progress', 'waiting_client', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const orders = readOrders();
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Order not found' });

  orders[idx].status = status;
  orders[idx].updatedAt = new Date().toISOString();
  orders[idx].statusHistory = orders[idx].statusHistory || [];
  orders[idx].statusHistory.push({ status, note: note || '', at: new Date().toISOString() });
  writeOrders(orders);

  res.json({ success: true, order: orders[idx] });
});

// ── GET /api/orders ──
app.get('/api/orders', (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  const orders = readOrders();
  res.json(orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// ── GET /api/sent — sent campaign emails ──
app.get('/api/sent', (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const leads = JSON.parse(fs.readFileSync(path.join(__dirname, 'leadgen', 'data', 'leads.json'), 'utf-8'));
    const sent = leads
      .filter(l => l.status === 'sent')
      .map(l => ({
        id: l.id,
        business: l.business,
        email: l.email,
        industry: l.industry,
        website: l.website,
        sentSubject: l.sentSubject,
        sentBody: l.sentBody,
        sentProduct: l.sentProduct,
        sentWeakness: l.sentWeakness,
        sentFrom: l.sentFrom,
        sentAccount: l.sentAccount,
        sentProvider: l.sentProvider,
        sentAt: l.sentAt || l.updatedAt
      }))
      .sort((a, b) => new Date(b.sentAt || 0) - new Date(a.sentAt || 0));
    res.json(sent);
  } catch { res.json([]); }
});

// ── GET /api/leads — all leads with stats ──
app.get('/api/leads', (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const leads = JSON.parse(fs.readFileSync(path.join(__dirname, 'leadgen', 'data', 'leads.json'), 'utf-8'));
    res.json(leads);
  } catch { res.json([]); }
});

// ── GET /api/campaign-stats — sending stats per account + overall ──
app.get('/api/campaign-stats', (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { getDailyStats } = require('./leadgen/sender');
    const stats = getDailyStats();
    const leads = JSON.parse(fs.readFileSync(path.join(__dirname, 'leadgen', 'data', 'leads.json'), 'utf-8'));
    const byStatus = {};
    const byIndustry = {};
    const byCity = {};
    leads.forEach(l => {
      byStatus[l.status] = (byStatus[l.status] || 0) + 1;
      byIndustry[l.industry] = (byIndustry[l.industry] || 0) + 1;
      if (l.city) byCity[l.city] = (byCity[l.city] || 0) + 1;
    });

    // Sent log
    let sentLog = [];
    try { sentLog = JSON.parse(fs.readFileSync(path.join(__dirname, 'leadgen', 'data', 'sent_log.json'), 'utf-8')); } catch {}
    const sentByDate = {};
    sentLog.forEach(e => {
      const d = (e.sentAt || '').slice(0, 10);
      if (d) sentByDate[d] = (sentByDate[d] || 0) + 1;
    });

    res.json({
      accounts: stats,
      leads: {
        total: leads.length,
        byStatus,
        byIndustry,
        byCity,
      },
      sentByDate,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Admin dashboard ──
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ── Sent emails view ──
app.get('/sent', (req, res) => {
  res.sendFile(path.join(__dirname, 'sent.html'));
});

// ── Leads dashboard ──
app.get('/leads', (req, res) => {
  res.sendFile(path.join(__dirname, 'leads.html'));
});

// ── Campaign dashboard ──
app.get('/campaign', (req, res) => {
  res.sendFile(path.join(__dirname, 'campaign.html'));
});

// ── Fallback ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Voice Webhook (Telnyx) ──
app.post('/api/voice', async (req, res) => {
  res.sendStatus(200); // Acknowledge immediately
  try { await handleWebhook(req.body); } catch (e) { console.error('Voice error:', e.message); }
});

// ── Chatbot API ──
app.post('/api/chat', async (req, res) => {
  const { sessionId, message } = req.body;
  if (!sessionId || !message) return res.status(400).json({ error: 'missing fields' });
  try {
    const reply = await chat(sessionId, message);
    res.json({ reply });
  } catch (e) {
    res.json({ reply: "Sorry, I'm having a moment. Try again or email us at hello@klivio.bond" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Klivio running on http://localhost:${PORT}`));
