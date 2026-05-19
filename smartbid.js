// ── Klivio SmartBid AI ──
// B2B proposal automation: read RFP/tender docs → match against pricelist → generate Word proposal
// One-time setup fee: $1,500–3,000 per client
//
// Architecture (per client):
//   data/smartbid/<slug>/config.json      — company info, branding, contact
//   data/smartbid/<slug>/pricelist.json   — services/products with prices
//   data/smartbid/<slug>/templates.json   — intro/terms text templates
//   data/smartbid/<slug>/history.json     — generated proposals log
//   data/smartbid/<slug>/proposals/<id>.docx
//
// CLI:
//   node smartbid.js list
//   node smartbid.js create <slug>
//   node smartbid.js generate <slug> <rfp-text-file>

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

let docx, pdfParse;
try { docx = require('docx'); } catch { /* installed at runtime */ }
try { pdfParse = require('pdf-parse'); } catch { /* installed at runtime */ }

const ROOT = path.join(__dirname, 'data', 'smartbid');
const GROQ_API_KEY = process.env.GROQ_API_KEY;

function clientDir(slug) { return path.join(ROOT, slug); }
function readJSON(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return d; } }
function writeJSON(f, d) { fs.writeFileSync(f, JSON.stringify(d, null, 2)); }
function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

// ── Default per-client config ──
function defaultConfig(slug) {
  return {
    slug,
    business: slug,
    industry: 'construction',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    address: '',
    vatNumber: '',
    currency: 'EUR',
    language: 'en',
    primaryColor: '#1e40af',
    logoUrl: '',
    setupFee: 1500,
    feePaid: false,
    createdAt: new Date().toISOString(),
  };
}

// Default pricelist structure (clients edit this with their real prices)
function defaultPricelist() {
  return {
    currency: 'EUR',
    items: [
      // Example: { code: 'INSTALL-01', name: 'Installation per m²', unit: 'm²', price: 25, category: 'install' },
    ],
    markups: {
      labor: 0.30,
      materials: 0.20,
      urgentDelivery: 0.15,
    },
  };
}

function defaultTemplates() {
  return {
    intro: 'Dear {{client_name}},\n\nThank you for your enquiry regarding {{project_name}}. Please find below our detailed proposal based on the requirements you provided.',
    terms: 'Payment terms: 50% deposit upon contract signing, balance due upon completion.\nValidity: This quotation is valid for 30 days from the date of issue.\nDelivery: Subject to final scheduling upon order confirmation.',
    closing: 'We look forward to working with you. For any questions, please contact {{contact_name}} at {{contact_email}} or {{contact_phone}}.\n\nKind regards,\n{{business_name}}',
  };
}

// ── Extract requirements from RFP text via Groq ──
async function extractRequirements(rfpText, config) {
  if (!GROQ_API_KEY) return { error: 'no_groq_key' };

  const prompt = `You are analyzing a request for proposal (RFP) / technical tender document. Extract structured requirements that can be priced.

INDUSTRY: ${config.industry}
LANGUAGE: ${config.language === 'bg' ? 'Bulgarian' : 'English'}

RFP TEXT:
"""
${rfpText.slice(0, 8000)}
"""

Return ONLY valid JSON in this exact shape:
{
  "client_name": "(name of the company requesting the proposal, or 'Client' if not stated)",
  "project_name": "(short title summarizing the project)",
  "deadline": "(deadline mentioned, or null)",
  "delivery_location": "(location, or null)",
  "scope_items": [
    { "description": "what they want", "quantity": 1, "unit": "pcs|m²|hours|etc", "notes": "any constraints" }
  ],
  "special_requirements": ["any unusual asks"],
  "language": "${config.language}"
}`;

  return new Promise(resolve => {
    const payload = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.2,
      response_format: { type: 'json_object' },
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
      timeout: 30000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          resolve(JSON.parse(j.choices[0].message.content));
        } catch (e) { resolve({ error: 'parse_failed', raw: d.slice(0, 200) }); }
      });
    });
    req.on('error', e => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.write(payload);
    req.end();
  });
}

// ── Match extracted scope items to the client's pricelist ──
async function matchPricing(scopeItems, pricelist, config) {
  if (!GROQ_API_KEY || !pricelist.items.length) {
    // Fallback: empty placeholders
    return scopeItems.map(s => ({
      ...s, matched: null, unitPrice: 0, lineTotal: 0, confidence: 0,
    }));
  }

  const itemsCatalog = pricelist.items.map(i =>
    `[${i.code}] ${i.name} — ${i.price} ${pricelist.currency || 'EUR'}/${i.unit || 'unit'}${i.category ? ' ('+i.category+')' : ''}`
  ).join('\n');

  const prompt = `You are matching project requirements to a company's official pricelist.

PRICELIST:
${itemsCatalog}

SCOPE ITEMS TO PRICE:
${JSON.stringify(scopeItems, null, 2)}

For each scope item, pick the BEST matching pricelist entry (or return null if no good match).
Return ONLY valid JSON:
{
  "matches": [
    {
      "scope_index": 0,
      "matched_code": "INSTALL-01",
      "matched_name": "Installation per m²",
      "unit_price": 25,
      "quantity_calculated": 100,
      "line_total": 2500,
      "confidence": 0.9,
      "notes": "matched by keyword and unit type"
    }
  ]
}`;

  return new Promise(resolve => {
    const payload = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 3000,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });
    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 30000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          const parsed = JSON.parse(j.choices[0].message.content);
          resolve(parsed.matches || []);
        } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.write(payload);
    req.end();
  });
}

// ── Render template placeholders ──
function renderTemplate(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] || '');
}

// ── Generate a Word .docx proposal ──
async function generateDocx({ config, requirements, lineItems, totals, templates }) {
  if (!docx) throw new Error('docx library not installed. Run: npm install docx');

  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, HeadingLevel, BorderStyle, WidthType } = docx;

  const vars = {
    client_name: requirements.client_name || 'Client',
    project_name: requirements.project_name || 'Project',
    contact_name: config.contactName,
    contact_email: config.contactEmail,
    contact_phone: config.contactPhone,
    business_name: config.business,
    date: new Date().toLocaleDateString(config.language === 'bg' ? 'bg-BG' : 'en-GB'),
  };

  const introText = renderTemplate(templates.intro, vars);
  const termsText = renderTemplate(templates.terms, vars);
  const closingText = renderTemplate(templates.closing, vars);

  const heading = (text, level = HeadingLevel.HEADING_1) =>
    new Paragraph({ text, heading: level, spacing: { before: 300, after: 200 } });

  const para = (text, bold = false) =>
    new Paragraph({ children: [new TextRun({ text, bold })], spacing: { after: 150 } });

  // Build line item table
  const headerRow = new TableRow({
    children: ['Item', 'Description', 'Qty', 'Unit Price', 'Total'].map(t =>
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: t, bold: true })] })],
        shading: { fill: 'E5E7EB' },
      })
    ),
  });

  const itemRows = lineItems.map(li => new TableRow({
    children: [
      new TableCell({ children: [new Paragraph(li.matched_code || '—')] }),
      new TableCell({ children: [new Paragraph(li.matched_name || li.description || '')] }),
      new TableCell({ children: [new Paragraph(String(li.quantity_calculated || li.quantity || 1))] }),
      new TableCell({ children: [new Paragraph(`${(li.unit_price || 0).toFixed(2)} ${config.currency}`)] }),
      new TableCell({ children: [new Paragraph(`${(li.line_total || 0).toFixed(2)} ${config.currency}`)] }),
    ],
  }));

  const table = new Table({
    rows: [headerRow, ...itemRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [new TextRun({ text: config.business.toUpperCase(), bold: true, size: 32 })],
          alignment: AlignmentType.CENTER,
        }),
        para(config.address, false),
        para(`${config.contactEmail} | ${config.contactPhone}`, false),
        new Paragraph({ text: '' }),
        heading('PROPOSAL'),
        para(`Date: ${vars.date}`, false),
        para(`Client: ${vars.client_name}`, false),
        para(`Project: ${vars.project_name}`, true),
        new Paragraph({ text: '' }),
        ...introText.split('\n').map(l => para(l, false)),
        heading('SCOPE OF WORK & PRICING', HeadingLevel.HEADING_2),
        table,
        new Paragraph({ text: '' }),
        para(`Subtotal: ${totals.subtotal.toFixed(2)} ${config.currency}`, false),
        para(`VAT (${(totals.vatRate * 100).toFixed(0)}%): ${totals.vat.toFixed(2)} ${config.currency}`, false),
        para(`GRAND TOTAL: ${totals.grandTotal.toFixed(2)} ${config.currency}`, true),
        heading('TERMS', HeadingLevel.HEADING_2),
        ...termsText.split('\n').map(l => para(l, false)),
        new Paragraph({ text: '' }),
        ...closingText.split('\n').map(l => para(l, false)),
      ],
    }],
  });

  return await Packer.toBuffer(doc);
}

// ── Main: generate a complete proposal from RFP text ──
async function generateProposal(slug, rfpText, opts = {}) {
  const dir = clientDir(slug);
  if (!fs.existsSync(dir)) throw new Error(`Client "${slug}" not found`);

  const config = readJSON(path.join(dir, 'config.json'), null);
  const pricelist = readJSON(path.join(dir, 'pricelist.json'), defaultPricelist());
  const templates = readJSON(path.join(dir, 'templates.json'), defaultTemplates());

  if (!config) throw new Error(`No config for "${slug}"`);

  console.log(`[smartbid] Extracting requirements from RFP (${rfpText.length} chars)...`);
  const requirements = await extractRequirements(rfpText, config);
  if (requirements.error) throw new Error(`Extraction failed: ${requirements.error}`);

  console.log(`[smartbid] Matching ${requirements.scope_items?.length || 0} items to pricelist...`);
  const matches = await matchPricing(requirements.scope_items || [], pricelist, config);

  // Calculate totals
  const lineItems = matches.length ? matches : (requirements.scope_items || []).map(s => ({
    description: s.description, quantity: s.quantity, matched_name: s.description, unit_price: 0, line_total: 0,
  }));
  const subtotal = lineItems.reduce((s, li) => s + (li.line_total || 0), 0);
  const vatRate = opts.vatRate ?? 0.20;
  const vat = subtotal * vatRate;
  const grandTotal = subtotal + vat;
  const totals = { subtotal, vat, vatRate, grandTotal };

  console.log(`[smartbid] Generating .docx...`);
  const buffer = await generateDocx({ config, requirements, lineItems, totals, templates });

  const proposalId = crypto.randomUUID().slice(0, 8);
  const proposalDir = path.join(dir, 'proposals');
  ensureDir(proposalDir);
  const docxPath = path.join(proposalDir, `${proposalId}.docx`);
  fs.writeFileSync(docxPath, buffer);

  // Log to history
  const history = readJSON(path.join(dir, 'history.json'), []);
  history.push({
    id: proposalId,
    createdAt: new Date().toISOString(),
    requirements,
    subtotal, vat, grandTotal,
    docx: `${proposalId}.docx`,
  });
  writeJSON(path.join(dir, 'history.json'), history);

  return {
    id: proposalId,
    docxPath,
    requirements,
    lineItems,
    totals,
  };
}

// ── Read PDF text ──
async function readPDF(filePath) {
  if (!pdfParse) throw new Error('pdf-parse not installed');
  const buf = fs.readFileSync(filePath);
  const result = await pdfParse(buf);
  return result.text;
}

// ── Client management ──
function createClient(slug, partial = {}) {
  const dir = clientDir(slug);
  if (fs.existsSync(dir)) throw new Error(`Client "${slug}" exists`);
  ensureDir(dir);
  ensureDir(path.join(dir, 'proposals'));
  writeJSON(path.join(dir, 'config.json'), { ...defaultConfig(slug), ...partial });
  writeJSON(path.join(dir, 'pricelist.json'), defaultPricelist());
  writeJSON(path.join(dir, 'templates.json'), defaultTemplates());
  writeJSON(path.join(dir, 'history.json'), []);
  return { ok: true, slug };
}

function statsForClient(slug) {
  const dir = clientDir(slug);
  if (!fs.existsSync(dir)) return null;
  const config = readJSON(path.join(dir, 'config.json'), {});
  const pricelist = readJSON(path.join(dir, 'pricelist.json'), defaultPricelist());
  const history = readJSON(path.join(dir, 'history.json'), []);
  return {
    slug, business: config.business,
    industry: config.industry,
    pricelistItems: pricelist.items?.length || 0,
    proposalsGenerated: history.length,
    totalProposalValue: history.reduce((s, h) => s + (h.grandTotal || 0), 0),
    setupFee: config.setupFee || 1500,
    feePaid: !!config.feePaid,
    status: config.feePaid ? 'paid' : (history.length > 0 ? 'delivered' : 'setup'),
  };
}

function listClients() {
  if (!fs.existsSync(ROOT)) return [];
  return fs.readdirSync(ROOT)
    .filter(d => fs.statSync(path.join(ROOT, d)).isDirectory())
    .map(slug => statsForClient(slug))
    .filter(Boolean);
}

function importPricelistCSV(slug, csvText) {
  const dir = clientDir(slug);
  if (!fs.existsSync(dir)) throw new Error(`Client "${slug}" not found`);
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) throw new Error('Empty CSV');
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const items = lines.slice(1).map(line => {
    const fields = line.split(',').map(f => f.trim());
    const row = {};
    headers.forEach((h, i) => row[h] = fields[i] || '');
    return {
      code: row.code || row.id || '',
      name: row.name || row.description || '',
      unit: row.unit || 'pcs',
      price: parseFloat(row.price || row.cost || '0') || 0,
      category: row.category || '',
    };
  }).filter(i => i.name && i.price);
  const pricelist = readJSON(path.join(dir, 'pricelist.json'), defaultPricelist());
  pricelist.items = items;
  writeJSON(path.join(dir, 'pricelist.json'), pricelist);
  return { count: items.length };
}

// ── CLI ──
if (require.main === module) {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || cmd === 'list') {
    const list = listClients();
    if (!list.length) console.log('No clients yet. Create one: node smartbid.js create <slug>');
    else list.forEach(c => console.log(`  • ${c.business} (${c.slug}) — ${c.pricelistItems} items, ${c.proposalsGenerated} proposals`));
  } else if (cmd === 'create') {
    createClient(args[0]);
    console.log(`✅ Created client "${args[0]}"`);
  } else if (cmd === 'generate') {
    const [slug, file] = args;
    if (!slug || !file) { console.log('Usage: smartbid generate <slug> <rfp-text-or-pdf>'); process.exit(1); }
    (async () => {
      let rfpText;
      if (file.endsWith('.pdf')) rfpText = await readPDF(file);
      else rfpText = fs.readFileSync(file, 'utf-8');
      const result = await generateProposal(slug, rfpText);
      console.log(`✅ Proposal ${result.id} → ${result.docxPath}`);
      console.log(`   Total: ${result.totals.grandTotal.toFixed(2)} (subtotal ${result.totals.subtotal.toFixed(2)} + VAT)`);
    })().catch(e => { console.error(e.message); process.exit(1); });
  } else {
    console.log('Usage: list | create <slug> | generate <slug> <rfp-file>');
  }
}

module.exports = {
  createClient, listClients, statsForClient,
  generateProposal, importPricelistCSV, readPDF,
  defaultConfig, defaultPricelist, defaultTemplates,
};
