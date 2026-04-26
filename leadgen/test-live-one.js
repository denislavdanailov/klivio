// ── Live One-Shot Test ──
// Намира 1 реален UK бизнес → анализира → пише имейл → праща НА ТЕБ
// node leadgen/test-live-one.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { scrapeYell, extractEmailsFromUrl } = require('./scraper');
const { analyzeWebsite }   = require('./analyzer');
const { generateEmail }    = require('./personalizer');
const { sendFromAccount }  = require('./sender');
const { ACTIVE_ACCOUNTS }  = require('./accounts');

const REDIRECT_TO = 'danailovd48@gmail.com';   // → на теб вместо на lead-а
const QUERIES     = [
  { category: 'dental practices', location: 'Manchester', industry: 'dental'     },
  { category: 'solicitors',       location: 'Birmingham', industry: 'law'        },
  { category: 'plumbers',         location: 'Leeds',      industry: 'trades'     },
  { category: 'estate agents',    location: 'Bristol',    industry: 'realestate' },
];

const LINE = '═'.repeat(62);

async function run() {
  console.log('\n' + LINE);
  console.log('  KLIVIO — LIVE ONE-SHOT TEST');
  console.log('  Реален lead → реален имейл → изпращане НА ТЕБ');
  console.log(LINE);

  // 1. Try each query until we find a lead with email
  let lead = null;
  for (const q of QUERIES) {
    console.log(`\n🔍 Scraping Yell: "${q.category}" in ${q.location}...`);
    let results;
    try { results = await scrapeYell(q.category, q.location, 1); }
    catch (e) { console.log(`  Yell error: ${e.message}`); continue; }

    console.log(`  Found ${results.length} businesses`);

    for (const biz of results) {
      if (!biz.website) { console.log(`  - ${biz.name}: no website`); continue; }
      console.log(`  ✓ Trying: ${biz.name} (${biz.website})`);

      let emails;
      try {
        const data = await extractEmailsFromUrl(biz.website);
        emails = data.emails;
      } catch (e) { console.log(`    scrape error: ${e.message}`); continue; }

      if (emails.length === 0) { console.log(`    no email found`); continue; }

      lead = {
        business:    biz.name,
        email:       emails[0],
        website:     biz.website,
        industry:    q.industry,
        city:        q.location,
        contactName: '',
        phone:       biz.phone || '',
      };
      console.log(`\n  ✅ Lead found: ${biz.name} <${emails[0]}>`);
      break;
    }
    if (lead) break;
  }

  if (!lead) {
    // Fallback: use a real UK SMB website we know has email
    console.log('\n⚠️  Yell scrape returned no emails. Using known fallback lead...');
    lead = {
      business:    'City Dental Practice',
      email:       'info@citydental.co.uk',
      website:     'https://www.portsmouthdentist.co.uk',
      industry:    'dental',
      city:        'Portsmouth',
      contactName: '',
    };
  }

  console.log('\n' + LINE);
  console.log(`  LEAD: ${lead.business}`);
  console.log(`  REAL EMAIL WOULD GO TO: ${lead.email}`);
  console.log(`  REDIRECTING TO: ${REDIRECT_TO}`);
  console.log(LINE);

  // 2. Analyze website
  console.log('\n🔍 Analyzing website...');
  let analysis;
  try {
    analysis = await analyzeWebsite(lead.website, lead.industry);
    console.log(`  Source   : ${analysis.found ? 'website scraped ✅' : 'industry fallback ⚡'}`);
    console.log(`  Weakness : ${analysis.weakness}`);
    console.log(`  Product  : ${analysis.productName} (${analysis.productPrice})`);
    if (analysis.context?.tagline) console.log(`  Tagline  : "${analysis.context.tagline}"`);
  } catch (e) {
    console.log(`  Analyzer error: ${e.message} — using fallback`);
    analysis = { weakness: 'no live chat or instant response visible on the site', productName: 'AI Lead Responder', productPrice: '£197/mo', found: false, context: {} };
  }

  // 3. Generate email
  console.log('\n✍️  Generating personalised email...');
  const senderName = 'James';
  const { subject, body, source } = await generateEmail({
    business:       lead.business,
    contactName:    lead.contactName,
    industry:       lead.industry,
    city:           lead.city,
    website:        lead.website,
    weakness:       analysis.weakness,
    productName:    analysis.productName,
    productPrice:   analysis.productPrice,
    senderName,
    websiteContext: analysis.context || {},
  });
  console.log(`  Source: ${source === 'groq' ? '✅ Groq AI' : '📋 fallback template'}`);

  // 4. Print preview
  console.log('\n' + LINE);
  console.log('  EMAIL PREVIEW');
  console.log(LINE);
  console.log(`  FROM    : James @ Klivio <james@klivio.bond>`);
  console.log(`  TO      : ${lead.email}  (→ redirected to ${REDIRECT_TO})`);
  console.log(`  SUBJECT : ${subject}`);
  console.log('');
  body.split('\n').forEach(l => console.log(`  ${l}`));
  console.log('\n' + LINE);

  // 5. Send to redirect address with wrapper
  console.log(`\n📨 Sending to ${REDIRECT_TO}...`);
  const account = ACTIVE_ACCOUNTS[0];

  const wrappedSubject = `[KLIVIO TEST] ${subject}`;
  const wrappedBody =
`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 KLIVIO LIVE TEST — пълен pipeline
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 РЕАЛЕН LEAD: ${lead.business}
 Уебсайт:     ${lead.website}
 Индустрия:   ${lead.industry} | Град: ${lead.city}
 Реален имейл: ${lead.email}

 АНАЛИЗ:
 Weakness : ${analysis.weakness}
 Product  : ${analysis.productName} (${analysis.productPrice})
 Source   : ${analysis.found ? 'website scraped' : 'industry fallback'}
${analysis.context?.tagline ? ' Tagline  : "' + analysis.context.tagline + '"' : ''}

 EMAIL SOURCE: ${source}
 ACCOUNT: ${account.name} <${account.email}> (${account.provider})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SUBJECT: ${subject}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${body}`;

  const result = await sendFromAccount(account, REDIRECT_TO, wrappedSubject, wrappedBody);

  if (result.ok) {
    console.log(`\n✅ ИЗПРАТЕНО! Провери ${REDIRECT_TO}`);
    console.log(`   Subject: ${wrappedSubject}`);
  } else {
    console.log(`\n❌ Send failed: ${result.reason}`);
  }

  console.log('\n' + LINE);
  console.log('  DONE');
  console.log(LINE + '\n');
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
