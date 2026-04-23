// ── Lead Scoring System ──
// Scores each lead 0-100 based on fit + signal + intent
// Higher score = hotter lead = prioritize in campaign queue
//
// node leadgen/scorer.js           → score all leads, save to leads.json
// node leadgen/scorer.js --top 50  → show top 50 scored leads
// node leadgen/scorer.js --stats   → distribution stats
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');

// ── Industry tiers (higher = more $$$ per deal) ──
const INDUSTRY_TIER = {
  // Tier 1: High-ticket services (average deal = £2k-10k+)
  'dental': 10, 'dentist': 10, 'cosmetic-surgery': 10, 'private-clinic': 10,
  'law-firm': 10, 'solicitor': 10, 'accountant': 9, 'financial-advisor': 10,
  'plastic-surgery': 10, 'orthodontist': 10, 'veterinary': 9,
  // Tier 2: Mid-ticket (£500-2k)
  'physiotherapy': 8, 'chiropractor': 8, 'optician': 7, 'estate-agent': 9,
  'builder': 8, 'electrician': 7, 'plumber': 7, 'roofer': 7, 'architect': 8,
  'mortgage-broker': 9, 'wedding-planner': 7, 'photographer': 6,
  // Tier 3: Volume / lower ticket
  'restaurant': 5, 'cafe': 4, 'hair-salon': 5, 'barber': 4, 'beauty-salon': 5,
  'gym': 6, 'yoga-studio': 5, 'driving-school': 5, 'tutor': 5,
  'car-repair': 6, 'car-dealer': 7, 'cleaner': 4, 'removals': 5,
};

// ── Score factors ──
function scoreLead(lead) {
  let score = 0;
  const reasons = [];

  // 1. Industry tier (0-20 points)
  const industryKey = (lead.industry || '').toLowerCase().replace(/\s+/g, '-');
  const tier = INDUSTRY_TIER[industryKey] || 5;
  const industryScore = tier * 2;
  score += industryScore;
  reasons.push(`industry:${industryKey}(+${industryScore})`);

  // 2. Has contact name (0-15 points) — personalization matters
  if (lead.contactName && lead.contactName.trim().length > 2) {
    score += 15;
    reasons.push('has_name(+15)');
  }

  // 3. Has website (0-10 points) — serious business
  if (lead.website && lead.website.startsWith('http')) {
    score += 10;
    reasons.push('has_website(+10)');
  }

  // 4. Has phone (0-5 points)
  if (lead.phone && lead.phone.replace(/\D/g, '').length >= 7) {
    score += 5;
    reasons.push('has_phone(+5)');
  }

  // 5. Email quality (0-15 points) — info@ lower, firstname@ higher
  const email = (lead.email || '').toLowerCase();
  if (email) {
    const local = email.split('@')[0] || '';
    if (/^(info|hello|contact|enquiries|admin|office|sales|mail)/.test(local)) {
      score += 5;
      reasons.push('generic_email(+5)');
    } else if (local.length > 2 && !/^(noreply|no-reply|bounce|mailer)/.test(local)) {
      score += 15;
      reasons.push('personal_email(+15)');
    }
  }

  // 6. Business size / established (0-10 points)
  if (lead.websiteContext?.established) {
    const age = new Date().getFullYear() - parseInt(lead.websiteContext.established);
    if (age >= 10) { score += 10; reasons.push('established_10y+(+10)'); }
    else if (age >= 3) { score += 5; reasons.push('established_3y+(+5)'); }
  }

  // 7. Has testimonials / reviews (0-5 points) — credible business
  if (lead.websiteContext?.hasTestimonials) {
    score += 5;
    reasons.push('testimonials(+5)');
  }
  if (lead.websiteContext?.reviewCount && lead.websiteContext.reviewCount >= 10) {
    score += 5;
    reasons.push(`reviews_${lead.websiteContext.reviewCount}(+5)`);
  }

  // 8. City tier (0-10 points) — London/Manchester > smaller towns
  const city = (lead.city || '').toLowerCase();
  if (/london|manchester|birmingham|edinburgh|bristol/.test(city)) {
    score += 10;
    reasons.push('major_city(+10)');
  } else if (/leeds|glasgow|liverpool|cardiff|nottingham|sheffield|oxford|cambridge/.test(city)) {
    score += 7;
    reasons.push('mid_city(+7)');
  } else {
    score += 3;
    reasons.push('small_city(+3)');
  }

  // 9. Signal strength from analyzer (0-15 points) — clear weakness found
  if (lead.sentWeakness && lead.sentWeakness !== 'missed enquiries') {
    score += 10;
    reasons.push('clear_weakness(+10)');
  }

  // 10. Intent signals (MASSIVE boosts/penalties)
  if (lead.hot || lead.replyIntent === 'interested') {
    score += 50;
    reasons.push('INTERESTED(+50)');
  }
  if (lead.replyIntent === 'question') {
    score += 30;
    reasons.push('ASKED_QUESTION(+30)');
  }
  if (lead.booked) {
    score += 100;
    reasons.push('BOOKED(+100)');
  }
  if (lead.replyIntent === 'not_interested' || lead.unsubscribed) {
    score = 0;
    reasons.push('DEAD(0)');
  }

  // Cap at 100 unless booked
  const final = lead.booked ? Math.min(score, 200) : Math.min(score, 100);

  return {
    score: final,
    tier: final >= 80 ? 'A' : final >= 60 ? 'B' : final >= 40 ? 'C' : 'D',
    reasons,
  };
}

function runScoring({ save = true } = {}) {
  const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8'));
  const scored = leads.map(l => {
    const { score, tier, reasons } = scoreLead(l);
    return { ...l, score, tier, scoreReasons: reasons };
  });

  if (save) {
    fs.writeFileSync(LEADS_FILE, JSON.stringify(scored, null, 2));
  }

  const dist = { A: 0, B: 0, C: 0, D: 0 };
  scored.forEach(l => dist[l.tier]++);

  return { scored, dist };
}

function showTop(n = 50) {
  const { scored } = runScoring({ save: false });
  const top = scored
    .filter(l => l.status === 'new')
    .sort((a, b) => b.score - a.score)
    .slice(0, n);

  console.log(`\n🏆 TOP ${n} LEADS (status=new)\n` + '═'.repeat(80));
  top.forEach((l, i) => {
    console.log(`${String(i+1).padStart(3)}. [${l.tier}] ${String(l.score).padStart(3)} | ${l.business.padEnd(35).slice(0, 35)} | ${l.industry?.padEnd(15).slice(0, 15)} | ${l.city}`);
  });
  console.log('═'.repeat(80) + '\n');
}

function showStats() {
  const { scored, dist } = runScoring({ save: false });
  const total = scored.length;
  console.log('\n📊 LEAD SCORE DISTRIBUTION\n' + '═'.repeat(50));
  console.log(`  Total leads: ${total}`);
  console.log(`  A (80-100):  ${dist.A}  (${(dist.A/total*100).toFixed(1)}%)  ← PRIORITY`);
  console.log(`  B (60-79):   ${dist.B}  (${(dist.B/total*100).toFixed(1)}%)  ← good`);
  console.log(`  C (40-59):   ${dist.C}  (${(dist.C/total*100).toFixed(1)}%)  ← ok`);
  console.log(`  D (0-39):    ${dist.D}  (${(dist.D/total*100).toFixed(1)}%)  ← skip`);
  console.log('═'.repeat(50) + '\n');

  // Industry breakdown of A-tier
  const aLeads = scored.filter(l => l.tier === 'A');
  const byIndustry = {};
  aLeads.forEach(l => { byIndustry[l.industry] = (byIndustry[l.industry] || 0) + 1; });
  console.log('Top industries in A-tier:');
  Object.entries(byIndustry).sort((a,b) => b[1]-a[1]).slice(0, 10).forEach(([ind, n]) => {
    console.log(`  ${ind.padEnd(20)} ${n}`);
  });
  console.log('');
}

module.exports = { scoreLead, runScoring };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--stats')) {
    showStats();
  } else if (args.includes('--top')) {
    const n = parseInt(args[args.indexOf('--top') + 1]) || 50;
    showTop(n);
  } else {
    const { scored, dist } = runScoring({ save: true });
    console.log(`✅ Scored ${scored.length} leads | A:${dist.A} B:${dist.B} C:${dist.C} D:${dist.D}`);
  }
}
