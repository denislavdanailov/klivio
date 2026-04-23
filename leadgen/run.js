#!/usr/bin/env node
// ── Klivio Lead Generation System — CLI ──
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { sendBatch, getTodayStats } = require('./sender');
const { loadLeads, saveLeads, importCSV, findLeads, scrapeUrlFile, scrapeYell, addLead, extractEmailsFromUrl, getLeadsSummary } = require('./scraper');

const command = process.argv[2];
const args = process.argv.slice(3);

function printHelp() {
  console.log(`
╔══════════════════════════════════════════════════╗
║         KLIVIO LEAD GENERATION SYSTEM            ║
║    19 accounts × 250/day = 4,750 emails/day      ║
╚══════════════════════════════════════════════════╝

Commands:
  stats                     Show today's send stats and lead counts
  import <file.csv>         Import leads from CSV file
                            CSV format: name,email,business,industry,website

  scrape <query> [industry] Search Yell.com and scrape websites for leads
                            Example: scrape "dentists Manchester" dental

  scrape-url <url> [ind]    Scrape a single website for emails
  scrape-file <file> [ind]  Scrape all URLs from a text file (one URL per line)

  yell <category> <loc> [i] Scrape Yell.com directory directly
                            Example: yell "dentists" "Manchester" dental

  Industries: dental, realestate, law, restaurant, fitness,
              trades, ecommerce, accounting, healthcare, generic

  send [limit]              Send emails to unsent leads (default: 100)
  send-all                  Send to ALL unsent leads (respects daily limits)

  list [status]             List leads (new, sent, replied, unsubscribed)
  mark <email> <status>     Update lead status

  warmup [days]             Start warmup mode (gradual increase, default 7 days)

  help                      Show this help

Examples:
  node leadgen/run.js stats
  node leadgen/run.js import leads.csv
  node leadgen/run.js yell "dentists" "London" dental
  node leadgen/run.js yell "estate agents" "Birmingham" realestate
  node leadgen/run.js yell "solicitors" "Dublin" law
  node leadgen/run.js scrape-url https://example-dental.com dental
  node leadgen/run.js scrape-file urls.txt dental
  node leadgen/run.js send 50
  node leadgen/run.js send-all
`);
}

async function main() {
  switch (command) {

    case 'stats': {
      const sendStats = getTodayStats();
      const leadStats = getLeadsSummary();

      console.log(`
╔══════════════════════════════════════════════════╗
║              KLIVIO STATS — ${sendStats.date}           ║
╠══════════════════════════════════════════════════╣
║  EMAILS TODAY                                     ║
║  Sent: ${String(sendStats.totalSent).padEnd(6)} / ${sendStats.capacity} capacity              ║
║  Remaining: ${String(sendStats.remaining).padEnd(5)} emails available              ║
╠══════════════════════════════════════════════════╣
║  LEADS DATABASE                                   ║
║  Total: ${String(leadStats.total).padEnd(6)}                                ║
║  New (unsent): ${String(leadStats.newLeads).padEnd(5)}                          ║
║  By status: ${JSON.stringify(leadStats.byStatus).slice(0,35).padEnd(35)} ║
║  By industry: ${JSON.stringify(leadStats.byIndustry).slice(0,33).padEnd(33)} ║
╚══════════════════════════════════════════════════╝`);

      // Show per-account breakdown
      console.log('\nPer account:');
      for (const acc of sendStats.perAccount) {
        const bar = '█'.repeat(Math.floor(acc.sent / 10)) + '░'.repeat(Math.floor((250 - acc.sent) / 10));
        console.log(`  ${acc.email.padEnd(25)} ${String(acc.sent).padStart(3)}/${250} ${bar}`);
      }
      break;
    }

    case 'import': {
      const file = args[0];
      if (!file) { console.log('Usage: import <file.csv>'); break; }
      const result = importCSV(file);
      console.log(`Imported: ${result.imported} leads, Skipped: ${result.skipped} duplicates`);
      break;
    }

    case 'scrape': {
      const query = args[0];
      const industry = args[1] || 'generic';
      if (!query) { console.log('Usage: scrape "<search query>" [industry]'); break; }
      await findLeads(query, industry, 30);
      break;
    }

    case 'yell': {
      const category = args[0];
      const location = args[1] || 'London';
      const industry = args[2] || 'generic';
      const pages = parseInt(args[3]) || 5;
      if (!category) { console.log('Usage: yell <category> <location> [industry] [pages]'); break; }

      console.log(`\nScraping Yell.com: "${category}" in "${location}" (${pages} pages)\n`);
      const yellResults = await scrapeYell(category, location, pages);
      console.log(`Found ${yellResults.length} businesses`);

      // Scrape each website for emails
      let found = 0;
      for (const biz of yellResults) {
        if (!biz.website) continue;
        console.log(`\nScraping: ${biz.name} — ${biz.website}`);
        const data = await extractEmailsFromUrl(biz.website);
        if (data.emails.length > 0) {
          for (const email of data.emails) {
            const added = addLead({
              email,
              business: biz.name || data.businessName,
              website: biz.website,
              industry,
              contactName: '',
              phone: biz.phone || '',
              source: 'yell',
            });
            if (added) { console.log(`  ✓ ${email}`); found++; }
          }
        } else {
          console.log(`  - No emails`);
        }
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
      }
      console.log(`\nTotal new leads: ${found}`);
      break;
    }

    case 'scrape-url': {
      const url = args[0];
      const industry = args[1] || 'generic';
      if (!url) { console.log('Usage: scrape-url <url> [industry]'); break; }

      console.log(`Scraping: ${url}`);
      const data = await extractEmailsFromUrl(url);
      if (data.emails.length > 0) {
        for (const email of data.emails) {
          const added = addLead({
            email,
            business: data.businessName,
            website: url,
            industry,
            contactName: '',
            source: 'manual',
          });
          console.log(added ? `  ✓ ${email}` : `  - ${email} (duplicate)`);
        }
      } else {
        console.log('  No emails found');
      }
      break;
    }

    case 'scrape-file': {
      const file = args[0];
      const industry = args[1] || 'generic';
      if (!file) { console.log('Usage: scrape-file <file.txt> [industry]'); break; }
      await scrapeUrlFile(file, industry);
      break;
    }

    case 'send': {
      const limit = parseInt(args[0]) || 100;
      const leads = loadLeads().filter(l => l.status === 'new');

      if (leads.length === 0) {
        console.log('No unsent leads. Use "scrape" or "import" to add leads first.');
        break;
      }

      const batch = leads.slice(0, limit);
      console.log(`Sending to ${batch.length} leads (of ${leads.length} unsent)...\n`);

      const results = await sendBatch(batch);

      // Update lead statuses
      const allLeads = loadLeads();
      for (const lead of allLeads) {
        if (lead.status === 'new' && batch.some(b => b.email === lead.email)) {
          lead.status = 'sent';
          lead.sentAt = new Date().toISOString();
        }
      }
      saveLeads(allLeads);

      console.log(`\n✓ Sent: ${results.sent} | Skipped: ${results.skipped} | Failed: ${results.failed}`);
      if (results.limitReached) console.log('⚠ Daily limit reached on all accounts.');
      break;
    }

    case 'send-all': {
      const leads = loadLeads().filter(l => l.status === 'new');
      if (leads.length === 0) {
        console.log('No unsent leads.');
        break;
      }

      console.log(`Sending to ALL ${leads.length} unsent leads...\n`);
      const results = await sendBatch(leads);

      const allLeads = loadLeads();
      for (const lead of allLeads) {
        if (lead.status === 'new') {
          lead.status = 'sent';
          lead.sentAt = new Date().toISOString();
        }
      }
      saveLeads(allLeads);

      console.log(`\n✓ Sent: ${results.sent} | Skipped: ${results.skipped} | Failed: ${results.failed}`);
      break;
    }

    case 'list': {
      const statusFilter = args[0];
      let leads = loadLeads();
      if (statusFilter) leads = leads.filter(l => l.status === statusFilter);

      if (leads.length === 0) { console.log('No leads found.'); break; }

      console.log(`\n${leads.length} leads${statusFilter ? ` (${statusFilter})` : ''}:\n`);
      for (const lead of leads.slice(0, 50)) {
        console.log(`  [${lead.status.padEnd(12)}] ${lead.email.padEnd(35)} ${(lead.business || '').slice(0, 25).padEnd(25)} ${lead.industry}`);
      }
      if (leads.length > 50) console.log(`  ... and ${leads.length - 50} more`);
      break;
    }

    case 'mark': {
      const email = args[0];
      const status = args[1];
      if (!email || !status) { console.log('Usage: mark <email> <status>'); break; }

      const leads = loadLeads();
      const lead = leads.find(l => l.email.toLowerCase() === email.toLowerCase());
      if (!lead) { console.log(`Lead not found: ${email}`); break; }

      lead.status = status;
      saveLeads(leads);
      console.log(`Updated ${email} → ${status}`);
      break;
    }

    case 'warmup': {
      const days = parseInt(args[0]) || 7;
      console.log(`\n🔥 WARMUP MODE — ${days} days\n`);
      console.log('Warmup sends a small, gradually increasing number of emails');
      console.log('to build sender reputation before going full volume.\n');

      const leads = loadLeads().filter(l => l.status === 'new');
      const today = getTodayStats();

      // Calculate warmup volume: start at 5/account, increase daily
      // Day 1: 5/acc = 95 total
      // Day 2: 15/acc = 285 total
      // Day 3: 30/acc = 570 total
      // Day 4: 60/acc = 1140 total
      // Day 5: 100/acc = 1900 total
      // Day 6: 150/acc = 2850 total
      // Day 7: 250/acc = 4750 total (full capacity)
      const warmupSchedule = [5, 15, 30, 60, 100, 150, 250];

      // Determine which day we're on based on existing stats
      let warmupDay = 0;
      const stats = require('./sender').getTodayStats();
      if (stats.totalSent === 0) warmupDay = 0;

      const emailsPerAccount = warmupSchedule[Math.min(warmupDay, warmupSchedule.length - 1)];
      const totalToSend = Math.min(emailsPerAccount * 19, leads.length);

      console.log(`Schedule (emails per account per day):`);
      warmupSchedule.forEach((n, i) => {
        const marker = i === warmupDay ? ' ← TODAY' : '';
        console.log(`  Day ${i + 1}: ${n}/account = ${n * 19} total${marker}`);
      });

      console.log(`\nToday: sending ${totalToSend} emails (${emailsPerAccount}/account)`);
      console.log(`Available unsent leads: ${leads.length}\n`);

      if (leads.length === 0) {
        console.log('No unsent leads. Add leads first with "scrape" or "import".');
        break;
      }

      const batch = leads.slice(0, totalToSend);
      const results = await sendBatch(batch, { delayMin: 15, delayMax: 45 }); // Slower during warmup

      const allLeads = loadLeads();
      for (const lead of allLeads) {
        if (lead.status === 'new' && batch.some(b => b.email === lead.email)) {
          lead.status = 'sent';
          lead.sentAt = new Date().toISOString();
        }
      }
      saveLeads(allLeads);

      console.log(`\n✓ Warmup sent: ${results.sent} | Skipped: ${results.skipped} | Failed: ${results.failed}`);
      break;
    }

    case 'help':
    default:
      printHelp();
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
