// ── AI Email Personalizer v2 — Groq (FREE) ──
// Model: llama-3.3-70b — 14,400 free requests/day
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const https = require('https');
const KLIVIO = require('../klivio-brain');

const GROQ_API_KEY = process.env.GROQ_API_KEY;

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

// ── Subject line styles (A/B-testable) ──
const SUBJECT_STYLES = [
  (d) => `${d.business} — quick question`,
  (d) => `Question about ${d.business}`,
  (d) => `${d.contactName ? d.contactName.split(' ')[0] + ', ' : ''}noticed something about your site`,
  (d) => `For ${d.business}`,
  (d) => `Re: ${d.business}`,
  (d) => `quick one about ${d.business}`,
  (d) => `${d.business} + missed enquiries`,
  (d) => `saw ${d.business} online`,
  (d) => `${d.contactName ? d.contactName.split(' ')[0] : 'Hey'} — 2-min question`,
  (d) => `short question on ${d.business}`,
];

function generateSubject(data) {
  const style = SUBJECT_STYLES[Math.floor(Math.random() * SUBJECT_STYLES.length)];
  return style(data);
}

// ── Fallback templates (без Groq) — varied to avoid spam filters ──
const FALLBACK_TEMPLATES = [
  (d, ctx) => `Hi ${d.contactName ? d.contactName.split(' ')[0] : 'there'},

Took a look at ${d.business} and noticed ${d.weakness}.

For ${d.industry} businesses, ${ctx.pain}. ${ctx.stakes}.

We've built ${d.productName} (${d.productPrice}) — gets you set up in 2-3 days, zero technical work on your end. We handle everything.

${ctx.cta}

${d.senderName}
Klivio`,

  (d, ctx) => `Hi ${d.contactName ? d.contactName.split(' ')[0] : 'there'},

Quick one — I was researching ${d.industry} businesses in the UK and ${d.business} came up.

One thing I noticed: ${d.weakness}. That matters because ${ctx.pain.toLowerCase()}.

Our fix is ${d.productName} at ${d.productPrice}. Usually live in 3 days, nothing for you to install.

${ctx.cta}

${d.senderName}
Klivio — klivio.bond`,

  (d, ctx) => `Hi ${d.contactName ? d.contactName.split(' ')[0] : 'there'},

Reaching out because I saw ${d.business} online and ${d.weakness}.

Here's the thing — ${ctx.pain}. ${ctx.stakes}.

We solve this with ${d.productName} (${d.productPrice}). Done-for-you, live in under a week.

${ctx.cta}

${d.senderName}
Klivio`,

  (d, ctx) => `${d.contactName ? d.contactName.split(' ')[0] + ',' : 'Hi,'}

Short note — ${d.weakness} on ${d.business}.

${ctx.stakes}. We fix it with ${d.productName} — ${d.productPrice}, set up in 2-3 days, fully managed.

${ctx.cta}

${d.senderName} @ Klivio`,
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

// ── Style variations (choose randomly to avoid emails looking templated) ──
const STYLES = [
  'conversational and direct — like a text from a friend who works in sales',
  'professional but warm — like an industry peer reaching out',
  'sharp and punchy — every sentence earns its place',
  'curious and honest — asking a real question, not pitching',
];

// ── Main generate function ──
async function generateEmail(data) {
  // data: { business, contactName, industry, website, weakness, productName, productPrice, senderName }
  const ctx = getContext(data.industry);
  const style = STYLES[Math.floor(Math.random() * STYLES.length)];

  if (!GROQ_API_KEY) {
    return {
      subject: generateSubject(data),
      body: getFallbackEmail(data, ctx),
      source: 'template',
    };
  }

  const firstName = data.contactName ? data.contactName.split(' ')[0] : (data.ownerName ? data.ownerName.split(' ')[0] : '');

  // Rich context from website scraping
  const websiteCtx = data.websiteContext || {};
  let contextBlock = '';
  if (websiteCtx.tagline) contextBlock += `\n- Their tagline/value prop: "${websiteCtx.tagline}"`;
  if (websiteCtx.h1 && websiteCtx.h1 !== websiteCtx.tagline) contextBlock += `\n- Homepage headline: "${websiteCtx.h1}"`;
  if (websiteCtx.description) contextBlock += `\n- Site description: "${websiteCtx.description}"`;
  if (websiteCtx.services && websiteCtx.services.length) contextBlock += `\n- Services they offer: ${websiteCtx.services.slice(0, 3).join(', ')}`;
  if (websiteCtx.established) contextBlock += `\n- Established: ${websiteCtx.established} (${new Date().getFullYear() - parseInt(websiteCtx.established)} years in business)`;
  if (websiteCtx.locationMention && !data.city) contextBlock += `\n- Location mentioned: ${websiteCtx.locationMention}`;
  if (websiteCtx.reviewCount) contextBlock += `\n- Social proof: ${websiteCtx.reviewCount}+ reviews/clients mentioned`;

  const prompt = KLIVIO.prompts.email({ ...data, senderName: data.senderName }) + `

WRITE THE EMAIL NOW:
Business: "${data.business}" | Industry: ${data.industry} | Weakness: ${data.weakness}
Product: ${data.productName} (${data.productPrice}) | Sender: ${data.senderName}
Recipient: ${firstName || '(unknown)'}
Stakes: ${ctx.stakes}
Style: ${style}, tone: ${ctx.tone}
${contextBlock ? '\nWHAT WE SAW ON THEIR WEBSITE:' + contextBlock : ''}

STYLE: ${style}. Tone should be ${ctx.tone}.

STRUCTURE (3 short paragraphs, 90-140 words total):
1. Greeting + a specific, observed detail about THEIR business from the context above (reference their tagline, a service, years in business, location — whatever stands out). Then name the problem.
2. Why this matters for ${data.industry} businesses specifically — use a concrete number or outcome
3. One-line pitch + a soft ask like "${ctx.cta}"

PERSONALIZATION RULES:
- If you have their tagline or headline, quote or paraphrase it naturally in paragraph 1 (e.g., "Saw your 'trusted since 1998' line — impressive")
- If they have 10+ years in business, mention it respectfully
- Do NOT invent facts you weren't given. Only reference what's in the context above.

HARD RULES:
- Plain text only. No HTML, no bullets, no bold, no emojis.
- Do NOT say "I hope this email finds you well" or any opener clichés.
- Do NOT say "I stumbled across" or "I came across".
- Use contractions (we've, you're, it's) — sound human.
- Max 140 words.
- Sign off with exactly: "${data.senderName}\\nKlivio"
- Do NOT include a subject line.

Output ONLY the email body.`;

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
