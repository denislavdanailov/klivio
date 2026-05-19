// ── Klivio LeadRevive ──
// Reactivates old customer databases via personalized WhatsApp/Email messages
// Each "client" is a business that uploads their old customer list
//
// CLI:
//   node leadgen/leadrevive.js list                    → list configured clients
//   node leadgen/leadrevive.js create <slug>           → create a new client folder
//   node leadgen/leadrevive.js import <slug> <csv>     → import contacts CSV
//   node leadgen/leadrevive.js run <slug>              → send personalized messages
//   node leadgen/leadrevive.js stats <slug>            → show stats for a client
//
// CSV format (header row required):
//   name,phone,email,last_visit,services,notes
//   Sarah Mitchell,+447700111222,sarah@x.com,2025-09-12,"teeth cleaning",VIP

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs   = require('fs');
const path = require('path');
const https = require('https');
const { sendEmail } = require('./sender');

const ROOT = path.join(__dirname, 'data', 'leadrevive');
const GROQ_API_KEY = process.env.GROQ_API_KEY;

function clientDir(slug) { return path.join(ROOT, slug); }
function readJSON(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return d; } }
function writeJSON(f, d) { fs.writeFileSync(f, JSON.stringify(d, null, 2)); }

// ── CSV parser (handles quoted fields with commas) ──
function parseCSV(raw) {
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];

  const parseLine = (line) => {
    const fields = [];
    let buf = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && line[i + 1] === '"') { buf += '"'; i++; }
      else if (c === '"') inQuotes = !inQuotes;
      else if (c === ',' && !inQuotes) { fields.push(buf); buf = ''; }
      else buf += c;
    }
    fields.push(buf);
    return fields.map(f => f.trim());
  };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().trim());
  return lines.slice(1).map(line => {
    const fields = parseLine(line);
    const row = {};
    headers.forEach((h, i) => row[h] = fields[i] || '');
    return row;
  }).filter(r => r.email || r.phone);
}

// ── Default client config template ──
// Pricing model: pay-on-results. No upfront. Fixed $1,000 fee when system generates revenue.
function defaultConfig(slug) {
  return {
    slug,
    business: slug,
    industry: 'general',
    services: [],
    offer: 'a special returning-customer offer',
    bookingLink: '',
    senderName: 'Klivio',
    senderEmail: '',
    senderPhone: '',
    tone: 'friendly and casual',
    language: 'en',
    dealFee: 1000,            // fixed fee owed to us once revenue is generated
    feePaid: false,           // mark true once client has paid the dealFee
    minRevenueToInvoice: 1500, // we only invoice when generated revenue exceeds this
    createdAt: new Date().toISOString(),
  };
}

// ── Personalize message via Groq (free) ──
async function generateMessage(config, contact) {
  if (!GROQ_API_KEY) return fallbackMessage(config, contact);

  const monthsAgo = contact.last_visit
    ? Math.round((Date.now() - new Date(contact.last_visit).getTime()) / (30 * 86400000))
    : null;

  const isBG = config.language === 'bg';

  const bgExample = `Example style (Bulgarian):
"Здравей, Иван! Георги от автосервиза. Минаха 6 месеца от последната смяна на маслата ти. Тъй като наближава лятото, искаш ли да ти запазя час за бърз преглед?"`;

  const enExample = `Example style (English):
"Hi Sarah — Mike from Sunshine Dental here. Been about 8 months since your cleaning. We're running a quick check-up offer this month — fancy popping in?"`;

  const prompt = `You are writing a SHORT, casual, personal message from a small business reactivating an old customer. This is a TEXT MESSAGE between two people, not an email blast.

Business: ${config.business}
Industry: ${config.industry}
Services they offer: ${config.services.join(', ') || 'their services'}
Offer to mention: ${config.offer}
Sender name (the human sending this): ${config.senderName}

Customer details:
- Name: ${contact.name || 'there'}
- Last visit: ${monthsAgo ? monthsAgo + ' months ago' : 'a while back'}
- Service they used: ${contact.services || 'previous service'}
- Special notes: ${contact.notes || 'none'}

${isBG ? bgExample : enExample}

Rules:
- Maximum 3 short sentences
- Sound like a real friend texting — relaxed, NOT marketing
- Start with the customer's first name
- Reference the time gap naturally ("been a while", "missed you")
- Soft mention of the offer, NO hard sell, NO discount %
- ONE question at the end (would they like to book / are they free this week)
- Language: ${isBG ? 'Bulgarian (casual, "ти" form, NOT formal)' : 'English'}
- NEVER use: "AI", "automated", "campaign", "promotion", "limited time", "act now"
- NEVER include the business name in the opening — only the sender's first name

Return ONLY the message body — no subject, no signature, no "Best regards".`;

  return new Promise(resolve => {
    const payload = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.7,
    });
    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 15000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          const text = j.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
          resolve(text);
        } catch { resolve(fallbackMessage(config, contact)); }
      });
    });
    req.on('error', () => resolve(fallbackMessage(config, contact)));
    req.on('timeout', () => { req.destroy(); resolve(fallbackMessage(config, contact)); });
    req.write(payload);
    req.end();
  });
}

function fallbackMessage(config, contact) {
  const name = (contact.name || '').split(' ')[0] || 'there';
  return `Hi ${name}, it's ${config.senderName} from ${config.business}. It's been a while since we last saw you — we're running ${config.offer} for returning customers. Would you like to book a slot this week?`;
}

// ── Subject line generator ──
function subjectFor(config, contact) {
  const name = (contact.name || '').split(' ')[0] || '';
  const variants = [
    `${name}, been a while`,
    `Quick one for you, ${name}`,
    `${config.business} — small offer for you`,
    `${name}, are you free this week?`,
  ];
  return variants[Math.floor(Math.random() * variants.length)];
}

// ── Send a single contact ──
async function reactivateContact(config, contact) {
  const msg = await generateMessage(config, contact);
  const subject = subjectFor(config, contact);
  const footer = config.bookingLink
    ? `\n\nBook directly: ${config.bookingLink}`
    : '';
  const signature = `\n\n— ${config.senderName}\n${config.business}`;
  const body = msg + footer + signature;

  // Email channel (works today). WhatsApp/Viber added in Phase 2.
  if (contact.email) {
    const result = await sendEmail({
      to: contact.email,
      subject,
      body,
      skipDupeCheck: true,
    });
    return {
      contactId: contact.email,
      channel: 'email',
      ok: result.ok,
      reason: result.reason || null,
      subject,
      body,
      at: new Date().toISOString(),
    };
  }

  return { contactId: contact.phone || 'unknown', channel: 'whatsapp', ok: false, reason: 'whatsapp_not_yet_implemented', at: new Date().toISOString() };
}

// ── Run reactivation for one client business ──
async function runClient(slug, opts = {}) {
  const dir = clientDir(slug);
  if (!fs.existsSync(dir)) throw new Error(`Client "${slug}" not found. Create it first.`);

  const config = readJSON(path.join(dir, 'config.json'), null);
  if (!config) throw new Error(`No config.json for client "${slug}"`);

  const contactsFile = path.join(dir, 'contacts.json');
  const contacts = readJSON(contactsFile, []);
  if (!contacts.length) throw new Error(`No contacts imported for "${slug}". Run: leadrevive import ${slug} <csv>`);

  const messagesFile = path.join(dir, 'messages.json');
  const messages = readJSON(messagesFile, []);
  const sentTo = new Set(messages.map(m => m.contactId));

  const eligible = contacts.filter(c => {
    const id = c.email || c.phone;
    return id && !sentTo.has(id);
  });

  const limit = opts.limit || 100;
  const batch = eligible.slice(0, limit);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  LeadRevive — ${config.business}`);
  console.log('═'.repeat(60));
  console.log(`  Total contacts: ${contacts.length}`);
  console.log(`  Already messaged: ${sentTo.size}`);
  console.log(`  Sending this batch: ${batch.length} of ${eligible.length} eligible`);
  console.log('═'.repeat(60));

  let sent = 0, failed = 0;
  for (let i = 0; i < batch.length; i++) {
    const contact = batch[i];
    process.stdout.write(`[${i + 1}/${batch.length}] ${contact.name || contact.email} ... `);
    try {
      const result = await reactivateContact(config, contact);
      messages.push(result);
      writeJSON(messagesFile, messages);
      if (result.ok) { sent++; console.log('✅ ' + result.channel); }
      else { failed++; console.log('❌ ' + (result.reason || 'unknown')); }
    } catch (e) {
      failed++;
      console.log('❌ ' + e.message);
    }
    // Random delay 8-15 seconds to avoid spam triggers
    if (i < batch.length - 1) await new Promise(r => setTimeout(r, 8000 + Math.random() * 7000));
  }

  console.log(`\n  ✅ Sent: ${sent}  |  ❌ Failed: ${failed}\n`);
  return { sent, failed, total: batch.length };
}

// ── Stats for a client ──
function statsForClient(slug) {
  const dir = clientDir(slug);
  if (!fs.existsSync(dir)) return null;

  const config   = readJSON(path.join(dir, 'config.json'), {});
  const contacts = readJSON(path.join(dir, 'contacts.json'), []);
  const messages = readJSON(path.join(dir, 'messages.json'), []);
  const replies  = readJSON(path.join(dir, 'replies.json'), []);
  const bookings = readJSON(path.join(dir, 'bookings.json'), []);

  const sent = messages.filter(m => m.ok).length;
  const interested = replies.filter(r => r.intent === 'interested').length;
  const bookedCount = bookings.length;
  const revenue = bookings.reduce((s, b) => s + (b.amount || 0), 0);
  const dealFee = config.dealFee || 1000;
  const minRevenue = config.minRevenueToInvoice || 1500;
  const invoiceable = revenue >= minRevenue && !config.feePaid;

  return {
    slug, business: config.business,
    contacts: contacts.length,
    sent,
    replied: replies.length,
    interested,
    booked: bookedCount,
    revenue,
    dealFee,
    feePaid: !!config.feePaid,
    invoiceable,
    status: config.feePaid ? 'paid' : (invoiceable ? 'ready_to_invoice' : 'running'),
  };
}

// ── List all clients ──
function listClients() {
  if (!fs.existsSync(ROOT)) return [];
  return fs.readdirSync(ROOT)
    .filter(d => fs.statSync(path.join(ROOT, d)).isDirectory())
    .map(slug => statsForClient(slug))
    .filter(Boolean);
}

// ── Create a new client ──
function createClient(slug, partialConfig = {}) {
  const dir = clientDir(slug);
  if (fs.existsSync(dir)) throw new Error(`Client "${slug}" already exists`);
  fs.mkdirSync(dir, { recursive: true });
  const config = { ...defaultConfig(slug), ...partialConfig };
  writeJSON(path.join(dir, 'config.json'), config);
  writeJSON(path.join(dir, 'contacts.json'), []);
  writeJSON(path.join(dir, 'messages.json'), []);
  writeJSON(path.join(dir, 'replies.json'), []);
  writeJSON(path.join(dir, 'bookings.json'), []);
  return config;
}

// ── Import CSV into a client ──
function importContacts(slug, csvPath) {
  const dir = clientDir(slug);
  if (!fs.existsSync(dir)) throw new Error(`Client "${slug}" not found`);
  if (!fs.existsSync(csvPath)) throw new Error(`CSV not found: ${csvPath}`);

  const raw = fs.readFileSync(csvPath, 'utf-8');
  const newContacts = parseCSV(raw);

  const existing = readJSON(path.join(dir, 'contacts.json'), []);
  const existingIds = new Set(existing.map(c => c.email || c.phone));

  const merged = [...existing];
  let added = 0;
  for (const c of newContacts) {
    const id = c.email || c.phone;
    if (id && !existingIds.has(id)) {
      merged.push({ ...c, importedAt: new Date().toISOString() });
      existingIds.add(id);
      added++;
    }
  }
  writeJSON(path.join(dir, 'contacts.json'), merged);
  return { added, total: merged.length, skipped: newContacts.length - added };
}

// ── Process incoming reply (called from inbox.js) ──
async function processReply({ from, body, subject }) {
  const clients = listClients();
  for (const c of clients) {
    const dir = clientDir(c.slug);
    const contacts = readJSON(path.join(dir, 'contacts.json'), []);
    const contact = contacts.find(x => (x.email || '').toLowerCase() === from.toLowerCase());
    if (!contact) continue;

    const config = readJSON(path.join(dir, 'config.json'), {});
    const intent = classifyIntent(body);

    const repliesFile = path.join(dir, 'replies.json');
    const replies = readJSON(repliesFile, []);
    replies.push({
      contactId: from,
      contactName: contact.name,
      intent,
      body: body.slice(0, 1500),
      subject,
      at: new Date().toISOString(),
    });
    writeJSON(repliesFile, replies);

    return { matched: true, client: c.slug, intent };
  }
  return { matched: false };
}

function classifyIntent(body) {
  const b = body.toLowerCase();
  if (/\b(unsubscribe|remove|stop|not interested|leave me alone)\b/.test(b)) return 'unsubscribe';
  if (/\b(yes|sure|book|schedule|when|available|interested|sounds good|please|absolutely)\b/.test(b)) return 'interested';
  if (/\?/.test(b)) return 'question';
  return 'unclear';
}

// ── CLI ──
if (require.main === module) {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || cmd === 'list') {
    const list = listClients();
    if (!list.length) {
      console.log('\nNo clients yet. Create one:');
      console.log('  node leadgen/leadrevive.js create <slug>\n');
    } else {
      console.log('\nLeadRevive clients:\n');
      list.forEach(c => {
        console.log(`  • ${c.business} (${c.slug})`);
        console.log(`    contacts ${c.contacts} | sent ${c.sent} | replied ${c.replied} | booked ${c.booked} | revenue $${c.revenue} | your cut $${c.commission}`);
      });
      console.log();
    }
  } else if (cmd === 'create') {
    const slug = args[0];
    if (!slug) { console.log('Usage: leadrevive create <slug>'); process.exit(1); }
    const config = createClient(slug);
    console.log(`✅ Created client "${slug}" at ${clientDir(slug)}`);
    console.log('   Edit config.json to set business name, industry, services, offer, etc.');
  } else if (cmd === 'import') {
    const [slug, csvPath] = args;
    if (!slug || !csvPath) { console.log('Usage: leadrevive import <slug> <csv-path>'); process.exit(1); }
    const r = importContacts(slug, csvPath);
    console.log(`✅ Imported ${r.added} new contacts (skipped ${r.skipped} duplicates). Total: ${r.total}`);
  } else if (cmd === 'run') {
    const slug = args[0];
    const limit = parseInt(args[1] || '100');
    if (!slug) { console.log('Usage: leadrevive run <slug> [limit]'); process.exit(1); }
    runClient(slug, { limit }).then(r => {
      console.log(`Done. ${r.sent} sent, ${r.failed} failed of ${r.total}`);
      process.exit(0);
    }).catch(e => { console.error(e.message); process.exit(1); });
  } else if (cmd === 'stats') {
    const slug = args[0];
    if (!slug) { console.log('Usage: leadrevive stats <slug>'); process.exit(1); }
    const s = statsForClient(slug);
    if (!s) { console.log(`Client "${slug}" not found`); process.exit(1); }
    console.log(JSON.stringify(s, null, 2));
  } else {
    console.log('Usage:');
    console.log('  leadrevive list');
    console.log('  leadrevive create <slug>');
    console.log('  leadrevive import <slug> <csv>');
    console.log('  leadrevive run <slug> [limit]');
    console.log('  leadrevive stats <slug>');
  }
}

module.exports = {
  runClient,
  statsForClient,
  listClients,
  createClient,
  importContacts,
  processReply,
  generateMessage,
};
