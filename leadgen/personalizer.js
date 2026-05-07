// ── AI Email Personalizer v2 — Groq (FREE) ──
// Model: llama-3.3-70b — 14,400 free requests/day
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const https = require('https');
const KLIVIO = require('../klivio-brain');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const { findLocalCompetitor } = require('./competitor');

// ── Industry-specific context for better personalization ──
const INDUSTRY_CONTEXT = {
  dental: {
    pain: 'patients who can\'t get through call the next practice on Google',
    stakes: 'Every missed enquiry is a £500-£3,000 patient lifetime value walking to a competitor',
    tone: 'professional, patient-focused',
    cta: 'worth a 10-min demo?',
  },
  law: {
    pain: 'legal enquiries are time-sensitive — people hire whoever calls back first',
    stakes: 'One missed case can be £5k-£50k in fees',
    tone: 'direct, professional',
    cta: 'open to a quick call this week?',
  },
  legal: { pain: 'same as law', stakes: 'same', tone: 'direct', cta: 'quick call?' },
  accounting: {
    pain: 'tax season enquiries stack up and slow firms lose clients to faster competitors',
    stakes: 'Each retained client is £2k-£10k/year recurring',
    tone: 'practical, numbers-focused',
    cta: 'want me to show you the numbers?',
  },
  fitness: {
    pain: 'fitness leads decide in 48 hours — if you don\'t follow up, they join somewhere else',
    stakes: 'Every lost lead = £400-£1,200 annual membership',
    tone: 'energetic, casual',
    cta: 'want to see it in action?',
  },
  restaurant: {
    pain: 'missed reservation calls and unanswered booking messages = empty tables',
    stakes: 'A fully-booked night vs half-full night can be £2k+ difference',
    tone: 'warm, practical',
    cta: 'want a quick look?',
  },
  beauty: {
    pain: 'beauty clients book on impulse — if they can\'t book in 2 minutes, they move on',
    stakes: 'Each regular client is £500-£2,000/year',
    tone: 'friendly, warm',
    cta: 'worth a quick chat?',
  },
  medical: {
    pain: 'patients expect instant replies — a slow response means they book elsewhere',
    stakes: 'Each new patient is £300-£2,000 revenue',
    tone: 'professional, reassuring',
    cta: 'want to see how it works?',
  },
  healthcare: {
    pain: 'patients expect instant replies — a slow response means they book elsewhere',
    stakes: 'Each new patient is £300-£2,000 revenue',
    tone: 'professional, reassuring',
    cta: 'want to see how it works?',
  },
  realestate: {
    pain: 'property enquiries come in evenings/weekends when agents are offline — buyers move on',
    stakes: 'One missed viewing can cost a £5k-£15k commission',
    tone: 'sharp, results-focused',
    cta: 'worth 10 minutes to see how this would fit?',
  },
  estate: {
    pain: 'property enquiries come in evenings/weekends — buyers move on fast',
    stakes: 'One missed viewing can cost £5k-£15k in commission',
    tone: 'sharp, results-focused',
    cta: 'worth 10 minutes?',
  },
  automotive: {
    pain: 'car buyers ring 3 dealers — whoever answers first usually wins the sale',
    stakes: 'Average deal = £500-£2,000 in margin + finance commission',
    tone: 'direct, punchy',
    cta: 'want to see it?',
  },
  hotel: {
    pain: 'direct bookings save you 15-25% in OTA commission — if you can capture them',
    stakes: 'Every direct booking saves £30-£100 per stay',
    tone: 'professional, ROI-focused',
    cta: 'open to a quick demo?',
  },
  veterinary: {
    pain: 'pet owners in distress call whoever answers — they don\'t leave voicemails',
    stakes: 'Each new client lifetime value is £1,500-£5,000',
    tone: 'warm, practical',
    cta: 'worth a quick chat?',
  },
  pharmacy: {
    pain: 'pharmacy customers ask quick questions — if nobody replies, they go elsewhere',
    stakes: 'Repeat customers are 80% of revenue',
    tone: 'practical, local-focused',
    cta: 'want me to show you?',
  },
  trades: {
    pain: 'customers ring 3 tradespeople — whoever answers first gets the job',
    stakes: 'Every missed call = £200-£5,000 job',
    tone: 'direct, no-nonsense',
    cta: 'worth a quick look?',
  },
  cleaning: {
    pain: 'commercial cleaning enquiries go to whoever responds first',
    stakes: 'A single contract can be £500-£5,000/month recurring',
    tone: 'practical, results-focused',
    cta: 'worth a 10-min chat?',
  },
  ecommerce: {
    pain: 'abandoned carts and unanswered product questions directly reduce revenue',
    stakes: 'Recovering 20% of abandoned carts = huge revenue lift',
    tone: 'numbers-focused',
    cta: 'want to see the ROI?',
  },
  default: {
    pain: 'leads don\'t wait — they move on to whoever responds first',
    stakes: 'Missed enquiries are silent revenue loss',
    tone: 'professional, direct',
    cta: 'worth a quick chat?',
  },
};

function getContext(industry) {
  if (!industry) return INDUSTRY_CONTEXT.default;
  const key = industry.toLowerCase();
  return INDUSTRY_CONTEXT[key] || Object.values(INDUSTRY_CONTEXT).find((_, i) => key.includes(Object.keys(INDUSTRY_CONTEXT)[i])) || INDUSTRY_CONTEXT.default;
}

// ── Subject lines — research-backed from subject-bank.js ──
const { getSubject } = require('./subject-bank');

function generateSubject(data) {
  // Pull industry-specific subject from the bank, fill {{name}} / {{business}}
  const raw  = getSubject(data.industry || 'generic');
  const name = data.contactName ? data.contactName.split(' ')[0] : (data.business.split(' ')[0]);
  return raw
    .replace(/\{\{name\}\}/g,     name)
    .replace(/\{\{business\}\}/g, data.business);
}

// ── Fallback templates — loss-first, neuromarketing-driven ──
const FALLBACK_TEMPLATES = [
  (d, ctx) => `${d.contactName ? d.contactName.split(' ')[0] + ',' : 'Hi,'}

${ctx.stakes} — and ${ctx.pain.toLowerCase()}. That's the reality for most ${d.industry} businesses that haven't automated yet.

${d.business} ${d.weakness}. The top operators in your space already have AI handling this 24/7 — nights, weekends, bank holidays. The ones who don't are losing quietly.

${d.productName} fixes this in 48 hours at ${d.productPrice}. We handle everything.

${ctx.cta}

${d.senderName}
Klivio

P.S. If you want a quick look first: klivio.online`,

  (d, ctx) => `${d.contactName ? d.contactName.split(' ')[0] + ',' : 'Hi,'}

Every week ${d.business} ${d.weakness} — that's ${ctx.stakes} leaving silently.

The best ${d.industry} businesses fixed this by automating the first response. Reply within 2 minutes, 24/7, without lifting a finger. Most of the competition in your area has already done it.

${d.productName} at ${d.productPrice}. Live in 48 hours, zero technical work on your end.

${ctx.cta}

${d.senderName}
Klivio

P.S. If you want a quick look first: klivio.online`,

  (d, ctx) => `${d.contactName ? d.contactName.split(' ')[0] + ',' : 'Hi,'}

${ctx.pain.charAt(0).toUpperCase() + ctx.pain.slice(1)}. For ${d.industry} businesses, that means ${ctx.stakes} — quietly, every month.

Noticed ${d.business} ${d.weakness}. We've already fixed this for similar businesses — ${d.productName} at ${d.productPrice}, fully managed, live in 48 hours.

${ctx.cta}

${d.senderName}
Klivio

P.S. If you want a quick look first: klivio.online`,

  (d, ctx) => `${d.contactName ? d.contactName.split(' ')[0] + ',' : 'Hi,'}

Quick one. ${ctx.stakes}. Most of that loss happens outside business hours, when nobody's picking up.

${d.business} ${d.weakness}. We built ${d.productName} specifically for ${d.industry} businesses — ${d.productPrice}, done-for-you in 2 days.

${ctx.cta}

${d.senderName}
Klivio

P.S. If you want a quick look first: klivio.online`,
];

function getFallbackEmail(data, ctx) {
  const template = FALLBACK_TEMPLATES[Math.floor(Math.random() * FALLBACK_TEMPLATES.length)];
  return template(data, ctx);
}

// ── Groq API ──
function callGroq(prompt, temperature = 0.85) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature,
    });

    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 20000,
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.choices?.[0]?.message?.content || null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(payload);
    req.end();
  });
}

// ── Tone variations ──
const TONES = [
  'direct and specific — state the loss, name the fix, ask one question',
  'peer-to-peer — like a fellow business owner who spotted something',
  'sharp and data-driven — one number, one outcome, one ask',
  'honest and low-pressure — no hype, just a real observation',
];

// ── Main generate function ──
async function generateEmail(data) {
  const ctx = getContext(data.industry);
  const tone = TONES[Math.floor(Math.random() * TONES.length)];

  if (!GROQ_API_KEY) {
    return {
      subject: generateSubject(data),
      body: getFallbackEmail(data, ctx),
      source: 'template',
    };
  }

  const firstName = data.contactName ? data.contactName.split(' ')[0] : (data.ownerName ? data.ownerName.split(' ')[0] : '');

  const websiteCtx = data.websiteContext || {};
  const city = data.city || websiteCtx.locationMention || 'the UK';

  // Build a rich, prioritised context block — more specific = better copy
  let contextBlock = '';
  // Groq insight is gold — always lead with it if present
  if (websiteCtx.groqHook) contextBlock += `\n- KEY INSIGHT (use this as the personalisation anchor — worked out from reading their site): "${websiteCtx.groqHook}"`;
  if (websiteCtx.hook && !websiteCtx.groqHook) contextBlock += `\n- Specific detail: the business ${websiteCtx.hook}`;
  if (websiteCtx.specialties && websiteCtx.specialties.length) contextBlock += `\n- Specialties: ${websiteCtx.specialties.slice(0, 3).join(', ')}`;
  if (websiteCtx.established) {
    const years = new Date().getFullYear() - parseInt(websiteCtx.established);
    contextBlock += `\n- In business: ${years} years (since ${websiteCtx.established})`;
  }
  if (websiteCtx.teamSize) contextBlock += `\n- Team size: ${websiteCtx.teamSize} people`;
  if (websiteCtx.numLocations > 1) contextBlock += `\n- Locations: ${websiteCtx.numLocations} branches`;
  if (websiteCtx.services && websiteCtx.services.length) contextBlock += `\n- Services listed: ${websiteCtx.services.slice(0, 4).join(' | ')}`;
  if (websiteCtx.tagline) contextBlock += `\n- Their tagline: "${websiteCtx.tagline}"`;
  if (websiteCtx.h1 && websiteCtx.h1 !== websiteCtx.tagline) contextBlock += `\n- Main headline: "${websiteCtx.h1}"`;
  if (websiteCtx.reviewCount) contextBlock += `\n- Client/review count: ${websiteCtx.reviewCount}+`;
  if (websiteCtx.accreditation) contextBlock += `\n- Accreditation: ${websiteCtx.accreditation}`;
  if (websiteCtx.closedWeekend) contextBlock += `\n- PAIN SIGNAL: closed weekends (prime time for missed enquiries)`;
  if (websiteCtx.callToBook) contextBlock += `\n- PAIN SIGNAL: requires phone call to book (no online booking)`;
  if (websiteCtx.phoneDependent) contextBlock += `\n- PAIN SIGNAL: heavily phone-dependent ("call us" mentioned multiple times)`;
  if (websiteCtx.ownerName) contextBlock += `\n- Owner/principal name: ${websiteCtx.ownerName}`;

  // Find a local competitor from the leads database to use as social proof
  const competitor = findLocalCompetitor(data);
  const competitorLine = competitor
    ? `COMPETITOR INTEL (use this once, naturally, in P2): "${competitor.phrase}"`
    : `COMPETITOR INTEL: Mention that other ${data.industry} businesses in ${city} are already automating this — no specific name needed.`;

  const prompt = `You are a $10,000/month B2B copywriter writing a cold email for Klivio. One goal: get a reply from the business owner. You write like a human who did their homework — not a marketer.

BUSINESS: "${data.business}" | INDUSTRY: ${data.industry} | CITY: ${city}
WEAKNESS SPOTTED: ${data.weakness}
PRODUCT: ${data.productName} at ${data.productPrice}
SENDER: ${data.senderName} | RECIPIENT: ${firstName || '(use "Hi," as opener)'}
FINANCIAL STAKES: ${ctx.stakes}
${contextBlock ? '\nWEBSITE INTEL (use this to make the email feel handwritten for them):' + contextBlock : ''}

${competitorLine}

THE EMAIL FORMULA (elite copywriters use this):
P1 — HOOK + LOSS (2 sentences max):
  Lead with their KEY INSIGHT or a specific detail from their site — show you looked.
  Then immediately pivot to the financial cost of the weakness you spotted. Uncomfortable but true.
  Example: "You offer emergency implants but booking requires a call — meaning patients in pain at 6pm hit voicemail and call whoever answers next."

P2 — IDENTITY + SOCIAL PROOF (2 sentences):
  "The best [industry] businesses in [city] have already automated this."
  Insert the competitor line EXACTLY as written. One concrete outcome (book 8 extra/week, capture 15 more leads/month).

P3 — OFFER + CTA (2 sentences):
  "${data.productName} at ${data.productPrice} — live in 48 hours, we handle everything. ${data.upsell ? '(' + data.upsell + '.)' : ''}"
  End with: "${ctx.cta}"

HARD RULES — any violation fails the brief:
- Plain text only. Zero HTML, bullets, bold, emojis, links.
- Open with a specific fact or the loss — NEVER "I noticed", "I came across", "I hope", "I saw your website".
- Every word earns its place. If a sentence can be cut without losing meaning, cut it.
- Contractions always: we've, it's, you're, they've.
- Max 95 words total (body only, not sign-off).
- CTA: its own line, ends with "?", no exclamation.
- Sign-off: "${data.senderName}" newline "Klivio". Nothing else before or after.
- No invented facts — only use context provided above.
- Tone: ${tone}.
- Do NOT include subject line.

Output ONLY the email body. Nothing else.`;

  try {
    const result = await callGroq(prompt);
    if (!result) return {
      subject: generateSubject(data),
      body: getFallbackEmail(data, ctx),
      source: 'template',
    };

    // Clean up common AI artifacts
    let body = result.trim()
      .replace(/^Subject:.*\n/im, '')
      .replace(/^"|"$/g, '')
      .replace(/\n{3,}/g, '\n\n');

    // Add soft P.S. link — plain text only, no HTML
    if (!body.includes('klivio.online')) {
      body += '\n\nP.S. If you want a quick look first: klivio.online';
    }

    return { subject: generateSubject(data), body, source: 'groq' };
  } catch {
    return {
      subject: generateSubject(data),
      body: getFallbackEmail(data, ctx),
      source: 'template',
    };
  }
}

module.exports = { generateEmail, generateSubject, getFallbackEmail, getContext };
