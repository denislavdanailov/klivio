// ── Klivio LinkedIn Outreach System ──
// 1. Finds decision-maker LinkedIn profiles via Google search (free)
// 2. Generates hyper-personalised DMs using Groq
// 3. Exports CSV ready for manual send or Expandi/Dripify import
//
// node leadgen/linkedin.js generate "dental london"    → generate 20 DMs
// node leadgen/linkedin.js export                      → export all to CSV
// node leadgen/linkedin.js stats                       → show pipeline
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs    = require('fs');
const path  = require('path');
const https = require('https');

const GROQ_API_KEY  = process.env.GROQ_API_KEY;
const DATA_FILE     = path.join(__dirname, 'data', 'linkedin_leads.json');
const CSV_FILE      = path.join(__dirname, 'data', 'linkedin_export.csv');

// ── Decision-maker titles by industry ──
const DECISION_MAKER_TITLES = {
  dental:     ['principal dentist', 'practice owner', 'dental practice manager', 'practice principal'],
  law:        ['managing partner', 'senior partner', 'solicitor director', 'law firm owner', 'founding partner'],
  realestate: ['estate agent director', 'branch manager', 'property company owner', 'md estate agency'],
  fitness:    ['gym owner', 'fitness studio owner', 'personal trainer owner', 'gym director'],
  veterinary: ['veterinary practice owner', 'principal vet', 'practice director', 'vet owner'],
  accounting: ['accounting firm owner', 'managing director accountant', 'practice partner', 'chartered accountant director'],
  cleaning:   ['cleaning company director', 'cleaning business owner', 'facilities management director'],
  recruitment:['recruitment director', 'agency owner', 'managing director recruitment', 'staffing company owner'],
  default:    ['owner', 'director', 'managing director', 'founder', 'ceo'],
};

function loadLeads() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
  catch { return []; }
}

function saveLeads(leads) {
  if (!fs.existsSync(path.dirname(DATA_FILE))) fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(leads, null, 2));
}

// ── Google search for LinkedIn profiles (free — no API needed) ──
function searchLinkedInProfiles(industry, city, count = 20) {
  return new Promise(resolve => {
    const ind = industry.toLowerCase();
    const titles = DECISION_MAKER_TITLES[ind] || DECISION_MAKER_TITLES.default;
    const titleStr = titles.slice(0, 3).map(t => `"${t}"`).join(' OR ');
    const query = encodeURIComponent(`site:linkedin.com/in (${titleStr}) "${city}" -jobs -recruiter`);
    const url   = `https://www.google.com/search?q=${query}&num=${count}&hl=en`;

    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      timeout: 15000,
    }, res => {
      let html = '';
      res.on('data', d => html += d);
      res.on('end', () => {
        const profiles = parseGoogleLinkedIn(html);
        resolve(profiles);
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.end();
  });
}

function parseGoogleLinkedIn(html) {
  const profiles = [];
  // Extract LinkedIn URLs from Google search results
  const urlPattern = /https?:\/\/(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9\-]+)/g;
  const titlePattern = /<h3[^>]*>([\s\S]*?)<\/h3>/g;
  const snippetPattern = /<span[^>]*class="[^"]*st"[^>]*>([\s\S]*?)<\/span>/g;

  const urls = [];
  let m;
  while ((m = urlPattern.exec(html)) !== null) {
    const fullUrl = `https://www.linkedin.com/in/${m[1]}`;
    if (!urls.includes(fullUrl)) urls.push(fullUrl);
  }

  // Also extract from encoded URLs in Google results
  const encodedPattern = /linkedin\.com%2Fin%2F([a-zA-Z0-9\-]+)/g;
  while ((m = encodedPattern.exec(html)) !== null) {
    const fullUrl = `https://www.linkedin.com/in/${m[1]}`;
    if (!urls.includes(fullUrl)) urls.push(fullUrl);
  }

  // Try to extract names and titles from surrounding text
  const blockPattern = /<div[^>]*>([\s\S]*?linkedin\.com\/in\/([a-zA-Z0-9\-]+)[\s\S]*?)<\/div>/g;
  while ((m = blockPattern.exec(html)) !== null) {
    const block = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const profileUrl = `https://www.linkedin.com/in/${m[2]}`;

    // Try to find name (usually first line before the URL)
    const nameMatch = block.match(/^([A-Z][a-z]+ [A-Z][a-z]+)/);
    const titleMatch = block.match(/(?:owner|director|manager|partner|principal|founder|ceo|md)[^|·—]*/i);

    if (profileUrl && !profiles.find(p => p.url === profileUrl)) {
      profiles.push({
        url: profileUrl,
        name: nameMatch ? nameMatch[1] : '',
        titleHint: titleMatch ? titleMatch[0].trim().slice(0, 80) : '',
        snippet: block.slice(0, 200),
      });
    }
  }

  // Fill in any URLs we found that aren't in profiles yet
  for (const url of urls) {
    if (!profiles.find(p => p.url === url)) {
      profiles.push({ url, name: '', titleHint: '', snippet: '' });
    }
  }

  return profiles.slice(0, 25);
}

// ── Generate LinkedIn DM using Groq ──
async function generateLinkedInDM(profile, industry, city) {
  const firstName = (profile.name || '').split(' ')[0] || '';

  const prompt = `You are a $10,000/month B2B copywriter writing a LinkedIn DM for Klivio.

TARGET:
- Name: ${profile.name || 'unknown'}
- Title hint: ${profile.titleHint || 'business owner/director'}
- Industry: ${industry}
- City: ${city}
- LinkedIn snippet: "${profile.snippet || 'no snippet available'}"

KLIVIO PRODUCT: AI voice receptionist — answers calls 24/7, books appointments, handles enquiries. For UK small businesses. £297-£997/month. Live in 48 hours.

WHAT WORKS FOR ${industry.toUpperCase()} BUSINESSES:
- They miss calls evenings/weekends (prime time for their customers)
- Paying a receptionist £22,000+/year when AI does it for £3,600/year
- Every missed call = £500-£5,000 in lost revenue depending on industry

WRITE: A LinkedIn DM that feels hand-written, not automated.

STRUCTURE (3 short paragraphs, 60-80 words MAX):
1. One specific observation about their business/role (from snippet or industry knowledge). NOT generic.
2. The pain + financial cost in one sentence. One natural social proof line ("other [industry] businesses in [city] have already...").
3. Soft CTA — "open to a 10-minute call to see if this would fit?" or similar.

HARD RULES:
- Sound like a real person, not marketing.
- No "I came across your profile", "I hope this message finds you well", "I wanted to reach out".
- No exclamation marks.
- No links.
- Address them by first name if available, otherwise just start with the observation.
- Contractions always.
- Do NOT sign off with anything — they can see who sent it on LinkedIn.

Output ONLY the DM body.`;

  return new Promise(resolve => {
    const payload = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.88,
    });
    const req = https.request({
      hostname: 'api.groq.com', path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 20000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          resolve((j.choices?.[0]?.message?.content || '').trim());
        } catch { resolve(''); }
      });
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
    req.write(payload);
    req.end();
  });
}

// ── Generate connection request note (300 char max for LinkedIn) ──
async function generateConnectionNote(profile, industry, city) {
  const firstName = (profile.name || '').split(' ')[0] || '';

  const prompt = `Write a LinkedIn connection request note for a ${industry} business owner in ${city}.

Context: You're from Klivio (AI phone receptionist for UK businesses). You want to connect before pitching.

Rules:
- MAX 280 characters — LinkedIn hard limit
- Sound genuine, not salesy
- Reference their industry specifically
- NO generic "I'd love to connect"
- End with a reason to connect (you follow the space, you work with similar businesses, etc.)
- First name: ${firstName || 'not known'}

Output only the connection note text.`;

  return new Promise(resolve => {
    const payload = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 100,
      temperature: 0.8,
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
          resolve((j.choices?.[0]?.message?.content || '').trim().slice(0, 295));
        } catch { resolve(''); }
      });
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
    req.write(payload);
    req.end();
  });
}

// ── Export to CSV ──
function exportCSV(leads) {
  const headers = ['Name', 'LinkedIn URL', 'Industry', 'City', 'Title Hint', 'Connection Note', 'DM Message', 'Follow-up 1', 'Status', 'Added'];
  const rows = leads.map(l => [
    l.name || '',
    l.url || '',
    l.industry || '',
    l.city || '',
    l.titleHint || '',
    `"${(l.connectionNote || '').replace(/"/g, '""')}"`,
    `"${(l.dm || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
    `"${(l.followup1 || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
    l.status || 'pending',
    l.addedAt || '',
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  fs.writeFileSync(CSV_FILE, csv, 'utf-8');
  return CSV_FILE;
}

// ── Follow-up DM templates ──
const FOLLOWUP_TEMPLATES = [
  (name, industry, city) =>
`${name ? name + ', just' : 'Just'} following up on my message from a few days ago.

Not sure if it landed — it was about how ${industry} businesses in ${city} are losing calls outside office hours.

Happy to show you in 10 minutes how we handle this. Worth a quick chat?`,

  (name, industry, city) =>
`${name ? name + ' —' : 'Quick'} one more from me and I'll leave you alone.

Other ${industry} practices in ${city} we've worked with typically recover 12-20 extra enquiries per month. That's the gap we fill.

Open to a 10-minute look?`,
];

// ── Main CLI ──
async function main() {
  const args = process.argv.slice(2);
  const cmd  = args[0];

  if (cmd === 'export') {
    const leads = loadLeads();
    const file  = exportCSV(leads);
    console.log(`\n✅ Exported ${leads.length} leads to: ${file}\n`);
    return;
  }

  if (cmd === 'stats') {
    const leads = loadLeads();
    const byStatus = leads.reduce((acc, l) => { acc[l.status || 'pending'] = (acc[l.status || 'pending'] || 0) + 1; return acc; }, {});
    console.log('\n── LinkedIn Pipeline ──');
    console.log(`Total: ${leads.length}`);
    Object.entries(byStatus).forEach(([s, n]) => console.log(`  ${s}: ${n}`));
    console.log('');
    return;
  }

  // generate "industry city" or "industry city count"
  const query   = args.slice(1).join(' ');
  const parts   = query.split(' ');
  const count   = parseInt(parts[parts.length - 1]) || 20;
  const hasCount = !isNaN(parseInt(parts[parts.length - 1]));
  const queryWords = hasCount ? parts.slice(0, -1) : parts;

  // Detect industry (first word) and city (rest)
  const industry = queryWords[0] || 'dental';
  const city     = queryWords.slice(1).join(' ') || 'London';

  console.log(`\n── LinkedIn Lead Generator ──`);
  console.log(`Industry: ${industry} | City: ${city} | Target: ${count} profiles\n`);

  if (!GROQ_API_KEY) {
    console.log('⚠️  GROQ_API_KEY not set — cannot generate messages.');
    return;
  }

  // 1. Find profiles
  process.stdout.write('Searching LinkedIn profiles via Google... ');
  const profiles = await searchLinkedInProfiles(industry, city, count);
  console.log(`found ${profiles.length}\n`);

  if (!profiles.length) {
    console.log('No profiles found. Try different industry/city.\n');
    return;
  }

  // 2. Load existing to avoid duplicates
  const existing = loadLeads();
  const existingUrls = new Set(existing.map(l => l.url));

  const newProfiles = profiles.filter(p => !existingUrls.has(p.url));
  console.log(`New profiles (not in DB): ${newProfiles.length}\n`);

  // 3. Generate messages for each
  const results = [];
  for (let i = 0; i < newProfiles.length; i++) {
    const profile = newProfiles[i];
    process.stdout.write(`[${i + 1}/${newProfiles.length}] ${profile.name || profile.url.split('/').pop()}... `);

    const [dm, connectionNote, followup1] = await Promise.all([
      generateLinkedInDM(profile, industry, city),
      generateConnectionNote(profile, industry, city),
      Promise.resolve(FOLLOWUP_TEMPLATES[i % FOLLOWUP_TEMPLATES.length]((profile.name || '').split(' ')[0], industry, city)),
    ]);

    const lead = {
      ...profile,
      industry,
      city,
      dm,
      connectionNote,
      followup1,
      status: 'pending',
      addedAt: new Date().toISOString(),
    };

    results.push(lead);
    console.log('✓');

    // Preview first message
    if (i === 0) {
      console.log('\n── FIRST MESSAGE PREVIEW ──────────────────────────────');
      console.log(`Profile: ${profile.url}`);
      console.log(`Name: ${profile.name || 'unknown'}`);
      console.log('\nCONNECTION NOTE:');
      console.log(connectionNote);
      console.log('\nDM:');
      console.log(dm);
      console.log('────────────────────────────────────────────────────────\n');
    }

    await new Promise(r => setTimeout(r, 1200));
  }

  // 4. Save
  const allLeads = [...existing, ...results];
  saveLeads(allLeads);

  // 5. Export CSV
  const csvFile = exportCSV(allLeads);

  console.log(`\n✅ Generated ${results.length} LinkedIn messages`);
  console.log(`📄 CSV exported to: ${csvFile}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Open the CSV and review the messages`);
  console.log(`  2. Import into Expandi/Dripify (£50-80/mo) for automation`);
  console.log(`  3. OR send manually: copy connection note → send request → wait 3 days → send DM`);
  console.log(`  4. Run follow-ups after 4-5 days: node leadgen/linkedin.js followup\n`);
}

module.exports = { generateLinkedInDM, generateConnectionNote, searchLinkedInProfiles, exportCSV };

if (require.main === module) {
  main().catch(err => { console.error('[FATAL]', err.message); process.exit(1); });
}
