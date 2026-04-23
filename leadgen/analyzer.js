// ── Business Website Analyzer v2 ──
// Finds specific weaknesses → maps to Klivio products
const https = require('https');
const http = require('http');
const cheerio = require('cheerio');

const PRODUCTS = {
  chat:     { name: 'Live Chat Assistant',      price: '$297/mo' },
  booking:  { name: 'AI Lead Responder',        price: '$197/mo' },
  followup: { name: 'Follow-Up Automator',      price: '$197/mo' },
  reviews:  { name: 'Review & Referral System', price: '$197/mo' },
  valuation:{ name: 'Valuation Bot',            price: '$297/mo' },
  voice:    { name: 'Voice Assistant',          price: '$497/mo' },
  chatbot:  { name: 'AI Chatbot',               price: '$297/mo' },
};

// ── Industry → priority weaknesses (what hurts most in this vertical) ──
// Order defines priority — first match wins
const INDUSTRY_PRIORITY = {
  dental:     ['booking', 'chat', 'reviews'],
  dentist:    ['booking', 'chat', 'reviews'],
  medical:    ['booking', 'chat', 'followup'],
  healthcare: ['booking', 'chat', 'followup'],
  clinic:     ['booking', 'chat', 'followup'],
  veterinary: ['voice', 'booking', 'chat'],
  law:        ['booking', 'followup', 'chat'],
  legal:      ['booking', 'followup', 'chat'],
  solicitor:  ['booking', 'followup', 'chat'],
  accounting: ['booking', 'followup', 'chat'],
  accountant: ['booking', 'followup', 'chat'],
  fitness:    ['followup', 'booking', 'chat'],
  gym:        ['followup', 'booking', 'chat'],
  restaurant: ['booking', 'reviews', 'chat'],
  hotel:      ['booking', 'chat', 'reviews'],
  beauty:     ['booking', 'chat', 'reviews'],
  realestate: ['chat', 'booking', 'followup'],
  estate:     ['chat', 'booking', 'followup'],
  property:   ['chat', 'booking', 'followup'],
  automotive: ['voice', 'chat', 'followup'],
  trades:     ['voice', 'chat', 'followup'],
  plumber:    ['voice', 'chat', 'followup'],
  electrician:['voice', 'chat', 'followup'],
  builder:    ['voice', 'chat', 'followup'],
  cleaning:   ['booking', 'chat', 'followup'],
  pharmacy:   ['chat', 'booking', 'followup'],
  optician:   ['booking', 'chat', 'reviews'],
  ecommerce:  ['chatbot', 'chat', 'followup'],
  shop:       ['chatbot', 'chat', 'followup'],
  education:  ['booking', 'chat', 'followup'],
  recruitment:['followup', 'chat', 'booking'],
  insurance:  ['followup', 'booking', 'chat'],
  wedding:    ['booking', 'chat', 'followup'],
  default:    ['chat', 'booking', 'followup'],
};

// ── Industry fallback weaknesses (когато сайтът не дава signals) ──
const INDUSTRY_FALLBACK = {
  dental:      { weakness: 'there\'s no online booking and new patients have to call during office hours', product: 'booking' },
  dentist:     { weakness: 'there\'s no online booking and new patients have to call during office hours', product: 'booking' },
  law:         { weakness: 'there\'s no way for potential clients to book a consultation outside of phone hours', product: 'booking' },
  legal:       { weakness: 'there\'s no way for potential clients to book a consultation outside of phone hours', product: 'booking' },
  solicitor:   { weakness: 'there\'s no way for potential clients to book a consultation outside of phone hours', product: 'booking' },
  realestate:  { weakness: 'there\'s no live chat and property enquiries sent evenings/weekends likely go unanswered', product: 'chat' },
  estate:      { weakness: 'there\'s no live chat and property enquiries sent evenings/weekends likely go unanswered', product: 'chat' },
  property:    { weakness: 'there\'s no live chat and property enquiries sent evenings/weekends likely go unanswered', product: 'chat' },
  restaurant:  { weakness: 'there\'s no online booking — missed reservation enquiries and unanswered booking messages', product: 'booking' },
  fitness:     { weakness: 'there\'s no automated follow-up — gym leads go cold within 48 hours without one', product: 'followup' },
  gym:         { weakness: 'there\'s no automated follow-up — gym leads go cold within 48 hours without one', product: 'followup' },
  plumber:     { weakness: 'there\'s no 24/7 call handling — customers ring 3 tradespeople and whoever answers first wins', product: 'voice' },
  electrician: { weakness: 'there\'s no 24/7 call handling — customers ring 3 tradespeople and whoever answers first wins', product: 'voice' },
  builder:     { weakness: 'there\'s no 24/7 call handling — customers ring 3 tradespeople and whoever answers first wins', product: 'voice' },
  trades:      { weakness: 'there\'s no 24/7 call handling — customers ring 3 tradespeople and whoever answers first wins', product: 'voice' },
  accountant:  { weakness: 'there\'s no online consultation booking — tax season enquiries pile up and slow response loses clients', product: 'booking' },
  accounting:  { weakness: 'there\'s no online consultation booking — tax season enquiries pile up and slow response loses clients', product: 'booking' },
  ecommerce:   { weakness: 'there\'s no chatbot handling product questions — abandoned carts and lost sales', product: 'chatbot' },
  shop:        { weakness: 'there\'s no chatbot handling product questions — abandoned carts and lost sales', product: 'chatbot' },
  clinic:      { weakness: 'there\'s no instant booking or chat — patients expect replies in minutes, not hours', product: 'booking' },
  healthcare:  { weakness: 'there\'s no instant booking or chat — patients expect replies in minutes, not hours', product: 'booking' },
  medical:     { weakness: 'there\'s no instant booking or chat — patients expect replies in minutes, not hours', product: 'booking' },
  beauty:      { weakness: 'there\'s no online booking — clients book on impulse and leave if they can\'t schedule in 2 minutes', product: 'booking' },
  veterinary:  { weakness: 'there\'s no after-hours call handling — pet owners in distress call whoever answers first', product: 'voice' },
  hotel:       { weakness: 'there\'s no direct-booking chat widget — guests book through OTAs and you lose 15-25% to commission', product: 'chat' },
  cleaning:    { weakness: 'there\'s no instant booking or quote form — commercial enquiries go to whoever responds first', product: 'booking' },
  pharmacy:    { weakness: 'there\'s no live chat — customers ask quick questions and if nobody replies they go elsewhere', product: 'chat' },
  optician:    { weakness: 'there\'s no online appointment booking — patients have to call during opening hours', product: 'booking' },
  recruitment: { weakness: 'there\'s no automated candidate follow-up — applicants go cold without consistent touch', product: 'followup' },
  insurance:   { weakness: 'there\'s no automated quote follow-up — prospects compare 3 quotes and buy from whoever stays in touch', product: 'followup' },
  wedding:     { weakness: 'there\'s no instant booking enquiry system — couples book the first venue that replies within an hour', product: 'booking' },
  default:     { weakness: 'there\'s no live chat and enquiries outside office hours likely go unanswered', product: 'chat' },
};

// ── Weakness messages (when detected on site) ──
const WEAKNESS_MESSAGES = {
  chat:     'there\'s no live chat on the site — enquiries sent outside office hours likely go unanswered',
  booking:  'there\'s no online booking system — every new enquiry requires a phone call during business hours',
  reviews:  'there\'s no visible review collection system — social proof matters huge for local trust',
  followup: 'there\'s no automated follow-up system — leads that don\'t reply to the first message are lost',
  voice:    'there\'s no after-hours voice handling — calls outside opening hours go to voicemail and never convert',
  chatbot:  'there\'s no chatbot answering product questions — visitors with questions just leave',
  valuation:'there\'s no instant quote/valuation tool — visitors who want a price leave and compare elsewhere',
  slow:     'the site loads slowly on mobile — visitors bounce before they even see what you offer',
  mobile:   'the site isn\'t mobile-optimized properly — half your traffic struggles to book or contact you',
  noform:   'there\'s no visible contact form — hard for new leads to reach you without picking up the phone',
};

// ── Detection signals (expanded) ──
const SIGNALS = {
  chat: ['tawk.to', 'crisp.chat', 'intercom', 'drift.com', 'tidio', 'zendesk', 'freshchat', 'livechat', 'hubspot', 'chatlio', 'olark', 'userlike', 'chatra', 'smartsupp', 'jivochat', 'livezilla', 'snapengage', '.chatbot', 'chatwidget'],
  booking: ['calendly.com', 'acuityscheduling', 'simplybook', 'booksy', 'fresha', 'treatwell', 'square appointments', 'book now', 'book an appointment', 'book online', 'online booking', 'booksteamnow', 'setmore', 'youcanbook.me', 'reservation', 'opentable', 'resy.com', 'bookatable'],
  reviews: ['google reviews', 'trustpilot.com', 'reviews.io', 'feefo.com', 'trustindex', 'reviewsnap', 'yotpo', 'okendo', 'judge.me', 'bazaarvoice'],
  followup: ['mailchimp', 'klaviyo', 'hubspot', 'pipedrive', 'salesforce', 'activecampaign', 'constant contact', 'convertkit', 'drip.com', 'sendinblue', 'brevo', 'sendgrid'],
  voice: ['click to call', 'tel:', 'call now', '24/7 support', 'emergency call'],
  form: ['<form', 'contact-form', 'wpcf7', 'gravity-form', 'contact form 7', 'ninja-forms', 'formidable', 'forminator', 'wufoo'],
};

// ── Fetch with timeout ──
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
            const redirectUrl = res.headers.location.startsWith('http')
              ? res.headers.location
              : new URL(res.headers.location, url).href;
            fetchUrl(redirectUrl, 8000).then(done_resolve);
          } catch { done_resolve(null); }
          return;
        }
        let html = '';
        res.setEncoding('utf-8');
        res.on('data', d => { html += d; if (html.length > 300000) res.destroy(); });
        res.on('end', () => { clearTimeout(timer); done_resolve(html); });
        res.on('error', () => { clearTimeout(timer); done_resolve(null); });
      });
      req.on('error', () => { clearTimeout(timer); done_resolve(null); });
      req.setTimeout(timeoutMs, () => { req.destroy(); done_resolve(null); });
    } catch { clearTimeout(timer); done_resolve(null); }
  });
}

// ── Detect weaknesses on a page ──
function detectWeaknesses(html, url, industry) {
  const text = html.toLowerCase();
  const found = {};

  // Core signals
  found.chat     = !SIGNALS.chat.some(s => text.includes(s));
  found.booking  = !SIGNALS.booking.some(s => text.includes(s));
  found.reviews  = !SIGNALS.reviews.some(s => text.includes(s));
  found.followup = !SIGNALS.followup.some(s => text.includes(s));
  found.noform   = !SIGNALS.form.some(s => text.includes(s));

  // Mobile-friendly check
  const hasViewport = /<meta[^>]+viewport/i.test(html);
  found.mobile = !hasViewport;

  // Mobile-first signals
  const $ = cheerio.load(html);
  const hasClickToCall = $('a[href^="tel:"]').length > 0;

  // For trades/voice industries — lack of click-to-call is a real weakness
  const isVoiceIndustry = ['plumber','electrician','builder','trades','automotive','veterinary'].some(k => (industry || '').toLowerCase().includes(k));
  found.voice = isVoiceIndustry && !hasClickToCall;

  return found;
}

// ── Pick most impactful weakness based on industry priority ──
function pickBestWeakness(weaknesses, industry) {
  const ind = (industry || 'default').toLowerCase();
  const priority = INDUSTRY_PRIORITY[ind] || Object.keys(INDUSTRY_PRIORITY).find(k => ind.includes(k)) || 'default';
  const priorityList = typeof priority === 'string' ? INDUSTRY_PRIORITY[priority] : priority;

  for (const key of priorityList) {
    if (weaknesses[key]) {
      return { type: key, message: WEAKNESS_MESSAGES[key] };
    }
  }

  // Fallback to any found weakness
  for (const key of Object.keys(weaknesses)) {
    if (weaknesses[key] && WEAKNESS_MESSAGES[key]) {
      return { type: key, message: WEAKNESS_MESSAGES[key] };
    }
  }

  return null;
}

// ── Extract rich context from website for deep personalization ──
function extractContext(html, url) {
  const $ = cheerio.load(html);
  const text = html.toLowerCase();
  const ctx = {};

  // Page title (often contains tagline)
  ctx.title = ($('title').first().text() || '').trim().slice(0, 120);

  // Meta description — good summary of the business
  ctx.description = ($('meta[name="description"]').attr('content') || '').trim().slice(0, 200);

  // H1 — main value prop
  ctx.h1 = ($('h1').first().text() || '').trim().slice(0, 100);

  // Hero tagline (often h2 or .hero/.tagline class)
  ctx.tagline = ($('.hero h2, .tagline, .subtitle, section.hero p').first().text() || '').trim().slice(0, 150);

  // Services/offerings — look for lists in service sections
  const services = [];
  $('section:has(h2), .services, #services').find('h3, li').slice(0, 8).each((_, el) => {
    const s = $(el).text().trim();
    if (s.length > 3 && s.length < 60 && !services.includes(s)) services.push(s);
  });
  ctx.services = services.slice(0, 5);

  // Year established (if mentioned)
  const yearMatch = text.match(/(?:established|since|founded|est\.?)\s*(?:in\s*)?(\d{4})/);
  ctx.established = yearMatch ? yearMatch[1] : '';

  // Location hints (useful if lead doesn't have city)
  const locationMatch = text.match(/\b(london|manchester|birmingham|leeds|glasgow|bristol|edinburgh|liverpool|sheffield|cardiff|nottingham|newcastle|brighton|southampton|oxford|cambridge|reading|york|bath)\b/i);
  ctx.locationMention = locationMatch ? locationMatch[1] : '';

  // Social proof signals
  ctx.hasTestimonials = /testimonial|review|client said|★|⭐/i.test(text);
  ctx.reviewCount = (text.match(/(\d{2,4})\+?\s*(?:reviews?|clients?|customers?|patients?)/i) || [])[1] || null;

  // Owner/team name (helps personalize greeting)
  const aboutText = $('.about, #about, [class*="team"]').text().slice(0, 500);
  const ownerMatch = aboutText.match(/(?:founded|run|owned|led)\s+by\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/);
  ctx.ownerName = ownerMatch ? ownerMatch[1] : '';

  return ctx;
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
    const context = extractContext(html, url);

    if (!best) {
      const fb = getFallback(industry);
      return { ...fb, context };
    }

    const product = PRODUCTS[best.type];
    if (!product) {
      const fb = getFallback(industry);
      return { ...fb, context };
    }

    const allFound = Object.keys(weaknesses).filter(k => weaknesses[k] && WEAKNESS_MESSAGES[k]);

    return {
      found: true,
      weakness: best.message,
      productKey: best.type,
      productName: product.name,
      productPrice: product.price,
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
  const product = PRODUCTS[prob.product];
  return {
    found: false,
    weakness: prob.weakness,
    productKey: prob.product,
    productName: product.name,
    productPrice: product.price,
    allWeaknesses: [prob.weakness],
  };
}

module.exports = { analyzeWebsite, getFallback, PRODUCTS, detectWeaknesses };
