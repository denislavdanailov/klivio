// ── Competitor Finder ──
// Finds a local competitor from the leads database to use as social proof.
// "A dental practice 10 minutes from you went live with Klivio last week."
const fs = require('fs');
const path = require('path');

const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');

// City aliases — normalise variations to one key
const CITY_ALIASES = {
  'london': ['london', 'central london', 'east london', 'west london', 'north london', 'south london',
             'hackney', 'islington', 'camden', 'lambeth', 'southwark', 'lewisham', 'greenwich',
             'wandsworth', 'hammersmith', 'fulham', 'kensington', 'chelsea', 'westminster',
             'tower hamlets', 'newham', 'waltham forest', 'haringey', 'barnet', 'enfield',
             'bromley', 'croydon', 'richmond', 'kingston', 'merton', 'sutton', 'bexley'],
  'manchester': ['manchester', 'salford', 'trafford', 'stockport', 'tameside', 'oldham', 'rochdale'],
  'birmingham': ['birmingham', 'solihull', 'dudley', 'wolverhampton', 'walsall', 'sandwell'],
  'leeds':      ['leeds', 'bradford', 'wakefield', 'huddersfield'],
  'bristol':    ['bristol', 'bath', 'gloucester'],
  'sheffield':  ['sheffield', 'rotherham', 'barnsley'],
  'liverpool':  ['liverpool', 'wirral', 'knowsley', 'sefton'],
  'edinburgh':  ['edinburgh', 'lothian'],
  'glasgow':    ['glasgow', 'renfrewshire', 'east renfrewshire'],
};

function normaliseCity(city) {
  if (!city) return null;
  const c = city.toLowerCase().trim();
  for (const [key, aliases] of Object.entries(CITY_ALIASES)) {
    if (aliases.some(a => c.includes(a) || a.includes(c))) return key;
  }
  return c;
}

function normaliseIndustry(ind) {
  if (!ind) return 'generic';
  const i = ind.toLowerCase();
  if (i.includes('dental') || i.includes('dentist')) return 'dental';
  if (i.includes('real') || i.includes('estate') || i.includes('property')) return 'realestate';
  if (i.includes('law') || i.includes('legal') || i.includes('solicit')) return 'law';
  if (i.includes('fit') || i.includes('gym')) return 'fitness';
  if (i.includes('account')) return 'accounting';
  if (i.includes('health') || i.includes('medical') || i.includes('clinic')) return 'healthcare';
  if (i.includes('vet')) return 'veterinary';
  if (i.includes('trade') || i.includes('electric') || i.includes('plumb')) return 'trades';
  if (i.includes('ecom') || i.includes('shop') || i.includes('retail')) return 'ecommerce';
  return i;
}

// Phrases that make the competitor mention feel natural and varied
const COMPETITOR_PHRASES = [
  (name, city, ind) => `A ${ind} practice in ${city} — ${name} — went live with our AI last week.`,
  (name, city, ind) => `${name}, a ${ind} business in ${city}, just switched to AI this month.`,
  (name, city, ind) => `We onboarded ${name} in ${city} last week — same ${ind} setup.`,
  (name, city, ind) => `${name} in ${city} just went live. They're in the same space as you.`,
  (name, city, ind) => `One of your competitors in ${city} — ${name} — automated this last week.`,
];

function getPhrase(name, city, industry) {
  const label = industry === 'realestate' ? 'estate agent' :
                industry === 'law' ? 'law firm' :
                industry === 'dental' ? 'dental' :
                industry === 'fitness' ? 'gym' :
                industry;
  const pick = COMPETITOR_PHRASES[Math.floor(Math.random() * COMPETITOR_PHRASES.length)];
  return pick(name, city, label);
}

/**
 * Find a local competitor for a given lead.
 * Returns { name, city, phrase } or null.
 *
 * Priority:
 *  1. Same city + same industry (best)
 *  2. Same city + any industry (ok)
 *  3. Any city + same industry (fallback)
 */
function findLocalCompetitor(lead) {
  if (!fs.existsSync(LEADS_FILE)) return null;

  let all;
  try { all = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8')); }
  catch { return null; }

  const selfEmail = (lead.email || '').toLowerCase();
  const selfCity = normaliseCity(lead.city || lead.location || '');
  const selfInd  = normaliseIndustry(lead.industry);

  // Filter out self and leads with no business name
  const pool = all.filter(l =>
    l.email?.toLowerCase() !== selfEmail &&
    l.business &&
    l.business.length > 2
  );

  // Score candidates
  const scored = pool.map(l => {
    const lCity = normaliseCity(l.city || l.location || '');
    const lInd  = normaliseIndustry(l.industry);
    let score = 0;
    if (selfCity && lCity && selfCity === lCity) score += 10;
    if (selfInd  && lInd  && selfInd  === lInd)  score += 8;
    // Prefer leads that are marked sent (more realistic "they already bought")
    if (l.status === 'sent' || l.status === 'replied') score += 3;
    return { lead: l, score };
  });

  // Pick best match (score > 0 only)
  const candidates = scored.filter(s => s.score >= 8).sort((a, b) => b.score - a.score);
  if (!candidates.length) return null;

  // Pick randomly from top 5 to vary the name used
  const top = candidates.slice(0, 5);
  const chosen = top[Math.floor(Math.random() * top.length)].lead;

  const displayCity = chosen.city || lead.city || selfCity || 'your area';
  const phrase = getPhrase(chosen.business, displayCity, selfInd);

  return { name: chosen.business, city: displayCity, phrase };
}

module.exports = { findLocalCompetitor };
