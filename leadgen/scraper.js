// ── Lead Scraper — finds businesses and extracts contact info ──
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');

// ── Helpers ──
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function loadLeads() {
  if (!fs.existsSync(LEADS_FILE)) return [];
  return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8'));
}

function saveLeads(leads) {
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
}

function addLead(lead) {
  const leads = loadLeads();
  // Dedupe by email
  if (lead.email && leads.some(l => l.email.toLowerCase() === lead.email.toLowerCase())) {
    return false;
  }
  leads.push({
    ...lead,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    addedAt: new Date().toISOString(),
    status: 'new', // new, sent, replied, unsubscribed, bounced
  });
  saveLeads(leads);
  return true;
}

// ── Import leads from CSV ──
// Format: name,email,business,industry,website
function importCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const header = lines[0].toLowerCase().split(',').map(h => h.trim());

  let imported = 0;
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
    const lead = {};
    header.forEach((h, idx) => { lead[h] = vals[idx] || ''; });

    // Ensure required fields
    if (!lead.email || !lead.email.includes('@')) {
      skipped++;
      continue;
    }

    lead.contactName = lead.name || lead.contact || '';
    lead.industry = lead.industry || 'generic';

    if (addLead(lead)) {
      imported++;
    } else {
      skipped++;
    }
  }

  return { imported, skipped };
}

// ── Junk email patterns to filter out ──
const JUNK_PATTERNS = [
  'example.com', 'wixpress', 'sentry.io', 'cloudflare', 'wordpress',
  'gravatar', 'schema.org', 'w3.org', 'googleapis', 'gstatic',
  '.png', '.jpg', '.svg', '.gif', '.css', '.js', '.webp',
  'noreply', 'no-reply', 'mailer-daemon', 'postmaster',
  'test@', 'admin@', 'webmaster@', 'root@',
];

function isValidEmail(email) {
  if (!email || !email.includes('@') || email.length < 6) return false;
  const lower = email.toLowerCase();
  return !JUNK_PATTERNS.some(p => lower.includes(p));
}

// ── Fetch a page safely ──
async function fetchPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// ── Extract emails from HTML ──
function extractEmailsFromHtml(html) {
  const $ = cheerio.load(html);
  const emails = new Set();

  // From mailto links
  $('a[href^="mailto:"]').each((_, el) => {
    const email = ($(el).attr('href') || '').replace('mailto:', '').split('?')[0].trim().toLowerCase();
    if (isValidEmail(email)) emails.add(email);
  });

  // From page text via regex
  const text = $.text() + ' ' + $.html();
  const found = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  found.forEach(e => { if (isValidEmail(e)) emails.add(e.toLowerCase()); });

  return Array.from(emails);
}

// ── Extract emails from a website (homepage + contact pages) ──
async function extractEmailsFromUrl(url) {
  try {
    // 1. Scrape homepage
    const html = await fetchPage(url);
    if (!html) return { emails: [], businessName: '', url, error: 'fetch failed' };

    const $ = cheerio.load(html);
    const emails = new Set(extractEmailsFromHtml(html));

    // Extract business name
    const title = $('title').text().trim();
    const businessName = $('meta[property="og:site_name"]').attr('content') ||
                         $('meta[property="og:title"]').attr('content') ||
                         title.split(/[|\-–—,]/).shift().trim();

    // 2. If no emails found, auto-discover contact/about pages
    if (emails.size === 0) {
      const base = new URL(url).origin;
      const contactPaths = ['/contact', '/contact-us', '/about', '/about-us', '/get-in-touch'];

      // Also look for contact links on the page
      $('a[href]').each((_, el) => {
        const href = ($(el).attr('href') || '').toLowerCase();
        if (href.includes('contact') || href.includes('about') || href.includes('get-in-touch')) {
          let full = href;
          if (full.startsWith('/')) full = base + full;
          else if (!full.startsWith('http')) full = base + '/' + full;
          if (full.startsWith('http')) contactPaths.push(full);
        }
      });

      // Dedupe and scrape contact pages
      const tried = new Set([url]);
      for (const p of [...new Set(contactPaths)].slice(0, 4)) {
        const contactUrl = p.startsWith('http') ? p : base + p;
        if (tried.has(contactUrl)) continue;
        tried.add(contactUrl);

        const contactHtml = await fetchPage(contactUrl);
        if (contactHtml) {
          extractEmailsFromHtml(contactHtml).forEach(e => emails.add(e));
          if (emails.size > 0) break; // Got what we need
        }
        await sleep(1000);
      }
    }

    return { emails: Array.from(emails), businessName: businessName || '', url };
  } catch (err) {
    return { emails: [], businessName: '', url, error: err.message };
  }
}

// ── Scrape a list of URLs for leads ──
async function scrapeUrls(urls, industry = 'generic') {
  const results = { found: 0, errors: 0 };

  for (const url of urls) {
    console.log(`Scraping: ${url}`);
    const data = await extractEmailsFromUrl(url);

    if (data.error) {
      console.log(`  ✗ Error: ${data.error}`);
      results.errors++;
    } else if (data.emails.length === 0) {
      console.log(`  - No emails found`);
    } else {
      for (const email of data.emails) {
        const added = addLead({
          email,
          business: data.businessName,
          website: url,
          industry,
          contactName: '',
          source: 'scraper',
        });
        if (added) {
          console.log(`  ✓ Found: ${email} (${data.businessName})`);
          results.found++;
        }
      }
    }

    // Rate limit: 2-5 seconds between requests
    await sleep(2000 + Math.random() * 3000);
  }

  return results;
}

// ── Google UK search scraper — most reliable free search for UK results ──
async function googleUkSearch(query, maxResults = 15) {
  const https = require('https');
  const q     = encodeURIComponent(query + ' site:co.uk OR site:.uk OR UK');
  const url   = `https://www.google.co.uk/search?q=${q}&num=20&hl=en-GB&gl=gb`;
  return new Promise(resolve => {
    https.get(url, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Referer':         'https://www.google.co.uk/',
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
          $('a[href]').each((_, el) => {
            let href = $(el).attr('href') || '';
            // Google wraps real URLs in /url?q=
            if (href.includes('/url?q=')) {
              try { href = decodeURIComponent(href.split('/url?q=')[1].split('&')[0]); } catch { return; }
            }
            if (!href.startsWith('http')) return;
            if (/google\.|bing\.com|facebook\.com|linkedin\.|twitter\.|youtube\.|wikipedia\.|\.gov\.uk|bbc\.co\.|yell\.com|yelp\.com|tripadvisor|checkatrade|trustpilot|companies-house/i.test(href)) return;
            if (seen.has(href)) return;
            seen.add(href);
            const title = $(el).find('h3').text().trim() || $(el).text().trim().slice(0, 80);
            if (title.length > 3) hits.push({ title, url: href, snippet: '' });
          });
          resolve(hits.slice(0, maxResults));
        } catch { resolve([]); }
      });
      res.on('error', () => resolve([]));
    }).on('error', () => resolve([]));
  });
}

// ── Bing UK search scraper — fallback ──
async function bingSearch(query, maxResults = 15) {
  const https = require('https');
  const q     = encodeURIComponent(query);
  const url   = `https://www.bing.com/search?q=${q}&mkt=en-GB&cc=GB&setlang=en-GB&count=20&first=1`;
  return new Promise((resolve) => {
    const req = https.request(url, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Cache-Control':   'no-cache',
        'Referer':         'https://www.bing.com/',
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
          // Primary selector: h2 a links (direct result URLs in modern Bing)
          $('h2 a[href]').each((_, el) => {
            const href = $(el).attr('href') || '';
            if (!href.startsWith('http')) return;
            if (/bing\.com|microsoft\.|facebook\.com|linkedin\.|twitter\.|youtube\.|wikipedia\.|gov\.uk|yell\.com|tripadvisor|checkatrade/i.test(href)) return;
            if (seen.has(href)) return;
            seen.add(href);
            hits.push({ title: $(el).text().trim(), url: href, snippet: '' });
          });
          // Fallback: cite elements
          if (hits.length === 0) {
            $('cite').each((_, el) => {
              const raw    = $(el).text().trim();
              const domain = raw.split('›')[0].trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
              const href   = domain ? `https://${domain}` : '';
              if (href && !seen.has(href) && !href.includes('bing.com') && !href.includes('microsoft')) {
                seen.add(href);
                hits.push({ title: domain, url: href, snippet: '' });
              }
            });
          }
          resolve(hits.slice(0, maxResults));
        } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.setTimeout(15000, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

// ── scrapeYell → replaced with Google UK + Bing multi-query finder ──
async function scrapeYell(category, location, pages = 3) {
  const results = [];
  const seen    = new Set();

  const queries = [
    `${category} ${location} UK email contact`,
    `${category} ${location} "info@" OR "enquiries@" OR "hello@"`,
    `"${category}" "${location}" site:co.uk contact`,
  ];

  const SKIP = /yell\.com|checkatrade|yelp|tripadvisor|facebook\.com|linkedin\.com|google\.|wikipedia|trustpilot|companies-house/i;

  for (const q of queries.slice(0, pages)) {
    // Try Google UK first (better UK targeting)
    console.log(`  Google UK: "${q}"`);
    let hits = await googleUkSearch(q, 12);
    console.log(`  → ${hits.length} Google results`);

    // Bing fallback if Google gave fewer than 3
    if (hits.length < 3) {
      console.log(`  Bing fallback: "${q}"`);
      const bingHits = await bingSearch(q, 12);
      console.log(`  → ${bingHits.length} Bing results`);
      const bingSeen = new Set(hits.map(h => h.url));
      for (const h of bingHits) { if (!bingSeen.has(h.url)) hits.push(h); }
    }

    for (const h of hits) {
      if (seen.has(h.url)) continue;
      if (SKIP.test(h.url)) continue;
      seen.add(h.url);
      const name = h.title.split(/[|\-–—]/)[0].trim();
      if (name.length > 3) results.push({ name, website: h.url, phone: '' });
    }
    await sleep(2000 + Math.random() * 2000);
  }

  return results;
}

// ── Scrape business websites from a list of URLs in a file ──
async function scrapeUrlFile(filePath, industry = 'generic') {
  const content = fs.readFileSync(filePath, 'utf-8');
  const urls = content.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));
  console.log(`Loaded ${urls.length} URLs from ${filePath}`);
  return await scrapeUrls(urls, industry);
}

// ── Combined search: tries Yell directory then scrapes websites ──
async function searchWeb(query, numResults = 30) {
  // Parse query to extract category and location
  const parts = query.split(' ');
  const locationIdx = parts.findIndex(p => /^[A-Z]/.test(p) && parts.indexOf(p) > 0);
  const category = parts.slice(0, locationIdx > 0 ? locationIdx : parts.length).join(' ');
  const location = locationIdx > 0 ? parts.slice(locationIdx).join(' ') : 'London';

  console.log(`Searching Yell.com: "${category}" in "${location}"`);
  const yellResults = await scrapeYell(category, location, 3);

  // Extract websites to scrape
  const urls = yellResults
    .filter(r => r.website)
    .map(r => r.website);

  console.log(`Found ${yellResults.length} businesses, ${urls.length} with websites`);
  return urls.slice(0, numResults);
}

// ── Full pipeline: search → scrape → save leads ──
async function findLeads(query, industry = 'generic', numResults = 20) {
  console.log(`\nSearching: "${query}"`);
  console.log('─'.repeat(50));

  const urls = await searchWeb(query, numResults);
  console.log(`Found ${urls.length} websites to scrape\n`);

  if (urls.length === 0) {
    console.log('No results found. Try a different query.');
    return { found: 0 };
  }

  const results = await scrapeUrls(urls, industry);
  console.log(`\nDone: ${results.found} leads found, ${results.errors} errors`);
  return results;
}

// ── Get leads summary ──
function getLeadsSummary() {
  const leads = loadLeads();
  const byStatus = {};
  const byIndustry = {};

  for (const lead of leads) {
    byStatus[lead.status] = (byStatus[lead.status] || 0) + 1;
    byIndustry[lead.industry] = (byIndustry[lead.industry] || 0) + 1;
  }

  return {
    total: leads.length,
    byStatus,
    byIndustry,
    newLeads: leads.filter(l => l.status === 'new').length,
  };
}

module.exports = {
  loadLeads, saveLeads, addLead, importCSV,
  extractEmailsFromUrl, scrapeUrls, searchWeb, findLeads,
  scrapeYell, scrapeUrlFile, getLeadsSummary,
};
