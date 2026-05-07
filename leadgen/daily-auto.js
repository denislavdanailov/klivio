// ── Klivio Daily Automation ──
// Runs automatically via Windows Task Scheduler every morning at 8:00 AM
// 1. Scrapes new leads across industries/cities
// 2. Runs campaign (sends emails to all new leads)
// 3. Sends Telegram daily report
//
// Manual run: node leadgen/daily-auto.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { addLead, getLeadsSummary } = require('./scraper');
const { scrapeAllSources } = require('./sources');
const { runCampaign } = require('./campaign');
const { runFollowups } = require('./followup');

// Wrap sources.scrapeAllSources (returns array) → save to leads DB → return count
async function scrapeAndSave(industry, city) {
  const candidates = await scrapeAllSources(industry, city);
  let saved = 0;
  for (const lead of candidates) {
    if (addLead(lead)) saved++;
  }
  return saved;
}

// Rotating targets — cycles daily through physical + digital businesses
const TARGETS = [
  // ── Physical ──────────────────────────────────────────────
  { industry: 'dental',      city: 'London'       },
  { industry: 'dental',      city: 'Manchester'   },
  { industry: 'dental',      city: 'Birmingham'   },
  { industry: 'dental',      city: 'Leeds'        },
  { industry: 'dental',      city: 'Bristol'      },
  { industry: 'realestate',  city: 'London'       },
  { industry: 'realestate',  city: 'Manchester'   },
  { industry: 'realestate',  city: 'Birmingham'   },
  { industry: 'realestate',  city: 'Leeds'        },
  { industry: 'law',         city: 'London'       },
  { industry: 'law',         city: 'Manchester'   },
  { industry: 'law',         city: 'Leeds'        },
  { industry: 'accounting',  city: 'London'       },
  { industry: 'accounting',  city: 'Birmingham'   },
  { industry: 'fitness',     city: 'London'       },
  { industry: 'fitness',     city: 'Manchester'   },
  { industry: 'veterinary',  city: 'London'       },
  { industry: 'veterinary',  city: 'Manchester'   },
  { industry: 'trades',      city: 'London'       },
  { industry: 'cleaning',    city: 'London'       },
  { industry: 'restaurant',  city: 'London'       },
  { industry: 'restaurant',  city: 'Manchester'   },
  // ── Digital ───────────────────────────────────────────────
  { industry: 'digital-agency', city: 'London'    },
  { industry: 'digital-agency', city: 'Manchester'},
  { industry: 'digital-agency', city: 'Birmingham'},
  { industry: 'ecommerce',      city: 'London'    },
  { industry: 'ecommerce',      city: 'Manchester'},
  { industry: 'saas',           city: 'London'    },
  { industry: 'marketing',      city: 'London'    },
  { industry: 'marketing',      city: 'Manchester'},
  { industry: 'coaching',       city: 'London'    },
  { industry: 'recruitment',    city: 'London'    },
  { industry: 'recruitment',    city: 'Manchester'},
  { industry: 'insurance',      city: 'London'    },
  { industry: 'creative',       city: 'London'    },
];

// Pick 3 targets per day, rotating based on day-of-year
function getTodaysTargets() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const start = (dayOfYear * 3) % TARGETS.length;
  const targets = [];
  for (let i = 0; i < 3; i++) {
    targets.push(TARGETS[(start + i) % TARGETS.length]);
  }
  return targets;
}

async function scrapeTargets(targets) {
  let totalNew = 0;
  for (const t of targets) {
    console.log(`\n[SCRAPE] ${t.industry} / ${t.city}`);
    try {
      const n = await scrapeAndSave(t.industry, t.city);
      console.log(`  + ${n} new leads`);
      totalNew += n;
    } catch (err) {
      console.log(`  [ERROR] ${err.message}`);
    }
  }
  return totalNew;
}

async function sendTelegram(msg) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const https = require('https');
  const body = JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' });
  return new Promise(resolve => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => { res.resume(); resolve(); });
    req.on('error', resolve);
    req.write(body);
    req.end();
  });
}

async function main() {
  const startTime = Date.now();
  console.log('\n' + '═'.repeat(55));
  console.log('  KLIVIO DAILY AUTO — ' + new Date().toLocaleString('en-GB'));
  console.log('═'.repeat(55) + '\n');

  const targets = getTodaysTargets();
  console.log('[TODAY] Scraping:', targets.map(t => `${t.industry}/${t.city}`).join(', '));

  // 1. Scrape
  const newLeads = await scrapeTargets(targets);
  console.log(`\n[SCRAPE DONE] +${newLeads} new leads added`);

  // 2. Campaign — send to all new leads
  console.log('\n[CAMPAIGN] Sending emails to all new leads...');
  await runCampaign({ limit: 9999 });

  // 3. Follow-ups — Day 3, 7, 14 sequences
  console.log('\n[FOLLOWUPS] Running follow-up sequences...');
  await runFollowups({ dryRun: false });

  // 4. Report to Telegram
  const stats = getLeadsSummary();
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const msg = `*Klivio Daily Auto* ✅\n\n` +
    `Targets: ${targets.map(t => `${t.industry}/${t.city}`).join(', ')}\n` +
    `New leads scraped: *${newLeads}*\n` +
    `Total leads: ${stats.total} | Unsent: ${stats.newLeads}\n` +
    `Completed in ${elapsed}s`;

  await sendTelegram(msg);
  console.log('\n[DONE] Telegram report sent. Time: ' + elapsed + 's');
}

main().catch(err => {
  console.error('[FATAL]', err.message);
  sendTelegram(`*Klivio Daily Auto* ❌\nError: ${err.message}`).catch(() => {});
  process.exit(1);
});
