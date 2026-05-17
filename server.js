require('dotenv').config();
const http     = require('http');
const express  = require('express');
const WebSocket = require('ws');
const nodemailer = require('nodemailer');

const ADMIN_KEY = process.env.ADMIN_KEY || 'klivio-admin-2026';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { chat } = require('./chatbot');
const { handleCallControlEvent, handleMediaWebSocket } = require('./voice-elevenlabs');
const DB = require('./db');

const app    = express();
const server = http.createServer(app);

// ── WebSocket server for Telnyx media streaming ──
const wss = new WebSocket.Server({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `https://${req.headers.host}`);
  if (url.pathname === '/api/voice/stream') {
    const callControlId = url.searchParams.get('call');
    if (!callControlId) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleMediaWebSocket(ws, callControlId);
    });
  } else {
    socket.destroy();
  }
});

// ── CORS — allow klivio.online and localhost ──
app.use((req, res, next) => {
  const allowed = [
    'https://klivio.online', 'https://www.klivio.online',
    'https://klivio.netlify.app', 'https://klivioai.netlify.app',
    'http://localhost:3000', 'http://localhost:8080', 'http://localhost:5173', 'http://localhost:5174',
  ];
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-key');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Raw body for Stripe webhook (must be before express.json) ──
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Telnyx/Twilio send form-urlencoded webhooks
app.use(express.static(__dirname, { index: 'index.html' }));

// ── Date formatter for email templates ──
function formatDate(date) {
  return new Date(date).toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

// ── Onboarding questions per product ──
const ONBOARDING = {
  'STARTER Bundle': [
    'What is your business name and what do you do?',
    'What is your website URL? (or leave blank if you don\'t have one)',
    'What email address do your leads contact you on?',
    'What is the #1 problem you want the AI to fix first? (e.g. slow lead response, no follow-ups, missed calls)'
  ],
  'GROWTH Bundle': [
    'What is your business name and what do you do?',
    'What is your website URL?',
    'What are the 5 most common questions your customers ask?',
    'What booking tool do you use? (Calendly, Google Calendar, none — tell us and we\'ll sort it)',
    'What is the #1 bottleneck in your sales process right now?'
  ],
  'FULL Bundle': [
    'What is your business name and what do you do?',
    'What is your website URL?',
    'What is your current business phone number?',
    'What do callers typically ask about? (e.g. pricing, availability, location, booking)',
    'What are your opening hours?',
    'What are the 5 most common questions your customers ask?',
    'What booking tool do you use? (Calendly, Google Calendar, none)',
    'Who is your ideal outreach target? (industry, size, location)'
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
  ],
  'AI Quick Reply': [
    'What is your business name and what do you do?',
    'What email address do leads contact you on? (we will monitor this)',
    'What is your website URL? (optional)',
    'What should the AI say when it replies to a new enquiry? (we will draft this — just give us your tone)'
  ],
  'Done-For-You Growth System': [
    'What is your business name, website, and industry?',
    'What is your ideal client? (location, size, budget)',
    'What is your current phone number and email for inbound enquiries?',
    'What booking tool do you use? (Calendly, Google Calendar, other)',
    'What are your opening hours?',
    'What is the #1 result you want in the first 30 days?',
    'Who is your main point of contact for this engagement?'
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

// ── Stripe plan → product mapping ──
const STRIPE_PLAN_MAP = {
   4700: { product: 'AI Quick Reply',             price: '$47/mo',    plan: 'Quick Reply'    },
  19700: { product: 'STARTER Bundle',             price: '$197/mo',   plan: 'Starter'        },
  29700: { product: 'GROWTH Bundle',              price: '$297/mo',   plan: 'Growth'         },
  49700: { product: 'FULL Bundle',                price: '$497/mo',   plan: 'Full System'    },
 149700: { product: 'Done-For-You Growth System', price: '$1,497/mo', plan: 'Done-For-You'  },
};

function planFromAmount(pence) {
  // Round to nearest hundred to handle currency variations
  const rounded = Math.round(pence / 100) * 100;
  return STRIPE_PLAN_MAP[rounded] || STRIPE_PLAN_MAP[19700];
}

// ── POST /api/stripe/webhook ──
app.post('/api/stripe/webhook', async (req, res) => {
  const sig       = req.headers['stripe-signature'];
  const secret    = process.env.STRIPE_WEBHOOK_SECRET;
  let event;

  try {
    if (secret && sig) {
      // Verify signature using Node crypto (no stripe npm needed)
      const parts     = sig.split(',').reduce((acc, p) => { const [k,v] = p.split('='); acc[k] = v; return acc; }, {});
      const timestamp = parts.t;
      const v1sig     = parts.v1;
      const payload   = `${timestamp}.${req.body.toString()}`;
      const expectedHex = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const bActual   = Buffer.from((v1sig||'').padEnd(expectedHex.length,'0'), 'hex');
      const bExpected = Buffer.from(expectedHex, 'hex');
      if (bActual.length !== bExpected.length || !crypto.timingSafeEqual(bActual, bExpected)) {
        return res.status(400).send('Webhook signature mismatch');
      }
      event = JSON.parse(req.body.toString());
    } else {
      // Dev mode — no signature check
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('Stripe webhook parse error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session      = event.data.object;
    const customerEmail = session.customer_details?.email || session.metadata?.email || '';
    const customerName  = session.customer_details?.name  || session.metadata?.name || 'Customer';
    const amountPence   = session.amount_total || 19700;

    // Metadata from new /api/create-checkout flow
    const metaPlan     = session.metadata?.plan; // 'starter'|'growth'|'full'
    const metaBusiness = session.metadata?.business || '';
    const metaWebsite  = session.metadata?.website  || '';

    const plan         = planFromAmount(amountPence);
    // If metadata has an explicit plan key, use that for product name; otherwise fall back to amount lookup
    const planNames    = { starter: 'STARTER Bundle', growth: 'GROWTH Bundle', full: 'FULL Bundle' };
    const product      = session.metadata?.product || (metaPlan && planNames[metaPlan]) || plan.product;
    const price        = plan.price;

    // Deduplicate by Stripe session ID — skip if already saved
    const existing = await DB.findByStripeSession(session.id);
    if (!existing) {

    const order = await DB.createOrder({
      source:            'stripe_checkout',
      name:              customerName,
      email:             customerEmail,
      website_url:       metaWebsite || session.metadata?.website || '',
      language:          'English',
      notes:             `Stripe checkout: ${session.id}${metaBusiness ? ` | Business: ${metaBusiness}` : ''}`,
      product,
      price,
      status:            'pending',
      stripe_session_id: session.id,
    });

    // Telegram alert for new payment
    const tgToken = process.env.TELEGRAM_BOT_TOKEN;
    const tgChat  = process.env.TELEGRAM_CHAT_ID;
    if (tgToken && tgChat) {
      const tgMsg = `💳 *NEW PAYMENT*\n\n*${customerName}*${metaBusiness ? ` from *${metaBusiness}*` : ''}\nPlan: ${metaPlan || product}\nEmail: ${customerEmail}\nAmount: ${price}`;
      require('https').request({
        hostname: 'api.telegram.org',
        path: `/bot${tgToken}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, () => {}).on('error', () => {}).end(JSON.stringify({
        chat_id: tgChat, text: tgMsg, parse_mode: 'Markdown',
      }));
    }
    const deadline = new Date(order.deadline);
    const deliveryDays = order.delivery_days;

    // Send onboarding emails
    if (process.env.BREVO_NOTIFY_LOGIN && process.env.BREVO_NOTIFY_PASS) {
      const firstName = customerName.split(' ')[0];
      const questions = (ONBOARDING[product] || []).map(q => `<li style="margin-bottom:8px">${q}</li>`).join('');

      // Notify admin
      notifyTransport.sendMail({
        from:    '"Klivio Orders" <james@klivio.bond>',
        to:      process.env.NOTIFY_EMAIL || 'hello@klivio.online',
        subject: `💳 Stripe: ${product} — ${customerName}`,
        html: `<div style="font-family:sans-serif;max-width:560px">
          <h2 style="color:#1C1A17">Stripe Order #${order.id}</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:8px;color:#777">Product</td><td style="padding:8px"><b>${product}</b> (${price})</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;color:#777">Client</td><td style="padding:8px">${customerName} — ${customerEmail}</td></tr>
            <tr><td style="padding:8px;color:#777">Deadline</td><td style="padding:8px"><b style="color:#B5522A">${formatDate(deadline)} (${deliveryDays} biz days)</b></td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;color:#777">Stripe Session</td><td style="padding:8px;font-family:monospace;font-size:12px">${session.id}</td></tr>
          </table>
        </div>`,
      }).catch(e => console.error('Admin notify failed:', e.message));

      // Onboarding email to client — setup form link
      const productKeyMap = {
        'STARTER Bundle': 'starter', 'GROWTH Bundle': 'growth', 'FULL Bundle': 'full',
        'AI Lead Responder': 'booking', 'Follow-Up Automator': 'followup',
        'Review & Referral System': 'reviews', 'Voice Assistant': 'voice',
        'AI Chatbot': 'chatbot', 'Cold Outreach Setup': 'outreach',
        'AI Quick Reply': 'quickreply', 'Done-For-You Growth System': 'doneforyou',
      };
      const productKey = productKeyMap[product] || 'booking';
      const setupUrl = `${process.env.BASE_URL || 'https://klivio.online'}/setup/${order.id}?product=${productKey}`;
      notifyTransport.sendMail({
        from:    '"James at Klivio" <james@klivio.bond>',
        to:      customerEmail,
        subject: `Your ${product} — one quick step to go live`,
        html: `<div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:32px;color:#1C1A17">
          <h2 style="margin-bottom:4px">Hey ${firstName}, payment confirmed ✓</h2>
          <p style="color:#777;margin-top:0">Order confirmed — <b>${product}</b> · Deadline: <b>${formatDate(deadline)}</b></p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p>We just need a few details to configure your AI worker. It takes under 2 minutes:</p>
          <p style="text-align:center;margin:32px 0">
            <a href="${setupUrl}" style="background:#C8A84B;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px">Complete Your Setup →</a>
          </p>
          <p style="font-size:13px;color:#aaa">Or copy this link: ${setupUrl}</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="font-size:13px;color:#999">Order ID: ${order.id} · Questions? <a href="https://t.me/klivio" style="color:#C8A84B">Message us on Telegram</a></p>
        </div>`,
      }).catch(e => console.error('Client onboarding email failed:', e.message));
    }
    } // end dedup check
  }

  res.json({ received: true });
});

// /api/checkout is now handled by /api/create-checkout below

// ── GET /checkout — checkout page ──
app.get('/checkout', (req, res) => {
  res.sendFile(path.join(__dirname, 'checkout.html'));
});

// ── GET /success — post-payment success page ──
app.get('/success', (req, res) => {
  res.send(`<!DOCTYPE html><html lang="en"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Payment confirmed — Klivio</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{background:#0d0d0d;color:#f0f0f0;font-family:'Inter',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
      .card{max-width:480px;width:100%;background:#161616;border:1px solid #2a2a2a;border-radius:16px;padding:48px 36px;text-align:center}
      .icon{font-size:56px;margin-bottom:20px;display:block}
      h1{font-size:28px;font-weight:800;margin-bottom:10px;letter-spacing:-0.5px}
      p{color:#888;font-size:15px;line-height:1.7;margin-bottom:16px}
      a{color:#f5a623;text-decoration:none;font-weight:600}
      a:hover{text-decoration:underline}
      .back{display:inline-block;margin-top:24px;padding:12px 28px;background:#f5a623;color:#0d0d0d;border-radius:8px;font-weight:700;font-size:15px}
    </style>
  </head><body>
    <div class="card">
      <span class="icon">✅</span>
      <h1>Payment confirmed!</h1>
      <p>We'll be in touch within 24 hours to kick off your setup. Check your inbox for an email from <strong>james@klivio.bond</strong>.</p>
      <p>Questions? Just reply to that email or message us at <a href="https://t.me/klivio">t.me/klivio</a></p>
      <a href="/" class="back">Back to Klivio →</a>
    </div>
  </body></html>`);
});

// ── POST /api/create-checkout — create Stripe Checkout Session ──
// Body: { plan: 'starter'|'growth'|'full', name, email, business, website }
// Returns: { url: 'https://checkout.stripe.com/...' }
app.post('/api/create-checkout', async (req, res) => {
  const { plan, name, email, business, website } = req.body || {};

  if (!plan || !name || !email) {
    return res.status(400).json({ error: 'plan, name and email are required' });
  }

  // Resolve price ID from env
  const PRICE_IDS = {
    starter: process.env.STRIPE_PRICE_STARTER,
    growth:  process.env.STRIPE_PRICE_GROWTH,
    full:    process.env.STRIPE_PRICE_FULL,
  };

  const priceId = PRICE_IDS[plan];

  // If no price IDs configured, fall back to inline price_data (dynamic pricing)
  // This lets the checkout work immediately without pre-creating Stripe Products
  const PLAN_AMOUNTS = {
    starter: { amount: 19700, label: 'Klivio Starter — 1 AI Worker' },
    growth:  { amount: 29700, label: 'Klivio Growth — 5 AI Workers' },
    full:    { amount: 49700, label: 'Klivio Full System — All 7 AI Workers' },
  };

  const planData = PLAN_AMOUNTS[plan] || PLAN_AMOUNTS.starter;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeKey) {
    return res.status(500).json({ error: 'Stripe not configured on server. Contact hello@klivio.online' });
  }

  const baseUrl = process.env.BASE_URL || 'https://klivio.online';

  try {
    const https = require('https');

    // Build form params — use price ID if available, otherwise inline price_data
    let lineItem;
    if (priceId) {
      lineItem = new URLSearchParams({
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
      }).toString();
    } else {
      lineItem = new URLSearchParams({
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': planData.label,
        'line_items[0][price_data][unit_amount]': planData.amount.toString(),
        'line_items[0][price_data][recurring][interval]': 'month',
        'line_items[0][quantity]': '1',
      }).toString();
    }

    const baseParams = new URLSearchParams({
      mode: 'subscription',
      customer_email: email,
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout`,
      'metadata[name]': name,
      'metadata[email]': email,
      'metadata[plan]': plan,
      'metadata[business]': (business || '').slice(0, 500),
      'metadata[website]': (website || '').slice(0, 500),
    }).toString();

    const params = `${lineItem}&${baseParams}`;

    const url = await new Promise((resolve, reject) => {
      const r = https.request({
        hostname: 'api.stripe.com',
        path: '/v1/checkout/sessions',
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(stripeKey + ':').toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(params),
        },
      }, response => {
        let d = '';
        response.on('data', c => d += c);
        response.on('end', () => {
          try {
            const j = JSON.parse(d);
            if (j.error) reject(new Error(j.error.message));
            else resolve(j.url);
          } catch (e) { reject(e); }
        });
      });
      r.on('error', reject);
      r.write(params);
      r.end();
    });

    res.json({ url });
  } catch (e) {
    console.error('[create-checkout] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /setup/:clientId — client setup form ──
app.get('/setup/:clientId', (req, res) => {
  const { clientId } = req.params;
  const { product, plan } = req.query;

  const productForms = {
    'lead-responder': { title: 'AI Lead Responder', fields: [
      { name: 'businessName',    label: 'Business name',              type: 'text',     required: true  },
      { name: 'industry',        label: 'Industry (e.g. dental, law)', type: 'text',     required: true  },
      { name: 'description',     label: 'What do you do in one sentence?', type: 'text', required: true },
      { name: 'notifyEmail',     label: 'Email to receive lead alerts', type: 'email',   required: true  },
      { name: 'commonQuestions', label: '3 most common questions your customers ask (one per line)', type: 'textarea', required: false },
    ]},
    'follow-up': { title: 'Follow-Up Automator', fields: [
      { name: 'businessName',    label: 'Business name',              type: 'text',  required: true  },
      { name: 'industry',        label: 'Industry',                   type: 'text',  required: true  },
      { name: 'description',     label: 'What do you sell/offer?',    type: 'text',  required: true  },
      { name: 'notifyEmail',     label: 'Your email address',         type: 'email', required: true  },
      { name: 'website',         label: 'Website URL (optional)',     type: 'text',  required: false },
    ]},
    'voice-assistant': { title: 'Voice Assistant', fields: [
      { name: 'businessName',    label: 'Business name',              type: 'text',  required: true  },
      { name: 'industry',        label: 'Industry',                   type: 'text',  required: true  },
      { name: 'description',     label: 'What do you do?',            type: 'text',  required: true  },
      { name: 'voicePhone',      label: 'Your current business phone number', type: 'tel', required: true },
      { name: 'openingHours',    label: 'Opening hours (e.g. Mon-Fri 9-5)', type: 'text', required: true },
      { name: 'commonQuestions', label: 'What do callers typically ask? (one per line)', type: 'textarea', required: true },
    ]},
    'chatbot': { title: 'AI Chatbot', fields: [
      { name: 'businessName',    label: 'Business name',              type: 'text',  required: true  },
      { name: 'industry',        label: 'Industry',                   type: 'text',  required: true  },
      { name: 'website',         label: 'Website URL',                type: 'text',  required: true  },
      { name: 'description',     label: 'What do you do?',            type: 'text',  required: true  },
      { name: 'commonQuestions', label: '5 most common customer questions (one per line)', type: 'textarea', required: true },
      { name: 'notifyEmail',     label: 'Email to receive lead notifications', type: 'email', required: true },
    ]},
    'reviews': { title: 'Review & Referral System', fields: [
      { name: 'businessName',    label: 'Business name',              type: 'text',  required: true  },
      { name: 'industry',        label: 'Industry',                   type: 'text',  required: true  },
      { name: 'googleReviewLink',label: 'Your Google Review link',    type: 'text',  required: false },
      { name: 'notifyEmail',     label: 'Your email',                 type: 'email', required: true  },
    ]},
    'cold-outreach': { title: 'Cold Outreach Setup', fields: [
      { name: 'businessName',    label: 'Your business name',         type: 'text',  required: true  },
      { name: 'description',     label: 'What do you sell/offer?',    type: 'text',  required: true  },
      { name: 'targetIndustry',  label: 'Who do you want to target? (e.g. dental clinics, law firms)', type: 'text', required: true },
      { name: 'targetCity',      label: 'Target city/region (or "UK")', type: 'text', required: true },
      { name: 'notifyEmail',     label: 'Your email (for reports)',   type: 'email', required: true  },
    ]},
  };

  // Default form based on plan
  const planMap = { starter: 'lead-responder', growth: 'follow-up', full: 'voice-assistant' };
  const formKey  = product || planMap[plan] || 'lead-responder';
  const form     = productForms[formKey] || productForms['lead-responder'];

  const fieldsHtml = form.fields.map(f => `
    <div style="margin-bottom:20px">
      <label style="display:block;font-weight:600;margin-bottom:6px;font-size:14px">${f.label}${f.required ? ' <span style="color:#B5522A">*</span>' : ''}</label>
      ${f.type === 'textarea'
        ? `<textarea name="${f.name}" rows="4" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px;box-sizing:border-box" ${f.required ? 'required' : ''}></textarea>`
        : `<input type="${f.type}" name="${f.name}" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px;box-sizing:border-box" ${f.required ? 'required' : ''}>`}
    </div>`).join('');

  res.send(`<!DOCTYPE html><html lang="en"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Set up your ${form.title} — Klivio</title>
    <style>*{box-sizing:border-box}body{font-family:-apple-system,sans-serif;background:#f9f9f9;margin:0;padding:40px 20px}
    .card{max-width:520px;margin:0 auto;background:#fff;padding:40px;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,.08)}
    h1{margin:0 0 4px;font-size:22px}p.sub{color:#777;margin:0 0 28px;font-size:14px}
    button{width:100%;padding:14px;background:#C8A84B;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:700;cursor:pointer;margin-top:8px}
    button:hover{background:#b3933e}.logo{font-size:13px;color:#aaa;text-align:center;margin-top:20px}</style>
  </head><body>
    <div class="card">
      <h1>Set up your ${form.title}</h1>
      <p class="sub">Takes 2 minutes. We'll handle everything else.</p>
      <form method="POST" action="/api/setup">
        <input type="hidden" name="clientId" value="${clientId}">
        <input type="hidden" name="productKey" value="${formKey}">
        <input type="hidden" name="product" value="${form.title}">
        ${fieldsHtml}
        <button type="submit">Complete setup →</button>
      </form>
    </div>
    <div class="logo">Klivio · klivio.online</div>
  </body></html>`);
});

// ── POST /api/setup — process setup form, auto-configure product ──
app.post('/api/setup', async (req, res) => {
  try {
    const { setupProduct } = require('./delivery/setup');
    const formData = req.body;

    if (!formData.businessName || !formData.productKey) {
      return res.status(400).send('Missing required fields');
    }

    // Parse commonQuestions textarea into array
    if (formData.commonQuestions) {
      formData.commonQuestions = formData.commonQuestions.split('\n').map(s => s.trim()).filter(Boolean);
    }
    formData.name = formData.name || formData.businessName;
    formData.email = formData.email || formData.notifyEmail;

    const result = await setupProduct(formData);

    // Redirect to success page
    res.send(`<!DOCTYPE html><html lang="en"><head>
      <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>You're live — Klivio</title>
      <style>body{font-family:-apple-system,sans-serif;background:#f9f9f9;margin:0;padding:60px 20px;text-align:center}
      .card{max-width:480px;margin:0 auto;background:#fff;padding:48px;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,.08)}
      h1{color:#1C1A17;margin-bottom:8px}p{color:#555;font-size:15px;line-height:1.6}
      .check{font-size:48px;margin-bottom:16px}</style>
    </head><body>
      <div class="card">
        <div class="check">✅</div>
        <h1>You're all set.</h1>
        <p>Check your email — we've sent setup instructions and ${result.webhookUrl ? 'your webhook URL' : result.embedScript ? 'your embed code' : 'next steps'}.</p>
        <p style="font-size:13px;color:#aaa;margin-top:24px">Questions? Reply to the email or message us at <a href="https://t.me/klivio">t.me/klivio</a></p>
      </div>
    </body></html>`);

  } catch (err) {
    console.error('Setup error:', err.message);
    res.status(500).send('Setup failed — please email hello@klivio.online');
  }
});

// ── POST /api/order — website modal submits here before redirecting to Stripe ──
app.post('/api/order', async (req, res) => {
  try {
    const { name, email, phone, website, product, price, notes, source } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email required' });

    const order = await DB.createOrder({
      source: source || 'website',
      name, email,
      website_url: website || '',
      language: 'English',
      notes: notes || '',
      product: product || 'Unknown',
      price: price || 'TBD',
      status: 'pending',
    });

    // Telegram alert
    const tgToken = process.env.TELEGRAM_BOT_TOKEN;
    const tgChat  = process.env.TELEGRAM_CHAT_ID;
    if (tgToken && tgChat) {
      const msg = `🌐 *WEBSITE ORDER*\n\n*${name}*\nProduct: ${product}\nPrice: ${price}\nEmail: ${email}${phone ? `\nPhone: ${phone}` : ''}${website ? `\nSite: ${website}` : ''}${notes ? `\n\n${notes}` : ''}`;
      require('https').request({
        hostname: 'api.telegram.org',
        path: `/bot${tgToken}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, () => {}).on('error', () => {}).end(JSON.stringify({ chat_id: tgChat, text: msg, parse_mode: 'Markdown' }));
    }

    res.json({ ok: true, orderId: order.id });
  } catch (e) {
    console.error('POST /api/order error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/order/:id/status — Update order status ──
app.put('/api/order/:id/status', async (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  const { status, note } = req.body;
  const validStatuses = ['new', 'pending', 'active', 'in_progress', 'waiting_client', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    await DB.updateOrderStatus(req.params.id, status, note);
    res.json({ success: true });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// ── GET /api/orders ──
app.get('/api/orders', async (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { status, source } = req.query;
    const orders = await DB.getOrders({ status, source });
    res.json(orders);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/sent — sent campaign emails ──
app.get('/api/sent', (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
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
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const leads = JSON.parse(fs.readFileSync(path.join(__dirname, 'leadgen', 'data', 'leads.json'), 'utf-8'));
    res.json(leads);
  } catch { res.json([]); }
});

// ── GET /api/campaign-stats — sending stats per account + overall ──
app.get('/api/campaign-stats', (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    let stats = { totalCapacity: 0, totalToday: 0, breakdown: [] };
    try {
      const { getDailyStats } = require('./leadgen/sender');
      stats = getDailyStats();
    } catch { /* accounts.js not available on this host — campaign runs locally */ }
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

// ── Control Centre (unified dashboard) ──
app.get('/control', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
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

// ── Voice: Telnyx Call Control webhooks ──
app.post('/api/voice/cc', handleCallControlEvent);

// ── POST /api/voice/order — create order from phone call (admin or AI tool) ──
app.post('/api/voice/order', async (req, res) => {
  const key = req.headers['x-admin-key'] || req.body?.admin_key;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { name, email, phone, product, price, call_id, notes } = req.body;
    if (!product) return res.status(400).json({ error: 'product required' });
    const order = await DB.createOrder({
      source: 'phone', name, email, phone, product, price,
      status: 'pending', call_id, notes,
    });
    res.json({ success: true, orderId: order?.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ── Chatbot API ──
app.post('/api/chat', async (req, res) => {
  const { sessionId, message } = req.body;
  if (!sessionId || !message) return res.status(400).json({ error: 'missing fields' });
  try {
    const reply = await chat(sessionId, message);
    res.json({ reply });
  } catch (e) {
    res.json({ reply: "Sorry, I'm having a moment. Try again or email us at hello@klivio.online" });
  }
});

// ── GET /api/health — uptime check for monitoring ──
app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: Math.floor(process.uptime()), ts: new Date().toISOString() });
});

// ── Telegram bot webhook — /orders /hot /leads commands from phone ──
app.post('/api/telegram/webhook', async (req, res) => {
  res.sendStatus(200); // always 200 to Telegram
  const msg = req.body?.message;
  if (!msg?.text) return;
  const chatId = msg.chat?.id;
  const text   = msg.text.trim();
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;

  async function tgSend(t) {
    const https = require('https');
    const p = JSON.stringify({ chat_id: chatId, text: t, parse_mode: 'Markdown' });
    const req2 = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(p) },
      timeout: 10000,
    }, r => r.resume());
    req2.on('error', () => {});
    req2.write(p);
    req2.end();
  }

  try {
    if (text.startsWith('/orders') || text.startsWith('/pipeline')) {
      const orders = await DB.getOrders({ limit: 20 });
      if (!orders.length) return tgSend('No orders yet.');
      const lines = orders.slice(0, 15).map(o => {
        const icon = {website:'🌐',email:'📧',phone:'📞',stripe:'💳'}[o.source] || '•';
        const status = o.status.replace(/_/g,' ');
        return `${icon} *${(o.name||o.email||'Unknown').slice(0,22)}* — ${o.product.slice(0,20)}\n  ↳ ${status} | ${o.source}`;
      });
      tgSend(`📋 *Orders (${orders.length} total)*\n\n${lines.join('\n\n')}`);

    } else if (text.startsWith('/hot')) {
      // Hot leads: email orders with status new/pending
      const hot = await DB.getOrders({ status: 'new', limit: 10 });
      const interested = hot.filter(o => o.source === 'email');
      if (!interested.length) return tgSend('No hot email leads right now.');
      const lines = interested.map(o =>
        `🔥 *${(o.name||o.email||'?').slice(0,25)}*\n  ${o.email||''}\n  ${(o.notes||'').slice(0,80)}`
      );
      tgSend(`🔥 *Hot Email Leads*\n\n${lines.join('\n\n')}`);

    } else if (text.startsWith('/calls')) {
      const calls = await DB.getOrders({ source: 'phone', limit: 10 });
      if (!calls.length) return tgSend('No phone calls recorded yet.');
      const lines = calls.map(o =>
        `📞 *${(o.name||o.call_id||'Unknown').slice(0,25)}*\n  ${new Date(o.created_at).toLocaleString('en-GB')}\n  ${(o.notes||'').slice(0,60)}`
      );
      tgSend(`📞 *Recent Calls (${calls.length})*\n\n${lines.join('\n\n')}`);

    } else if (text.startsWith('/stats')) {
      const all = await DB.getOrders({ limit: 500 });
      const counts = {};
      all.forEach(o => { counts[o.status] = (counts[o.status]||0)+1; });
      const srcCounts = {};
      all.forEach(o => { srcCounts[o.source] = (srcCounts[o.source]||0)+1; });
      const lines = [
        `📊 *Klivio Pipeline Stats*`,
        `Total orders: *${all.length}*`,
        ``,
        `*By status:*`,
        ...Object.entries(counts).map(([k,v]) => `  ${k}: ${v}`),
        ``,
        `*By source:*`,
        ...Object.entries(srcCounts).map(([k,v]) => `  ${k}: ${v}`),
      ];
      tgSend(lines.join('\n'));

    } else if (text.startsWith('/help') || text.startsWith('/start')) {
      tgSend(`*Klivio Bot Commands*\n\n/orders — recent orders\n/hot — hot email leads\n/calls — recent phone calls\n/stats — pipeline stats\n/help — this menu`);
    }
  } catch (e) {
    tgSend(`Error: ${e.message}`);
  }
});

// ── POST /api/leads/hook/:clientId — AI Lead Responder webhook ──
// Receives form submissions from client's website, auto-replies via Groq
app.post('/api/leads/hook/:clientId', async (req, res) => {
  res.sendStatus(200); // always 200 fast, process async
  const { clientId } = req.params;
  const { name, email, phone, message } = req.body;
  if (!email) return;

  const { getClient } = require('./delivery/setup');
  const client = getClient(clientId);
  if (!client) return;

  // Build AI reply via Groq
  let replyText = '';
  try {
    const https = require('https');
    const systemPrompt = client.aiPrompt || `You are a helpful assistant for ${client.businessName || 'this business'}. Reply warmly, briefly (3-4 sentences), confirm you got their message and that someone will be in touch within 1 business hour. Sign off as the business.`;
    const payload = JSON.stringify({
      model: 'llama-3.3-70b-versatile', max_tokens: 200,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `New enquiry from ${name || 'a visitor'}${phone ? ` (${phone})` : ''}: ${message || 'They submitted a contact form.'}` },
      ],
    });
    replyText = await new Promise((resolve, reject) => {
      const req2 = https.request({
        hostname: 'api.groq.com', path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Length': Buffer.byteLength(payload) },
        timeout: 10000,
      }, r => {
        let d = ''; r.on('data', c => d += c);
        r.on('end', () => {
          try { resolve(JSON.parse(d).choices[0]?.message?.content || ''); }
          catch { resolve(''); }
        });
      });
      req2.on('error', reject); req2.write(payload); req2.end();
    });
  } catch (e) {}
  if (!replyText) replyText = `Hi ${name || 'there'},\n\nThanks for getting in touch! We've received your message and will get back to you within 1 business hour.\n\nBest,\n${client.businessName || 'The Team'}`;

  // Log the lead
  const leadsFile = path.join(__dirname, 'data', 'inbound_leads.json');
  let inbound = [];
  try { inbound = JSON.parse(fs.readFileSync(leadsFile, 'utf-8')); } catch {}
  inbound.push({ clientId, name, email, phone, message, repliedAt: new Date().toISOString() });
  try { fs.writeFileSync(leadsFile, JSON.stringify(inbound, null, 2)); } catch {}

  // Send auto-reply email
  if (process.env.BREVO_NOTIFY_LOGIN && process.env.BREVO_NOTIFY_PASS) {
    const notifyTransport = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com', port: 587, secure: false,
      auth: { user: process.env.BREVO_NOTIFY_LOGIN, pass: process.env.BREVO_NOTIFY_PASS },
    });
    notifyTransport.sendMail({
      from: `"${client.businessName || 'The Team'}" <james@klivio.bond>`,
      to: email,
      subject: `Thanks for your message${name ? `, ${name.split(' ')[0]}` : ''}`,
      text: replyText,
    }).catch(e => console.error('[Lead hook] Reply failed:', e.message));
  }
});

// ── POST /api/followup/hook/:clientId — Follow-Up Automator webhook ──
// Registers a new lead into the follow-up sequence (Day 3, 7, 14)
app.post('/api/followup/hook/:clientId', async (req, res) => {
  res.sendStatus(200);
  const { clientId } = req.params;
  const { name, email, phone, source } = req.body;
  if (!email) return;

  const { getClient } = require('./delivery/setup');
  const client = getClient(clientId);
  if (!client) return;

  const followupsFile = path.join(__dirname, 'data', 'followup_queue.json');
  let queue = [];
  try { queue = JSON.parse(fs.readFileSync(followupsFile, 'utf-8')); } catch {}

  const now = new Date();
  const day3  = new Date(now.getTime() + 3  * 24 * 60 * 60 * 1000).toISOString();
  const day7  = new Date(now.getTime() + 7  * 24 * 60 * 60 * 1000).toISOString();
  const day14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

  queue.push({
    clientId, name, email, phone, source: source || 'webhook',
    addedAt: now.toISOString(),
    followups: [
      { sendAt: day3,  step: 1, status: 'pending' },
      { sendAt: day7,  step: 2, status: 'pending' },
      { sendAt: day14, step: 3, status: 'pending' },
    ],
  });

  try { fs.writeFileSync(followupsFile, JSON.stringify(queue, null, 2)); } catch {}
});

// ── POST /api/reviews/hook/:clientId — Review & Referral webhook ──
// Triggered after a job/appointment is completed; sends Google review request
app.post('/api/reviews/hook/:clientId', async (req, res) => {
  res.sendStatus(200);
  const { clientId } = req.params;
  const { name, email, phone, jobType } = req.body;
  if (!email) return;

  const { getClient } = require('./delivery/setup');
  const client = getClient(clientId);
  if (!client) return;

  // Log
  const reviewsFile = path.join(__dirname, 'data', 'review_requests.json');
  let requests = [];
  try { requests = JSON.parse(fs.readFileSync(reviewsFile, 'utf-8')); } catch {}
  requests.push({ clientId, name, email, phone, jobType, sentAt: new Date().toISOString() });
  try { fs.writeFileSync(reviewsFile, JSON.stringify(requests, null, 2)); } catch {}

  // Send review request email
  if (process.env.BREVO_NOTIFY_LOGIN && process.env.BREVO_NOTIFY_PASS && client.googleReviewLink) {
    const notifyTransport = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com', port: 587, secure: false,
      auth: { user: process.env.BREVO_NOTIFY_LOGIN, pass: process.env.BREVO_NOTIFY_PASS },
    });
    const firstName = (name || 'there').split(' ')[0];
    notifyTransport.sendMail({
      from: `"${client.businessName || 'The Team'}" <james@klivio.bond>`,
      to: email,
      subject: `How did we do${name ? `, ${firstName}` : ''}?`,
      text: `Hi ${firstName},\n\nHope everything went well${jobType ? ` with your ${jobType}` : ''}!\n\nIf you have 30 seconds, we'd really appreciate a quick Google review — it helps us a lot:\n\n${client.googleReviewLink}\n\nThanks so much,\n${client.businessName || 'The Team'}`,
    }).catch(e => console.error('[Review hook] Email failed:', e.message));
  }
});

// ══════════════════════════════════════════════════════════
// ── INBOUND EMAIL WEBHOOK (auto-reply pipeline) ───────────
// ══════════════════════════════════════════════════════════
// Receives parsed email JSON from Brevo / Mailgun / Postmark
// Auto-classifies (Groq) → auto-responds (Cal/Stripe link) →
// updates lead status → Telegram alert
//
// DNS setup needed (one-time): see ADMIN_SETUP.md
// Pattern matches: any of the major inbound parsers' formats

app.post('/api/inbound-email', express.json({ limit: '5mb' }), async (req, res) => {
  res.status(200).json({ ok: true });  // ack immediately so sender doesn't retry

  try {
    const body = req.body || {};
    // Normalize between Brevo / Mailgun / Postmark / SendGrid formats
    const from   = body.from?.email || body.From || body.sender || body.sender_email
                 || (body.from && body.from[0]?.email) || '';
    const subject = body.subject || body.Subject || body.subject_line || '';
    const text   = body.text || body['stripped-text'] || body.TextBody
                 || body.plain || body.body_plain || (body.RawHtml || '').replace(/<[^>]+>/g, '');
    const messageId = body.messageId || body['Message-Id'] || body.MessageID || body.message_id
                    || body['message-id'] || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    if (!from || !text) {
      console.log('[inbound] Skip: no from or text', JSON.stringify(body).slice(0, 200));
      return;
    }

    // Hand off to inbox.js processEmail
    try {
      const { processEmail } = require('./leadgen/inbox');
      const result = await processEmail({
        from: from.toLowerCase(),
        subject,
        body: text,
        messageId,
      });
      console.log('[inbound]', from, '→', JSON.stringify(result).slice(0, 200));

      // Telegram alert on hot replies
      if (result?.intent === 'interested' || result?.intent === 'question') {
        const tgToken = process.env.TELEGRAM_BOT_TOKEN;
        const tgChat = process.env.TELEGRAM_CHAT_ID;
        if (tgToken && tgChat) {
          const msg = `🔥 *HOT REPLY* — ${result.intent.toUpperCase()}\n\n*From:* ${from}\n*Business:* ${result.business || '?'}\n*Subject:* ${subject.slice(0, 60)}\n\n*Snippet:*\n${text.slice(0, 300)}\n\n→ Auto-reply sent: ${result.autoReplied ? '✅' : '❌'}`;
          require('https').request({
            hostname: 'api.telegram.org',
            path: `/bot${tgToken}/sendMessage`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }, () => {}).on('error', () => {}).end(JSON.stringify({
            chat_id: tgChat, text: msg, parse_mode: 'Markdown',
          }));
        }
      }

      // Activity log
      try {
        const af = path.join(__dirname, 'leadgen', 'data', 'activity.json');
        const list = JSON.parse(fs.readFileSync(af, 'utf-8'));
        list.push({
          at: new Date().toISOString(),
          type: 'REPLY',
          msg: `${from}: ${result?.intent || '?'}`,
        });
        fs.writeFileSync(af, JSON.stringify(list.slice(-500), null, 2));
      } catch {}
    } catch (e) {
      console.error('[inbound] processEmail failed:', e.message);
    }
  } catch (e) { console.error('[inbound] webhook error:', e.message); }
});

// ══════════════════════════════════════════════════════════
// ── LIVE DASHBOARD API (admin.klivio.online) ──────────────
// ══════════════════════════════════════════════════════════

const LEADGEN_DATA = path.join(__dirname, 'leadgen', 'data');

function readJSONsafe(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return def; }
}

// ── Cookie/header auth helper for the dashboard ──
function dashAuth(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key || '';
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ── GET /api/dashboard/overview — single-call top stats ──
app.get('/api/dashboard/overview', dashAuth, (req, res) => {
  try {
    const leads   = readJSONsafe(path.join(LEADGEN_DATA, 'leads.json'), []);
    const sentLog = readJSONsafe(path.join(LEADGEN_DATA, 'sent_log.json'), []);
    const today   = new Date().toISOString().slice(0, 10);
    const yest    = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    const sentToday  = sentLog.filter(e => (e.sentAt || '').startsWith(today)).length;
    const sentYest   = sentLog.filter(e => (e.sentAt || '').startsWith(yest)).length;
    const sentTotal  = sentLog.length;

    // last 7 days for chart
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      last7.push({ date: d, count: sentLog.filter(e => (e.sentAt || '').startsWith(d)).length });
    }

    const byStatus = {};
    const byIndustry = {};
    const byCity = {};
    const byCountry = {};
    const bySource = {};
    leads.forEach(l => {
      byStatus[l.status] = (byStatus[l.status] || 0) + 1;
      byIndustry[l.industry] = (byIndustry[l.industry] || 0) + 1;
      if (l.city)    byCity[l.city] = (byCity[l.city] || 0) + 1;
      if (l.country) byCountry[l.country] = (byCountry[l.country] || 0) + 1;
      if (l.source)  bySource[l.source] = (bySource[l.source] || 0) + 1;
    });

    let accounts = { totalCapacity: 0, totalToday: 0, breakdown: [] };
    try {
      const { getDailyStats } = require('./leadgen/sender');
      accounts = getDailyStats();
    } catch {}

    res.json({
      now: new Date().toISOString(),
      leads: {
        total: leads.length,
        ready: byStatus.new || 0,
        sent: byStatus.sent || 0,
        replied: byStatus.replied || 0,
        bounced: byStatus.bounced || 0,
        duplicate: byStatus.duplicate || 0,
        error: byStatus.error || 0,
      },
      sending: { today: sentToday, yesterday: sentYest, total: sentTotal, last7 },
      breakdown: { byStatus, byIndustry, byCity, byCountry, bySource },
      accounts,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/dashboard/activity — recent activity feed ──
app.get('/api/dashboard/activity', dashAuth, (req, res) => {
  const list = readJSONsafe(path.join(LEADGEN_DATA, 'activity.json'), []);
  const limit = parseInt(req.query.limit) || 50;
  res.json(list.slice(-limit).reverse());
});

// ── GET /api/dashboard/recent-sends — last N sent emails ──
app.get('/api/dashboard/recent-sends', dashAuth, (req, res) => {
  const sentLog = readJSONsafe(path.join(LEADGEN_DATA, 'sent_log.json'), []);
  const limit = parseInt(req.query.limit) || 20;
  res.json(sentLog.slice(-limit).reverse().map(e => ({
    to: e.to, subject: e.subject, account: e.account || e.from,
    sentAt: e.sentAt, business: e.business, industry: e.industry, city: e.city,
  })));
});

// ── GET /api/dashboard/scraper-state — what's been scraped ──
app.get('/api/dashboard/scraper-state', dashAuth, (req, res) => {
  const state = readJSONsafe(path.join(LEADGEN_DATA, 'scraper_state.json'), {});
  const entries = Object.entries(state)
    .map(([slug, s]) => ({ slug, ...s }))
    .sort((a, b) => new Date(b.lastRunAt) - new Date(a.lastRunAt));
  const totalScraped = entries.reduce((sum, e) => sum + (e.addedTotal || 0), 0);
  res.json({
    targetsScraped: entries.length,
    totalLeadsFromScraper: totalScraped,
    recentTargets: entries.slice(0, 25),
  });
});

// ── GET /api/dashboard/pm2 — PM2 process status ──
app.get('/api/dashboard/pm2', dashAuth, (req, res) => {
  const { exec } = require('child_process');
  exec('npx pm2 jlist', { timeout: 5000 }, (err, stdout) => {
    if (err) return res.json({ processes: [], error: err.message });
    try {
      const list = JSON.parse(stdout);
      res.json({
        processes: list.map(p => ({
          name: p.name,
          status: p.pm2_env?.status,
          uptime: p.pm2_env?.pm_uptime ? Date.now() - p.pm2_env.pm_uptime : 0,
          restarts: p.pm2_env?.restart_time,
          cpu: p.monit?.cpu,
          memory: p.monit?.memory,
          pid: p.pid,
        })),
      });
    } catch (e) { res.json({ processes: [], error: e.message }); }
  });
});

// ── GET /api/dashboard/stream — Server-Sent Events for live updates ──
app.get('/api/dashboard/stream', (req, res) => {
  const key = req.query.key || req.headers['x-admin-key'];
  if (key !== ADMIN_KEY) return res.status(401).end('Unauthorized');

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: hello\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`);

  let lastActivityLen = 0;
  let lastLeadsCount = 0;

  const tick = () => {
    try {
      const activity = readJSONsafe(path.join(LEADGEN_DATA, 'activity.json'), []);
      const leads = readJSONsafe(path.join(LEADGEN_DATA, 'leads.json'), []);

      // New activity events
      if (activity.length !== lastActivityLen) {
        const newOnes = activity.slice(lastActivityLen);
        lastActivityLen = activity.length;
        newOnes.forEach(e => {
          res.write(`event: activity\ndata: ${JSON.stringify(e)}\n\n`);
        });
      }

      // Lead count delta
      if (leads.length !== lastLeadsCount) {
        const ready = leads.filter(l => l.status === 'new').length;
        const sent  = leads.filter(l => l.status === 'sent').length;
        res.write(`event: counts\ndata: ${JSON.stringify({ total: leads.length, ready, sent })}\n\n`);
        lastLeadsCount = leads.length;
      }

      // heartbeat
      res.write(`event: ping\ndata: ${Date.now()}\n\n`);
    } catch (e) { /* swallow */ }
  };

  tick(); // immediate
  const iv = setInterval(tick, 3000);
  req.on('close', () => clearInterval(iv));
});

// ── New live dashboard route (admin.klivio.online → /dashboard or /) ──
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
});

// ── Fallback ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Klivio running on http://localhost:${PORT}`);

  // Register Telegram webhook automatically on start
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const domain  = process.env.SERVER_DOMAIN || 'klivio-production.up.railway.app';
  if (tgToken) {
    const https2 = require('https');
    const hookUrl = `https://${domain}/api/telegram/webhook`;
    const p2 = JSON.stringify({ url: hookUrl, allowed_updates: ['message'] });
    const r2 = https2.request({
      hostname: 'api.telegram.org',
      path: `/bot${tgToken}/setWebhook`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(p2) },
      timeout: 10000,
    }, res2 => {
      let d = ''; res2.on('data', c => d+=c);
      res2.on('end', () => {
        try { const j = JSON.parse(d); console.log('[TG] Webhook registered:', j.ok ? '✓' : j.description); }
        catch { console.log('[TG] Webhook response:', d.slice(0,100)); }
      });
    });
    r2.on('error', e => console.error('[TG] Webhook reg error:', e.message));
    r2.write(p2); r2.end();
  }
});

// ── Supabase keep-alive ping (prevents free-tier auto-pause after 7 days) ──
const FOUR_DAYS_MS = 4 * 24 * 60 * 60 * 1000;
async function pingSupabase() {
  try {
    await DB.getOrders({ limit: 1 });
    console.log('[keepalive] Supabase ping OK');
  } catch (e) {
    console.error('[keepalive] Supabase ping failed:', e.message);
  }
}
pingSupabase(); // ping on startup too (restores paused project on first request)
setInterval(pingSupabase, FOUR_DAYS_MS);
