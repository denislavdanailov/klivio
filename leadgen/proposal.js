// ── Auto Proposal Generator ──
// Generates a personalized 1-page HTML proposal for a hot lead
// Can be emailed as a link, or auto-sent when lead replies "interested"
//
// node leadgen/proposal.js <leadId>     → generate + save proposal HTML
// node leadgen/proposal.js <leadId> --send  → also email the proposal link
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const https = require('https');

const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');
const PROPOSALS_DIR = path.join(__dirname, '..', 'public', 'proposals');
if (!fs.existsSync(PROPOSALS_DIR)) fs.mkdirSync(PROPOSALS_DIR, { recursive: true });

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const BASE_URL = process.env.BASE_URL || 'https://klivio.bond';
const CAL_LINK = process.env.CAL_LINK || 'https://cal.com/klivio/intro';
const STRIPE_LINK = process.env.STRIPE_LINK || 'https://buy.stripe.com/klivio-starter';

// ── Klivio product catalog (maps industry → recommended bundle) ──
const PRODUCTS = {
  'AI Lead Responder': {
    price: 197,
    setupFee: 497,
    description: 'Instant AI replies to all website/social enquiries, 24/7. Captures & qualifies leads while you sleep.',
    features: [
      'AI replies in <60 seconds to every enquiry',
      'Books appointments directly into your calendar',
      'Qualifies lead quality before you see them',
      'WhatsApp, email, web chat — all unified',
      '3-day setup, fully managed by Klivio',
    ],
  },
  'AI Booking Assistant': {
    price: 297,
    setupFee: 497,
    description: '24/7 AI receptionist that handles bookings, reschedules, and FAQ — reduces no-shows by 40%.',
    features: [
      'Phone + web AI that books into your system',
      'Automated reminders (SMS + email)',
      'No-show recovery sequences',
      'Integrates with Google Cal, Dentally, Cliniko, etc.',
      'Setup + training in 5 days',
    ],
  },
  'AI Review Booster': {
    price: 147,
    setupFee: 297,
    description: 'Automated review requests post-appointment → 3-5x more Google reviews in 60 days.',
    features: [
      'Auto-text review request after every booking',
      'Filters unhappy customers privately first',
      'Google + Trustpilot + Facebook',
      'Monthly reporting dashboard',
      'Setup in 48 hours',
    ],
  },
  'Full AI Suite': {
    price: 497,
    setupFee: 997,
    description: 'Complete AI automation stack — Lead Responder + Booking + Reviews + Follow-ups.',
    features: [
      'Everything in Lead Responder + Booking + Reviews',
      'AI email follow-up for dormant enquiries',
      'Monthly strategy call with Klivio team',
      'Priority support + quarterly optimizations',
      'Full setup in 7 days',
    ],
  },
};

function pickProduct(lead) {
  const weakness = (lead.sentWeakness || '').toLowerCase();
  const industry = (lead.industry || '').toLowerCase();

  if (weakness.includes('booking') || /dental|clinic|physio|salon|gym/.test(industry)) {
    return PRODUCTS['AI Booking Assistant'];
  }
  if (weakness.includes('review')) return PRODUCTS['AI Review Booster'];
  if (lead.tier === 'A' && lead.score >= 85) return PRODUCTS['Full AI Suite'];
  return PRODUCTS['AI Lead Responder'];
}

// ── Groq: generate custom opening paragraph + ROI estimate ──
async function generateCustomCopy(lead, product) {
  if (!GROQ_API_KEY) return null;

  const prompt = `Write a personalized proposal opening for a UK business. Output JSON only.

BUSINESS: ${lead.business}
INDUSTRY: ${lead.industry}
CITY: ${lead.city}
CONTACT: ${lead.contactName || 'there'}
WEAKNESS IDENTIFIED: ${lead.sentWeakness}
PRODUCT RECOMMENDED: ${product === PRODUCTS['AI Lead Responder'] ? 'AI Lead Responder' : product === PRODUCTS['AI Booking Assistant'] ? 'AI Booking Assistant' : product === PRODUCTS['AI Review Booster'] ? 'AI Review Booster' : 'Full AI Suite'}

Return JSON with keys:
- "headline" (8-12 words, compelling, references their business)
- "intro" (2-3 sentences, warm, acknowledges their situation)
- "roi_estimate" (1 sentence with specific numbers, realistic for their industry)
- "why_now" (1 sentence urgency/timing reason)

JSON only, no markdown.`;

  return new Promise(resolve => {
    const payload = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.7,
      response_format: { type: 'json_object' },
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
        try { resolve(JSON.parse(JSON.parse(d).choices[0].message.content)); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(payload);
    req.end();
  });
}

function renderHtml(lead, product, productName, copy) {
  const headline = copy?.headline || `A Custom AI Automation Plan for ${lead.business}`;
  const intro = copy?.intro || `Hi ${lead.contactName || 'there'}, based on what we've seen at ${lead.business}, here's exactly how Klivio can help you capture more enquiries and book more appointments — without adding to your workload.`;
  const roi = copy?.roi_estimate || `Based on industry benchmarks, businesses like yours typically see 15-25% more booked appointments within 60 days.`;
  const whyNow = copy?.why_now || `Every week without this costs an average of 8-12 missed enquiries.`;

  const featuresHtml = product.features.map(f => `<li>${f}</li>`).join('\n        ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Proposal for ${lead.business} — Klivio</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; background: #f5f5f7; color: #1d1d1f; line-height: 1.6; }
  .container { max-width: 780px; margin: 40px auto; background: white; padding: 60px; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); }
  .brand { font-size: 14px; color: #666; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }
  h1 { font-size: 36px; line-height: 1.2; margin-bottom: 24px; color: #000; }
  .meta { color: #666; font-size: 14px; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid #eee; }
  .intro { font-size: 18px; margin-bottom: 40px; color: #2c2c2e; }
  h2 { font-size: 22px; margin: 32px 0 16px; color: #000; }
  .product-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 32px; border-radius: 12px; margin: 24px 0; }
  .product-card h3 { font-size: 24px; margin-bottom: 8px; }
  .product-card .price { font-size: 32px; font-weight: bold; margin: 16px 0; }
  .product-card .price small { font-size: 14px; opacity: 0.8; font-weight: normal; }
  .product-card ul { list-style: none; margin-top: 16px; }
  .product-card li { padding: 6px 0 6px 28px; position: relative; }
  .product-card li::before { content: "✓"; position: absolute; left: 0; font-weight: bold; color: #a8e6cf; }
  .roi-box { background: #fff9e6; border-left: 4px solid #ffc107; padding: 20px; border-radius: 8px; margin: 24px 0; }
  .cta { display: flex; gap: 16px; margin-top: 40px; flex-wrap: wrap; }
  .btn { padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block; }
  .btn-primary { background: #000; color: white; }
  .btn-secondary { background: #f0f0f0; color: #000; }
  .btn:hover { transform: translateY(-2px); transition: all 0.2s; }
  .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #eee; color: #888; font-size: 13px; text-align: center; }
  .highlight { color: #667eea; font-weight: 600; }
  @media (max-width: 640px) { .container { padding: 32px 24px; margin: 20px; } h1 { font-size: 28px; } }
</style>
</head>
<body>
  <div class="container">
    <div class="brand">KLIVIO · AI AUTOMATION</div>
    <h1>${headline}</h1>
    <div class="meta">Prepared for <strong>${lead.business}</strong> · ${lead.city || 'UK'} · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>

    <p class="intro">${intro}</p>

    <h2>What We Recommend</h2>
    <div class="product-card">
      <h3>${productName}</h3>
      <p>${product.description}</p>
      <div class="price">£${product.price}<small>/month</small> <small style="margin-left:12px">+ £${product.setupFee} one-time setup</small></div>
      <ul>
        ${featuresHtml}
      </ul>
    </div>

    <div class="roi-box">
      <strong>💰 Expected Impact</strong><br>
      ${roi}
    </div>

    <h2>Why Now</h2>
    <p>${whyNow}</p>

    <h2>Next Steps</h2>
    <p>Two options — whichever works better:</p>
    <div class="cta">
      <a href="${CAL_LINK}" class="btn btn-primary">📅 Book a 15-min Call</a>
      <a href="${STRIPE_LINK}" class="btn btn-secondary">⚡ Start Setup Today</a>
    </div>

    <div class="footer">
      This proposal is valid for 7 days · Klivio · hello@klivio.bond<br>
      <small>Questions? Just reply to our email — we'll respond within the hour.</small>
    </div>
  </div>
</body>
</html>`;
}

async function generateProposal(leadId) {
  const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8'));
  const lead = leads.find(l => l.id === leadId || l.email === leadId);
  if (!lead) throw new Error(`Lead not found: ${leadId}`);

  const product = pickProduct(lead);
  const productName = Object.entries(PRODUCTS).find(([, v]) => v === product)[0];

  console.log(`📝 Generating proposal for ${lead.business} (${productName})...`);
  const copy = await generateCustomCopy(lead, product);
  const html = renderHtml(lead, product, productName, copy);

  const filename = `${lead.id || lead.email.replace(/[^a-z0-9]/gi, '-')}.html`;
  const filepath = path.join(PROPOSALS_DIR, filename);
  fs.writeFileSync(filepath, html);

  const url = `${BASE_URL}/proposals/${filename}`;

  // Update lead record
  const idx = leads.findIndex(l => l.id === lead.id);
  if (idx !== -1) {
    leads[idx].proposalUrl = url;
    leads[idx].proposalProduct = productName;
    leads[idx].proposalPrice = product.price;
    leads[idx].proposalGeneratedAt = new Date().toISOString();
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
  }

  console.log(`✅ Proposal ready: ${url}`);
  return { url, filepath, product: productName, lead };
}

module.exports = { generateProposal, PRODUCTS };

if (require.main === module) {
  const leadId = process.argv[2];
  if (!leadId) {
    console.log('Usage: node leadgen/proposal.js <leadId or email>');
    process.exit(1);
  }
  generateProposal(leadId).catch(e => { console.error('❌', e.message); process.exit(1); });
}
