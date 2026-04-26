// ── Klivio Lead Finder v5 ── Parallel OSM/Overpass Edition ──
// Free, no API keys, parallel scraping for speed
//
// node leadgen/finder.js bulk              → runs all UK cities/industries
// node leadgen/finder.js <city> <industry> → single search
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const https   = require('https');
const http    = require('http');
const cheerio = require('cheerio');
const fs      = require('fs');
const path    = require('path');

const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');

const JUNK = [
  'noreply','no-reply','donotreply','test@','privacy@','info@google',
  'example.com','sentry.io','wixpress','wordpress.com','cloudflare',
  'support@microsoft','support@apple','amazonaws','schema.org','w3.org',
  'jquery','postmaster','mailer-daemon','abuse@','spam@','webmaster@',
  'hostmaster@','domain.com','yourdomain','youremail','email@email',
  'name@example','user@example','contact@contact','info@info','hello@hello',
  'admin@admin','data@','cookie@','gdpr@','godaddy','wix.com',
  'squarespace','sentry-next','googleanalytics','fontawesome','bootstrap',
  '.png','.jpg','.gif','.svg','@2x','@3x','@sentry','@font-face',
  '.wp.com', 'gravatar', 'placeholder', 'loremipsum',
];

function loadLeads()  { try { return JSON.parse(fs.readFileSync(LEADS_FILE,'utf-8')); } catch { return []; } }
function saveLeads(l) { fs.writeFileSync(LEADS_FILE, JSON.stringify(l,null,2)); }

function isValidEmail(e) {
  if (!e || e.length > 80 || !e.includes('@')) return false;
  if (JUNK.some(j => e.toLowerCase().includes(j))) return false;
  const [local, domain] = e.split('@');
  if (!domain || !domain.includes('.') || local.length < 2) return false;
  const tld = domain.split('.').pop();
  if (tld.length > 6 || tld.length < 2) return false;
  // Filter out image filenames pretending to be emails
  if (/\.(png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot)$/i.test(e)) return false;
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6}$/.test(e);
}

function extractEmails(text) {
  const decoded = text
    .replace(/&#64;/g,'@')
    .replace(/\[at\]/gi,'@')
    .replace(/\(at\)/gi,'@')
    .replace(/ at /gi, '@')
    .replace(/\s*\[dot\]\s*/gi,'.')
    .replace(/\s*\(dot\)\s*/gi,'.');
  const raw = decoded.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6}/g) || [];
  return [...new Set(raw.map(e => e.toLowerCase()))].filter(isValidEmail);
}

function alreadyExists(leads, email) {
  return leads.some(l => l.email.toLowerCase() === email.toLowerCase());
}

function addLead(leads, data) {
  if (!isValidEmail(data.email)) return false;
  if (alreadyExists(leads, data.email)) return false;
  leads.push({
    id:          Date.now().toString(36) + Math.random().toString(36).slice(2,6),
    email:       data.email.toLowerCase().trim(),
    business:    data.business || '',
    website:     data.website  || '',
    industry:    data.industry || 'generic',
    city:        data.city     || '',
    contactName: data.contactName || '',
    source:      data.source || 'osm',
    status:      'new',
    addedAt:     new Date().toISOString(),
  });
  return true;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── HTTP fetch with redirect following ──
function fetch(url, timeout = 12000) {
  return new Promise(resolve => {
    let redirects = 0;
    function go(u) {
      const mod = u.startsWith('https') ? https : http;
      const t = setTimeout(() => resolve(null), timeout);
      try {
        const req = mod.get(u, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-GB,en;q=0.9',
          },
        }, res => {
          if ([301,302,307,308].includes(res.statusCode) && res.headers.location && redirects < 5) {
            clearTimeout(t);
            redirects++;
            try {
              const next = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, u).href;
              go(next);
            } catch { resolve(null); }
            return;
          }
          let data = '';
          res.setEncoding('utf-8');
          res.on('data', d => { data += d; if (data.length > 400000) res.destroy(); });
          res.on('end', () => { clearTimeout(t); resolve({ status: res.statusCode, body: data, url: u }); });
          res.on('error', () => { clearTimeout(t); resolve(null); });
        });
        req.on('error', () => { clearTimeout(t); resolve(null); });
        req.setTimeout(timeout, () => { req.destroy(); resolve(null); });
      } catch { clearTimeout(t); resolve(null); }
    }
    go(url);
  });
}

// ── Scrape a business website for emails ──
async function scrapeWebsite(url, business, industry, city, leads) {
  try {
    const r = await fetch(url, 10000);
    if (!r || r.status >= 400) return 0;

    let found = 0;
    const $ = cheerio.load(r.body);

    // Find contact/about page links
    const contactLinks = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (/contact|about|team|reach|email|enquir|get.?in.?touch|find.?us|connect/i.test(href)) {
        try {
          const full = href.startsWith('http') ? href : new URL(href, url).href;
          if (new URL(full).hostname === new URL(url).hostname) contactLinks.push(full);
        } catch {}
      }
    });

    const pages = [r.body];
    for (const cl of [...new Set(contactLinks)].slice(0, 2)) {
      const cr = await fetch(cl, 7000);
      if (cr && cr.status < 400) pages.push(cr.body);
    }

    // Also check mailto: links (very reliable)
    $('a[href^="mailto:"]').each((_, el) => {
      const mail = ($(el).attr('href') || '').replace(/^mailto:/i, '').split('?')[0].trim();
      if (isValidEmail(mail) && addLead(leads, { email: mail, business, website: url, industry, city, source: 'mailto' })) found++;
    });

    for (const html of pages) {
      for (const email of extractEmails(html)) {
        if (addLead(leads, { email, business, website: url, industry, city, source: 'website' })) found++;
      }
    }
    return found;
  } catch { return 0; }
}

// ── UK City bounding boxes [south, west, north, east] ──
const CITIES = {
  london:       [51.28, -0.489, 51.686, 0.236],
  manchester:   [53.35, -2.33,  53.55,  -2.11],
  birmingham:   [52.38, -1.99,  52.57,  -1.73],
  leeds:        [53.73, -1.67,  53.86,  -1.47],
  glasgow:      [55.78, -4.37,  55.93,  -4.13],
  bristol:      [51.39, -2.66,  51.52,  -2.51],
  edinburgh:    [55.88, -3.35,  55.99,  -3.11],
  liverpool:    [53.34, -3.02,  53.46,  -2.86],
  sheffield:    [53.32, -1.58,  53.43,  -1.42],
  cardiff:      [51.44, -3.25,  51.53,  -3.13],
  nottingham:   [52.87, -1.26,  52.99,  -1.10],
  coventry:     [52.38, -1.57,  52.47,  -1.45],
  leicester:    [52.57, -1.18,  52.67,  -1.07],
  newcastle:    [54.94, -1.72,  55.02,  -1.55],
  brighton:     [50.79, -0.19,  50.87,  -0.05],
  // Expanded: more mid-size cities = less competition
  southampton:  [50.88, -1.47,  50.95,  -1.34],
  portsmouth:   [50.78, -1.12,  50.84,  -1.02],
  oxford:       [51.71, -1.29,  51.78,  -1.18],
  cambridge:    [52.17, 0.08,   52.23,  0.18],
  reading:      [51.41, -1.02,  51.48,  -0.93],
  york:         [53.93, -1.12,  54.00,  -1.03],
  bath:         [51.36, -2.41,  51.41,  -2.31],
  plymouth:     [50.35, -4.19,  50.42,  -4.07],
  aberdeen:     [57.12, -2.17,  57.19,  -2.06],
  belfast:      [54.55, -6.00,  54.64,  -5.84],
  swansea:      [51.58, -4.00,  51.66,  -3.89],
  hull:         [53.71, -0.40,  53.80,  -0.28],
  milton_keynes:[51.98, -0.83,  52.08,  -0.69],
  stokeontrent: [52.96, -2.23,  53.07,  -2.10],
  derby:        [52.87, -1.51,  52.96,  -1.41],
  wolverhampton:[52.55, -2.22,  52.62,  -2.08],
};

// ── OSM amenity/shop tags by industry ──
const INDUSTRY_TAGS = {
  dental:      ['[amenity=dentist]'],
  law:         ['[office=lawyer]','[office=solicitor]','[office=legal_services]'],
  accounting:  ['[office=accountant]','[office=tax_advisor]','[office=financial]'],
  fitness:     ['[leisure=fitness_centre]','[leisure=sports_centre]','[leisure=gym]'],
  restaurant:  ['[amenity=restaurant]','[amenity=cafe]'],
  beauty:      ['[shop=beauty]','[shop=hairdresser]','[amenity=beauty]','[shop=cosmetics]'],
  medical:     ['[amenity=clinic]','[amenity=doctors]','[healthcare=doctor]','[amenity=physiotherapist]'],
  automotive:  ['[shop=car_repair]','[shop=tyres]','[shop=car]','[craft=car_repair]'],
  realestate:  ['[office=estate_agent]','[office=property_management]'],
  education:   ['[amenity=kindergarten]','[office=tutoring]','[amenity=language_school]','[amenity=driving_school]'],
  pharmacy:    ['[amenity=pharmacy]'],
  optician:    ['[shop=optician]'],
  hotel:       ['[tourism=hotel]','[tourism=guest_house]','[tourism=bed_and_breakfast]'],
  cleaning:    ['[shop=dry_cleaning]','[office=cleaning]','[craft=cleaning]'],
  veterinary:  ['[amenity=veterinary]'],
  taxi:        ['[amenity=taxi]'],
  insurance:   ['[office=insurance]'],
  recruitment: ['[office=employment_agency]'],
  travel:      ['[shop=travel_agency]','[office=travel_agent]'],
  photography: ['[shop=photo]','[craft=photographer]'],
  wedding:     ['[shop=wedding]'],
  // Trades — craft tags
  trades:      ['[craft=plumber]','[craft=electrician]','[craft=builder]','[craft=carpenter]','[craft=painter]','[craft=roofer]','[craft=glazier]'],
  plumber:     ['[craft=plumber]'],
  electrician: ['[craft=electrician]'],
  builder:     ['[craft=builder]','[craft=construction]'],
  // IT / tech support
  it:          ['[office=it]','[office=technology]','[craft=computer_repair]'],
};

const OVERPASS_SERVERS = [
  'overpass-api.de',
  'lz4.overpass-api.de',
  'z.overpass-api.de',
  'overpass.kumi.systems',
];

// ── Query Overpass API with retry ──
async function queryOverpass(bbox, tag, limit = 150) {
  const [s, w, n, e] = bbox;
  const query = `[out:json][timeout:25];
(
  node${tag}(${s},${w},${n},${e});
  way${tag}(${s},${w},${n},${e});
);
out center ${limit};`;

  const encoded = 'data=' + encodeURIComponent(query);

  for (const host of OVERPASS_SERVERS) {
    const result = await new Promise(resolve => {
      const t = setTimeout(() => resolve(null), 30000);
      const req = https.request({
        hostname: host,
        path:     '/api/interpreter',
        method:   'POST',
        headers: {
          'User-Agent':     'Klivio/1.0 (contact@klivio.bond)',
          'Accept':         'application/json',
          'Content-Type':   'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(encoded),
        },
      }, res => {
        clearTimeout(t);
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) { resolve(null); return; }
            const j = JSON.parse(d);
            resolve(j.elements || []);
          } catch { resolve(null); }
        });
        res.on('error', () => resolve(null));
      });
      req.on('error', () => { clearTimeout(t); resolve(null); });
      req.write(encoded);
      req.end();
    });

    if (result !== null) return result;
    await sleep(1500);
  }
  return [];
}

// ── Parallel task runner with concurrency limit ──
async function parallelMap(items, concurrency, worker) {
  const results = new Array(items.length);
  let idx = 0;
  const runners = new Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
    while (idx < items.length) {
      const i = idx++;
      try { results[i] = await worker(items[i], i); }
      catch { results[i] = null; }
    }
  });
  await Promise.all(runners);
  return results;
}

// ── Process OSM elements → add leads (PARALLEL) ──
async function processOsmElements(elements, industry, city, leads, concurrency = 6) {
  let direct = 0, scraped = 0, done = 0;
  const total = elements.length;

  await parallelMap(elements, concurrency, async (el) => {
    const tags = el.tags || {};
    const name = tags.name || tags['name:en'] || '';
    const email = tags.email || tags['contact:email'] || '';
    const website = tags.website || tags['contact:website'] || tags.url || '';

    // Direct email from OSM
    if (email && isValidEmail(email)) {
      if (addLead(leads, { email, business: name, website, industry, city, source: 'osm' })) {
        direct++;
        process.stdout.write(`📧`);
      }
    } else if (website) {
      try {
        const n = await scrapeWebsite(website, name, industry, city, leads);
        if (n > 0) { scraped += n; process.stdout.write(`.`); }
      } catch {}
    }
    done++;
    if (done % 20 === 0) {
      // Save progress periodically
      saveLeads(leads);
    }
  });

  return { direct, scraped };
}

// ── Google UK search for businesses — fallback when OSM has no data ──
async function googleUkSearch(industry, city, maxResults = 15) {
  const queries = [
    `${industry} ${city} UK email contact`,
    `"${industry}" "${city}" site:co.uk OR site:.uk email`,
    `${industry} ${city} England "info@" OR "enquiries@" OR "hello@"`,
  ];

  const allHits = [];
  const seen = new Set();

  for (const q of queries) {
    await new Promise(resolve => {
      const url = `https://www.google.co.uk/search?q=${encodeURIComponent(q)}&num=20&hl=en-GB&gl=gb`;
      https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-GB,en;q=0.9',
          'Accept-Encoding': 'identity',
          'Referer': 'https://www.google.co.uk/',
        },
      }, res => {
        let d = '';
        res.setEncoding('utf-8');
        res.on('data', c => d += c);
        res.on('end', () => {
          try {
            const $ = cheerio.load(d);
            // Google result links are in <div class="g"> → <a href>
            $('div.g a[href], div[data-sokoban-container] a[href], a[href*="http"]').each((_, el) => {
              const href = $(el).attr('href') || '';
              // Extract actual URL (Google wraps in /url?q=...)
              let url2 = href;
              if (href.includes('/url?q=')) {
                try { url2 = decodeURIComponent(href.split('/url?q=')[1].split('&')[0]); } catch {}
              }
              if (!url2.startsWith('http')) return;
              if (/google\.|bing\.com|facebook\.com|linkedin\.com|twitter\.|youtube\.|wikipedia\.|gov\.uk|bbc\.co\.|yell\.com|yelp\.com|tripadvisor|checkatrade|trustpilot|companies|companies-house/i.test(url2)) return;
              if (seen.has(url2)) return;
              // Only .co.uk or .uk domains for UK focus
              const title = $(el).find('h3').text().trim() || $(el).text().trim().slice(0, 80);
              if (title.length < 3) return;
              seen.add(url2);
              allHits.push({ title, url: url2 });
            });
          } catch {}
          resolve();
        });
        res.on('error', () => resolve());
      }).on('error', () => resolve());
    });
    await sleep(2000 + Math.random() * 2000);
    if (allHits.length >= maxResults) break;
  }

  return allHits.slice(0, maxResults);
}

// ── Bing UK search fallback ──
async function bingUkSearch(industry, city, maxResults = 15) {
  const q = encodeURIComponent(`${industry} ${city} UK contact email`);
  const url = `https://www.bing.com/search?q=${q}&mkt=en-GB&cc=GB&setlang=en-GB&count=20&first=1`;

  return new Promise(resolve => {
    const req = https.request(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache',
        'Referer': 'https://www.bing.com/',
      },
    }, res => {
      let d = '';
      res.setEncoding('utf-8');
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const $ = cheerio.load(d);
          const hits = [];
          const seen = new Set();

          // Primary: h2 links in result items
          $('h2 a[href]').each((_, el) => {
            const href = $(el).attr('href') || '';
            if (!href.startsWith('http')) return;
            if (/bing\.com|microsoft\.|facebook\.com|linkedin\.com|twitter\.|youtube\.|wikipedia\.|gov\.uk|yell\.com|yelp\.com|tripadvisor|checkatrade|trustpilot/i.test(href)) return;
            if (seen.has(href)) return;
            seen.add(href);
            const title = $(el).text().trim();
            if (title.length > 3) hits.push({ title, url: href });
          });

          // Fallback: cite elements if h2 gave nothing
          if (hits.length === 0) {
            $('cite').each((_, el) => {
              const raw = $(el).text().trim();
              const domain = raw.split('›')[0].trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
              if (domain && domain.includes('.') && !domain.includes('bing') && !domain.includes('microsoft')) {
                const url2 = `https://${domain}`;
                if (!seen.has(url2)) { seen.add(url2); hits.push({ title: domain, url: url2 }); }
              }
            });
          }

          resolve(hits.slice(0, maxResults));
        } catch { resolve([]); }
      });
      res.on('error', () => resolve([]));
    });
    req.on('error', () => resolve([]));
    req.setTimeout(15000, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

// ── Web search → scrape emails (Google UK first, Bing fallback) ──
async function webSearchFindLeads(industry, city, leads, maxUrls = 12) {
  process.stdout.write(`  → Google UK "${industry} ${city}"... `);
  let hits = await googleUkSearch(industry, city, maxUrls);

  if (hits.length < 3) {
    process.stdout.write(`(${hits.length} Google, trying Bing)... `);
    const bingHits = await bingUkSearch(industry, city, maxUrls);
    // Merge, dedupe
    const seen = new Set(hits.map(h => h.url));
    for (const h of bingHits) { if (!seen.has(h.url)) { seen.add(h.url); hits.push(h); } }
  }

  process.stdout.write(`${hits.length} URLs found, scraping...`);
  let added = 0;
  for (const hit of hits.slice(0, maxUrls)) {
    try {
      const n = await scrapeWebsite(hit.url, hit.title, industry, city, leads);
      if (n > 0) { added += n; process.stdout.write(`.`); }
    } catch {}
    await sleep(1500);
  }
  console.log(` → +${added} web-search leads`);
  saveLeads(leads);
  return added;
}

// ── Find leads for one city + industry ──
async function findLeads(city, industry, limit = 200) {
  const leads = loadLeads();
  const before = leads.length;
  const bbox = CITIES[city.toLowerCase()];

  if (!bbox) {
    console.log(`  ❌ Unknown city: ${city}`);
    return 0;
  }

  const tags = INDUSTRY_TAGS[industry] || [`[amenity=${industry}]`];
  let osmAdded = 0;

  for (const tag of tags) {
    process.stdout.write(`  → OSM ${city}/${industry}${tag}... `);
    const elements = await queryOverpass(bbox, tag, limit);
    const withData = elements.filter(e => e.tags && (e.tags.email || e.tags['contact:email'] || e.tags.website || e.tags['contact:website']));
    process.stdout.write(`${elements.length} total, ${withData.length} with data `);
    const { direct, scraped } = await processOsmElements(withData, industry, city, leads);
    console.log(` → +${direct} direct, +${scraped} scraped`);
    osmAdded += direct + scraped;
    saveLeads(leads);
    await sleep(2000);
  }

  // Web search fallback: if OSM found fewer than 3 leads, search Google/Bing
  if (osmAdded < 3) {
    await webSearchFindLeads(industry, city, leads, 12);
  }

  return leads.length - before;
}

// ── BULK CONFIG ── (expanded to ~80 tasks for much more reach)
function buildBulkTasks() {
  const tasks = [];
  const highValue = ['dental','law','accounting','medical','realestate','hotel','veterinary'];
  const mediumValue = ['fitness','beauty','restaurant','automotive','optician','pharmacy'];
  const majorCities = ['london','manchester','birmingham','leeds','glasgow','bristol','edinburgh','liverpool'];
  const midCities = ['sheffield','cardiff','nottingham','coventry','leicester','newcastle','brighton','southampton','oxford','cambridge','reading','york','bath','plymouth','aberdeen','belfast','swansea','hull','milton_keynes','stokeontrent','derby','wolverhampton'];

  // High-value industries across major cities
  for (const ind of highValue) {
    for (const city of majorCities) tasks.push({ city, industry: ind });
  }
  // Medium-value across major cities
  for (const ind of mediumValue) {
    for (const city of majorCities.slice(0, 4)) tasks.push({ city, industry: ind });
  }
  // High-value in mid cities (less competition)
  for (const ind of ['dental','law','accounting','realestate']) {
    for (const city of midCities.slice(0, 10)) tasks.push({ city, industry: ind });
  }

  return tasks;
}

const BULK_TASKS = buildBulkTasks();

// ── Bulk run ──
async function bulkFind() {
  const startLeads = loadLeads().length;
  console.log(`\n🚀 Klivio Lead Finder v5 (Parallel)`);
  console.log(`   Source: OpenStreetMap Overpass API`);
  console.log(`   Tasks: ${BULK_TASKS.length} | Starting from ${startLeads} leads\n`);

  let totalAdded = 0;
  for (let i = 0; i < BULK_TASKS.length; i++) {
    const { city, industry } = BULK_TASKS[i];
    process.stdout.write(`[${i+1}/${BULK_TASKS.length}] ${city}/${industry}:`);
    try {
      const n = await findLeads(city, industry, 200);
      totalAdded += n;
      if (n > 0) console.log(`  ✅ +${n} (running total: +${totalAdded})`);
    } catch (e) {
      console.log(`  ❌ ${e.message}`);
    }
    await sleep(2000);
  }

  const finalLeads = loadLeads().length;
  console.log(`\n${'═'.repeat(55)}`);
  console.log(`  🎯 BULK COMPLETE`);
  console.log(`  Started: ${startLeads} | Final: ${finalLeads} | Added: ${finalLeads - startLeads}`);
  console.log('═'.repeat(55));
}

module.exports = { findLeads, bulkFind, scrapeWebsite, CITIES, INDUSTRY_TAGS };

// CLI
if (require.main === module) {
  const [,, city, industry] = process.argv;
  if (!city || city === 'bulk') {
    bulkFind().catch(console.error);
  } else {
    findLeads(city, industry || 'dental', 200)
      .then(n => console.log(`Added ${n} leads`))
      .catch(console.error);
  }
}
