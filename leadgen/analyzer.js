// ── Business Website Analyzer v3 — Deep Personalization ──
// Extracts hyper-specific details for $10K-copywriter-quality emails
const https = require('https');
const http = require('http');
const cheerio = require('cheerio');

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const PRODUCTS = {
  booking:  { name: 'AI Lead Responder',        price: '£197/mo', upsell: 'Growth plan (2 AI workers) is £297/mo' },
  followup: { name: 'Follow-Up Automator',      price: '£197/mo', upsell: 'Growth plan (2 AI workers) is £297/mo' },
  reviews:  { name: 'Review & Referral System', price: '£197/mo', upsell: 'Growth plan (2 AI workers) is £297/mo' },
  chat:     { name: 'Live Chat Assistant',      price: '£297/mo', upsell: 'Full System (3 AI workers incl. Voice) is £497/mo' },
  chatbot:  { name: 'AI Chatbot',               price: '£297/mo', upsell: 'Full System (3 AI workers incl. Voice) is £497/mo' },
  valuation:{ name: 'Valuation Bot',            price: '£297/mo', upsell: 'Full System (3 AI workers incl. Voice) is £497/mo' },
  voice:    { name: 'Voice Assistant',          price: '£497/mo', upsell: 'Full System (3 AI workers) — same price, adds chatbot + lead responder' },
  outreach: { name: 'Cold Outreach Setup',      price: '£497/mo', upsell: 'Full System (3 AI workers) is also £497/mo' },
};

const INDUSTRY_PRIORITY = {
  // Entry-level (£197) first — easier to sell, upsell later
  dental:      ['booking', 'reviews', 'chat', 'voice'],
  dentist:     ['booking', 'reviews', 'chat', 'voice'],
  medical:     ['booking', 'followup', 'chat'],
  healthcare:  ['booking', 'followup', 'chat'],
  clinic:      ['booking', 'followup', 'chat'],
  veterinary:  ['booking', 'voice', 'followup'],
  law:         ['booking', 'followup', 'chat'],
  legal:       ['booking', 'followup', 'chat'],
  solicitor:   ['booking', 'followup', 'chat'],
  accounting:  ['followup', 'booking', 'outreach'],
  accountant:  ['followup', 'booking', 'outreach'],
  fitness:     ['followup', 'booking', 'reviews'],
  gym:         ['followup', 'booking', 'reviews'],
  restaurant:  ['booking', 'reviews', 'chat'],
  hotel:       ['booking', 'reviews', 'chat'],
  beauty:      ['booking', 'reviews', 'followup'],
  realestate:  ['booking', 'followup', 'valuation', 'chat'],
  estate:      ['booking', 'followup', 'valuation', 'chat'],
  property:    ['booking', 'followup', 'valuation', 'chat'],
  automotive:  ['followup', 'voice', 'chat'],
  trades:      ['voice', 'booking', 'followup'],
  plumber:     ['voice', 'booking', 'followup'],
  electrician: ['voice', 'booking', 'followup'],
  builder:     ['voice', 'booking', 'followup'],
  cleaning:    ['booking', 'followup', 'outreach'],
  pharmacy:    ['chat', 'booking', 'followup'],
  optician:    ['booking', 'reviews', 'chat'],
  ecommerce:   ['chatbot', 'followup', 'chat'],
  recruitment: ['outreach', 'followup', 'chat'],
  insurance:   ['followup', 'outreach', 'booking'],
  'digital-agency': ['outreach', 'followup', 'chatbot'],
  marketing:   ['outreach', 'followup', 'chatbot'],
  saas:        ['outreach', 'followup', 'chatbot'],
  coaching:    ['booking', 'followup', 'outreach'],
  default:     ['booking', 'followup', 'chat'],
};

const INDUSTRY_FALLBACK = {
  dental:          { weakness: 'new patients have to call during office hours — no online booking on the site', product: 'booking' },
  dentist:         { weakness: 'new patients have to call during office hours — no online booking on the site', product: 'booking' },
  law:             { weakness: 'no way for potential clients to book a consultation outside phone hours', product: 'booking' },
  legal:           { weakness: 'no way for potential clients to book a consultation outside phone hours', product: 'booking' },
  solicitor:       { weakness: 'no way for potential clients to book a consultation outside phone hours', product: 'booking' },
  realestate:      { weakness: 'property enquiries sent evenings/weekends almost certainly go unanswered', product: 'booking' },
  estate:          { weakness: 'property enquiries sent evenings/weekends almost certainly go unanswered', product: 'booking' },
  fitness:         { weakness: 'no automated follow-up — leads go cold within 48 hours of first enquiry', product: 'followup' },
  gym:             { weakness: 'no automated follow-up — leads go cold within 48 hours of first enquiry', product: 'followup' },
  veterinary:      { weakness: 'no after-hours call handling — pet owners in distress ring whoever answers first', product: 'booking' },
  trades:          { weakness: 'no 24/7 call handling — customers ring 3 tradespeople and hire whoever answers first', product: 'voice' },
  plumber:         { weakness: 'no 24/7 call handling — customers ring 3 tradespeople and hire whoever answers first', product: 'voice' },
  electrician:     { weakness: 'no 24/7 call handling — customers ring 3 tradespeople and hire whoever answers first', product: 'voice' },
  accounting:      { weakness: 'no automated follow-up — tax season enquiries pile up and slow response loses clients to faster firms', product: 'followup' },
  accountant:      { weakness: 'no automated follow-up — tax season enquiries pile up and slow response loses clients to faster firms', product: 'followup' },
  ecommerce:       { weakness: 'no chatbot handling product questions — abandoned carts and lost revenue', product: 'chatbot' },
  clinic:          { weakness: 'patients expect replies in minutes — no instant booking or follow-up system', product: 'booking' },
  medical:         { weakness: 'patients expect replies in minutes — no instant booking or follow-up system', product: 'booking' },
  beauty:          { weakness: 'clients book on impulse — no online booking means losing them in under 2 minutes', product: 'booking' },
  cleaning:        { weakness: 'commercial enquiries go to whoever responds first — no instant quote or follow-up system', product: 'followup' },
  recruitment:     { weakness: 'no automated candidate or client follow-up — leads go cold without consistent touch', product: 'outreach' },
  insurance:       { weakness: 'prospects compare 3 quotes — no automated follow-up means losing to whoever stays in touch', product: 'followup' },
  restaurant:      { weakness: 'missed reservation calls and unanswered booking messages — no online booking widget', product: 'booking' },
  hotel:           { weakness: 'no direct booking chat — guests go through OTAs and you lose 15-25% to commission', product: 'booking' },
  pharmacy:        { weakness: 'customers with quick questions leave if nobody replies instantly', product: 'chat' },
  optician:        { weakness: 'patients have to call during opening hours — no online appointment booking', product: 'booking' },
  'digital-agency':{ weakness: 'no automated outreach system — new client pipeline relies entirely on referrals and word of mouth', product: 'outreach' },
  marketing:       { weakness: 'no automated outreach system — new client pipeline relies entirely on referrals and word of mouth', product: 'outreach' },
  saas:            { weakness: 'no automated outreach or follow-up — leads from demos go cold without a consistent sequence', product: 'outreach' },
  coaching:        { weakness: 'no automated booking or follow-up — discovery calls don\'t get booked without manual chasing', product: 'booking' },
  default:         { weakness: 'enquiries outside office hours almost certainly go unanswered', product: 'booking' },
};

const WEAKNESS_MESSAGES = {
  chat:    'there\'s no live chat on the site — enquiries outside office hours go unanswered',
  booking: 'there\'s no online booking — every enquiry requires a phone call during business hours',
  reviews: 'there\'s no visible review collection system — and social proof is everything in local markets',
  followup:'there\'s no automated follow-up system — leads that don\'t reply to the first message just vanish',
  voice:   'there\'s no after-hours call handling — calls outside opening hours hit voicemail and rarely convert',
  chatbot: 'there\'s no chatbot for product questions — visitors with questions just leave without buying',
  valuation:'there\'s no instant quote or valuation tool — visitors who want a price go compare elsewhere',
  mobile:  'the site isn\'t properly mobile-optimised — half the traffic struggles to contact you',
  noform:  'there\'s no visible contact form — hard for new leads to reach you without picking up the phone',
};

const SIGNALS = {
  chat: ['tawk.to', 'crisp.chat', 'intercom', 'drift.com', 'tidio', 'zendesk', 'freshchat', 'livechat', 'hubspot', 'chatlio', 'olark', 'userlike', 'smartsupp', 'jivochat', '.chatbot', 'chatwidget'],
  booking: ['calendly.com', 'acuityscheduling', 'simplybook', 'booksy', 'fresha', 'treatwell', 'square appointments', 'book now', 'book an appointment', 'book online', 'online booking', 'setmore', 'youcanbook.me', 'opentable', 'resy.com', 'bookatable', 'reservio'],
  reviews: ['trustpilot.com', 'reviews.io', 'feefo.com', 'trustindex', 'yotpo', 'okendo', 'judge.me', 'bazaarvoice', 'google reviews'],
  followup: ['mailchimp', 'klaviyo', 'hubspot', 'pipedrive', 'salesforce', 'activecampaign', 'brevo', 'sendgrid'],
  form: ['<form', 'contact-form', 'wpcf7', 'gravity-form', 'contact form 7', 'ninja-forms', 'formidable', 'forminator', 'wufoo', 'typeform'],
};

// ── Specialty keywords by industry — what THEY offer helps us personalize ──
const SPECIALTY_KEYWORDS = {
  dental: ['cosmetic', 'implants', 'orthodontics', 'invisalign', 'whitening', 'emergency dental', 'private', 'nhs', 'veneers', 'teeth straightening', 'sedation', 'facial aesthetics'],
  law: ['personal injury', 'conveyancing', 'family law', 'criminal', 'employment', 'immigration', 'commercial', 'probate', 'litigation', 'corporate', 'housing'],
  realestate: ['lettings', 'sales', 'property management', 'commercial', 'new builds', 'residential', 'land', 'auctions', 'block management'],
  fitness: ['personal training', 'classes', 'crossfit', 'yoga', 'pilates', 'martial arts', 'boxing', 'swimming', 'spin', 'nutrition', 'bootcamp'],
  veterinary: ['emergency', '24 hour', 'exotic', 'small animals', 'surgery', 'specialist', 'referral', 'orthopaedic'],
  accounting: ['tax', 'payroll', 'vat', 'bookkeeping', 'audit', 'cloud accounting', 'xero', 'quickbooks', 'management accounts', 'r&d tax'],
  cleaning: ['commercial', 'domestic', 'end of tenancy', 'office', 'carpet', 'window', 'deep clean', 'industrial'],
  recruitment: ['permanent', 'temporary', 'contract', 'executive', 'technical', 'healthcare', 'finance', 'it'],
};

function fetchUrl(url, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    let done = false;
    const done_resolve = (v) => { if (!done) { done = true; resolve(v); } };
    const timer = setTimeout(() => done_resolve(null), timeoutMs);
    try {
      const req = mod.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' },
      }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          clearTimeout(timer);
          try {
            const redirectUrl = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
            fetchUrl(redirectUrl, 8000).then(done_resolve);
          } catch { done_resolve(null); }
          return;
        }
        let html = '';
        res.setEncoding('utf-8');
        res.on('data', d => { html += d; if (html.length > 400000) res.destroy(); });
        res.on('end', () => { clearTimeout(timer); done_resolve(html); });
        res.on('error', () => { clearTimeout(timer); done_resolve(null); });
      });
      req.on('error', () => { clearTimeout(timer); done_resolve(null); });
      req.setTimeout(timeoutMs, () => { req.destroy(); done_resolve(null); });
    } catch { clearTimeout(timer); done_resolve(null); }
  });
}

function detectWeaknesses(html, url, industry) {
  const text = html.toLowerCase();
  const $ = cheerio.load(html);
  const found = {};
  found.chat     = !SIGNALS.chat.some(s => text.includes(s));
  found.booking  = !SIGNALS.booking.some(s => text.includes(s));
  found.reviews  = !SIGNALS.reviews.some(s => text.includes(s));
  found.followup = !SIGNALS.followup.some(s => text.includes(s));
  found.noform   = !SIGNALS.form.some(s => text.includes(s));
  found.mobile   = !/<meta[^>]+viewport/i.test(html);
  const isVoiceIndustry = ['plumber','electrician','builder','trades','automotive','veterinary'].some(k => (industry||'').toLowerCase().includes(k));
  found.voice = isVoiceIndustry && !($('a[href^="tel:"]').length > 0);
  return found;
}

function pickBestWeakness(weaknesses, industry) {
  const ind = (industry || 'default').toLowerCase();
  const priority = INDUSTRY_PRIORITY[ind] || Object.keys(INDUSTRY_PRIORITY).find(k => ind.includes(k)) || 'default';
  const priorityList = typeof priority === 'string' ? INDUSTRY_PRIORITY[priority] : priority;
  for (const key of priorityList) {
    if (weaknesses[key]) return { type: key, message: WEAKNESS_MESSAGES[key] };
  }
  for (const key of Object.keys(weaknesses)) {
    if (weaknesses[key] && WEAKNESS_MESSAGES[key]) return { type: key, message: WEAKNESS_MESSAGES[key] };
  }
  return null;
}

// ── Deep context extraction — the engine behind $10K copywriter quality ──
function extractContext(html, url, industry) {
  const $ = cheerio.load(html);
  const text = html.toLowerCase();
  const rawText = $.text();
  const ctx = {};

  // Basic identity
  ctx.title       = ($('title').first().text() || '').trim().slice(0, 120);
  ctx.description = ($('meta[name="description"]').attr('content') || '').trim().slice(0, 200);
  ctx.h1          = ($('h1').first().text() || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  ctx.tagline     = ($('.hero h2, .tagline, .subtitle, [class*="hero"] p, [class*="banner"] h2').first().text() || '').replace(/\s+/g, ' ').trim().slice(0, 150);

  // Services — extract from nav menus, service sections, lists
  const services = new Set();
  $('nav a, .services a, .service-list a, [class*="service"] h3, [class*="service"] h4, [id*="service"] h3').each((_, el) => {
    const s = $(el).text().replace(/\s+/g, ' ').trim();
    if (s.length > 2 && s.length < 55 && !/home|about|contact|blog|news|privacy|terms/i.test(s)) services.add(s);
  });
  $('[class*="service"] li, [id*="service"] li, .offerings li').each((_, el) => {
    const s = $(el).text().replace(/\s+/g, ' ').trim();
    if (s.length > 2 && s.length < 55) services.add(s);
  });
  ctx.services = [...services].slice(0, 6);

  // Specialties — find specific keywords for this industry
  const ind = (industry || '').toLowerCase();
  const specKeywords = Object.keys(SPECIALTY_KEYWORDS).find(k => ind.includes(k));
  if (specKeywords) {
    ctx.specialties = SPECIALTY_KEYWORDS[specKeywords].filter(kw => text.includes(kw.toLowerCase()));
  } else {
    ctx.specialties = [];
  }

  // Year established — multiple patterns
  const yearMatches = rawText.match(/(?:established|since|founded|est\.?|trading since|serving\s+(?:\w+\s+)?since)\s*(?:in\s*)?(\d{4})/i);
  ctx.established = yearMatches ? yearMatches[1] : '';
  if (!ctx.established) {
    const copyrightYear = rawText.match(/©\s*(?:copyright\s*)?(\d{4})/);
    if (copyrightYear && parseInt(copyrightYear[1]) < new Date().getFullYear() - 1) {
      ctx.established = copyrightYear[1];
    }
  }

  // Team size
  const teamMatch = rawText.match(/team of (\d+)|(\d+)\s+(?:dentists?|lawyers?|solicitors?|agents?|vets?|therapists?|staff|professionals?|practitioners?|consultants?)/i);
  ctx.teamSize = teamMatch ? parseInt(teamMatch[1] || teamMatch[2]) : null;

  // Number of locations/branches
  const locationCountMatch = rawText.match(/(\d+)\s+(?:locations?|branches?|clinics?|offices?|practices?|surgeries)/i);
  ctx.numLocations = locationCountMatch ? parseInt(locationCountMatch[1]) : 1;

  // Opening hours — very important for our pitch
  const hoursSection = $('[class*="hour"], [id*="hour"], [class*="opening"], [id*="opening"]').text();
  const hoursFromText = hoursSection || rawText.slice(0, 5000);
  const closedWeekend = /(?:saturday|sunday|weekend)[\s\S]{0,50}?(?:closed|unavailable|n\/a)/i.test(hoursFromText);
  const closedEvening = /(?:mon|tue|wed|thu|fri)[\s\S]{0,30}?(?:5pm|5:00|17:00|6pm|6:00|18:00|4pm|4:00|16:00)/i.test(hoursFromText);
  ctx.closedWeekend = closedWeekend;
  ctx.closedEvening = closedEvening;
  const hoursMatch = hoursFromText.match(/(?:monday|mon)[\s\S]{0,100}?(?:friday|fri)[\s\S]{0,50}?\d{1,2}(?::\d{2})?\s*(?:am|pm)?/i);
  ctx.openingHours = hoursMatch ? hoursMatch[0].replace(/\s+/g, ' ').trim().slice(0, 100) : '';

  // Phone dependency (multiple "call us" mentions = phone-dependent = our pitch)
  const callMentions = (rawText.match(/call us|give us a call|ring us|phone us|telephone us|call to book|call for|call on/gi) || []).length;
  ctx.phoneDependent = callMentions >= 2;
  ctx.callToBook = /call (?:us )?to (?:book|make|arrange|schedule|request)|book by (?:calling|phone|telephone)/i.test(rawText);

  // Location
  const locationMatch = rawText.match(/\b(london|manchester|birmingham|leeds|glasgow|bristol|edinburgh|liverpool|sheffield|cardiff|nottingham|newcastle|brighton|southampton|oxford|cambridge|reading|york|bath|coventry|leicester|exeter|cheltenham|guildford|portsmouth|bournemouth|norwich|derby|wolverhampton|milton keynes|stoke)\b/i);
  ctx.locationMention = locationMatch ? locationMatch[1] : '';

  // Social proof
  ctx.hasTestimonials = /testimonial|review|client said|patient said|★|⭐|5 star/i.test(rawText);
  const reviewCountMatch = rawText.match(/(\d{2,4})\+?\s*(?:reviews?|clients?|customers?|patients?|cases?|properties?)/i);
  ctx.reviewCount = reviewCountMatch ? reviewCountMatch[1] : null;

  // Awards / accreditations
  const awardMatch = rawText.match(/(?:award|accredited|certified|cqc|sra|rics|chartered|regulated|fca authorised|ofsted|iso \d+|iip|lexcel|conveyancing quality)/i);
  ctx.accreditation = awardMatch ? awardMatch[0].trim() : '';

  // Owner name — prioritise About page text
  const aboutText = $('[class*="about"], [id*="about"], [class*="team"], [id*="team"]').text().slice(0, 800);
  const ownerPatterns = [
    /(?:founded|started|run|owned|led|principal|principal dentist|managing director|md|ceo)\s*by\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/,
    /(?:i'm|i am|hi,? i'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
    /(?:dr\.?\s+|mr\.?\s+|mrs\.?\s+)([A-Z][a-z]+\s+[A-Z][a-z]+)/,
  ];
  for (const pattern of ownerPatterns) {
    const m = (aboutText || rawText.slice(0, 2000)).match(pattern);
    if (m) { ctx.ownerName = m[1].trim(); break; }
  }
  if (!ctx.ownerName) ctx.ownerName = '';

  // Emergency/out-of-hours offering
  ctx.hasEmergency = /emergency|24.?7|out of hours|after hours|on call|available 24/i.test(rawText);

  // Price transparency (they show pricing = more commercial)
  ctx.showsPricing = /from\s+£\d+|£\d+\s+per|pricing|our fees|fixed fee|quote/i.test(rawText);

  // Unique hook — pick the most specific, usable detail for personalisation
  ctx.hook = buildHook(ctx, industry);

  return ctx;
}

// ── Build a specific personalisation hook from all extracted data ──
function buildHook(ctx, industry) {
  const hooks = [];

  if (ctx.specialties && ctx.specialties.length > 0) {
    hooks.push({ priority: 10, text: `offers ${ctx.specialties.slice(0, 2).join(' and ')}` });
  }
  if (ctx.established && parseInt(ctx.established) > 1900) {
    const years = new Date().getFullYear() - parseInt(ctx.established);
    if (years >= 3) hooks.push({ priority: 9, text: `has been running for ${years} years` });
  }
  if (ctx.teamSize && ctx.teamSize > 1) {
    hooks.push({ priority: 8, text: `has a team of ${ctx.teamSize}` });
  }
  if (ctx.numLocations > 1) {
    hooks.push({ priority: 8, text: `operates ${ctx.numLocations} locations` });
  }
  if (ctx.reviewCount) {
    hooks.push({ priority: 7, text: `has ${ctx.reviewCount}+ clients` });
  }
  if (ctx.closedWeekend) {
    hooks.push({ priority: 10, text: `is closed weekends — when many clients try to get in touch` });
  }
  if (ctx.callToBook) {
    hooks.push({ priority: 9, text: `still relies on phone-only booking` });
  }
  if (ctx.accreditation) {
    hooks.push({ priority: 6, text: `is ${ctx.accreditation}` });
  }
  if (ctx.tagline && ctx.tagline.length > 10) {
    hooks.push({ priority: 5, text: `positions itself as "${ctx.tagline.slice(0, 60)}"` });
  }

  hooks.sort((a, b) => b.priority - a.priority);
  return hooks.length ? hooks[0].text : '';
}

// ── Groq-powered insight extraction — reads actual page text, finds personalisation gold ──
async function extractInsightsWithGroq(pageText, url, industry) {
  if (!GROQ_API_KEY) return null;

  const snippet = pageText.replace(/\s+/g, ' ').slice(0, 3000);

  const prompt = `You are analysing a UK business website to find ONE specific personalisation hook for a cold email.

WEBSITE SNIPPET:
${snippet}

INDUSTRY: ${industry}

Your job: find the single most specific, concrete, human detail about this business that:
1. Shows you actually read their site (not generic)
2. Can be linked to "missed calls / unanswered enquiries" pain
3. Is factual — something actually stated on the site

Examples of GOOD hooks:
- "you offer emergency root canals but the site says 'call to book' — meaning emergencies at 6pm hit voicemail"
- "you've been a family practice in Leeds for 22 years — that reputation depends on never missing a patient"
- "your team of 4 vets handles exotic animals — that's exactly the kind of urgent call that can't wait"
- "you show pricing upfront (£150 consultation) — which means high-intent leads are already ready to book"

Examples of BAD hooks:
- "I noticed you have a website"
- "your business provides services"
- "you might be losing calls"

Respond with ONE short sentence (max 20 words) that is the hook. Nothing else. No explanation.
If you genuinely cannot find a specific hook, respond with exactly: NONE`;

  return new Promise(resolve => {
    const payload = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 80,
      temperature: 0.3,
    });
    const req = https.request({
      hostname: 'api.groq.com', path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 15000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          const result = (j.choices?.[0]?.message?.content || '').trim();
          resolve(result === 'NONE' || !result ? null : result);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(payload);
    req.end();
  });
}

// ── Main analyze function ──
async function analyzeWebsite(website, industry = 'default') {
  if (!website) return getFallback(industry);
  const url = website.startsWith('http') ? website : 'https://' + website;
  try {
    const html = await fetchUrl(url);
    if (!html || html.length < 200) return getFallback(industry);

    const weaknesses = detectWeaknesses(html, url, industry);
    const best = pickBestWeakness(weaknesses, industry);
    const context = extractContext(html, url, industry);

    // Groq insight — runs in parallel, improves hook
    const $ = cheerio.load(html);
    const pageText = $.text();
    const groqInsight = await extractInsightsWithGroq(pageText, url, industry);
    if (groqInsight) context.groqHook = groqInsight;

    if (!best) {
      const fb = getFallback(industry);
      return { ...fb, context, found: false };
    }

    const product = PRODUCTS[best.type];
    const allFound = Object.keys(weaknesses).filter(k => weaknesses[k] && WEAKNESS_MESSAGES[k]);

    return {
      found: true,
      weakness: best.message,
      productKey: best.type,
      productName: product.name,
      productPrice: product.price,
      upsell: product.upsell || '',
      allWeaknesses: allFound.map(k => WEAKNESS_MESSAGES[k]),
      context,
    };
  } catch {
    return getFallback(industry);
  }
}

function getFallback(industry) {
  const ind = (industry || 'default').toLowerCase();
  const match = Object.keys(INDUSTRY_FALLBACK).find(k => ind === k || ind.includes(k)) || 'default';
  const prob = INDUSTRY_FALLBACK[match];
  const product = PRODUCTS[prob.product] || PRODUCTS.booking;
  return {
    found: false,
    weakness: prob.weakness,
    productKey: prob.product,
    productName: product.name,
    productPrice: product.price,
    upsell: product.upsell || '',
    allWeaknesses: [prob.weakness],
  };
}

module.exports = { analyzeWebsite, getFallback, PRODUCTS, detectWeaknesses };
