// ── Klivio Voice Outreach — Retell AI ──
// Reads leads.json, calls hot/cold leads via Retell API (James agent)
// Passes business_name, owner_name, industry as dynamic variables
//
// Usage:
//   node leadgen/voice-retell.js --hot       → calls interested/replied leads
//   node leadgen/voice-retell.js --cold      → calls uncontacted leads with phone
//   node leadgen/voice-retell.js --all       → both, hot first
//   node leadgen/voice-retell.js +447xxxxxxx "Smile Dental" "Sarah" "dental"

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs   = require('fs');
const path = require('path');
const https = require('https');

const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');
const CALL_LOG   = path.join(__dirname, 'data', 'retell_call_log.json');
const DNC_FILE   = path.join(__dirname, 'data', 'dnc.json');
const ACTIVITY   = path.join(__dirname, 'data', 'activity.json');

const RETELL_API_KEY = process.env.RETELL_API_KEY || 'key_5eb9b860772b83d732c3984acc61';
const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID || 'agent_df94a8fd5eae2a912d417b0226';
const FROM_NUMBER = process.env.RETELL_PHONE || process.env.TELNYX_PHONE;

const MAX_CALLS_PER_RUN = 10;
const RECALL_HOURS      = 24;
const DELAY_BETWEEN_MS  = 60 * 1000; // 1 min between calls

function readJSON(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return d; } }
function writeJSON(f, d) { fs.writeFileSync(f, JSON.stringify(d, null, 2)); }

function logActivity(type, msg, extra = {}) {
  const list = readJSON(ACTIVITY, []);
  list.push({ at: new Date().toISOString(), type, msg, ...extra });
  if (list.length > 500) list.splice(0, list.length - 500);
  writeJSON(ACTIVITY, list);
  console.log(`[${new Date().toLocaleTimeString('en-GB')}] ${type.padEnd(8)} ${msg}`);
}

function normalizePhone(raw, defaultCountry = '44') {
  if (!raw) return null;
  let p = raw.replace(/[^\d+]/g, '');
  if (p.startsWith('+')) return p;
  if (p.startsWith('00')) return '+' + p.slice(2);
  if (p.startsWith('0')) return '+' + defaultCountry + p.slice(1);
  if (/^\d{10,15}$/.test(p)) return '+' + p;
  return null;
}

function isCallableTime(country = 'UK') {
  const h = new Date().getHours();
  const offsets = { UK: -2, IE: -2, US: -7, CA: -7, AU: 7 };
  const local = (h + (offsets[country] || -2) + 24) % 24;
  return local >= 9 && local < 19;
}

function loadDNC() {
  return new Set(readJSON(DNC_FILE, []).map(p => p.replace(/[^\d+]/g, '')));
}

// ── Make outbound call via Retell API ──
function retellCall({ toNumber, fromNumber, agentId, dynamicVars = {} }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      from_number: fromNumber,
      to_number:   toNumber,
      agent_id:    agentId,
      retell_llm_dynamic_variables: dynamicVars,
      metadata: { source: 'klivio-leadgen' },
    });

    const req = https.request({
      hostname: 'api.retellai.com',
      path:     '/v2/create-phone-call',
      method:   'POST',
      headers: {
        Authorization:  `Bearer ${RETELL_API_KEY}`,
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
          if (res.statusCode >= 400) {
            reject(new Error(`Retell ${res.statusCode}: ${JSON.stringify(j).slice(0, 120)}`));
          } else {
            resolve(j);
          }
        } catch (e) { reject(e); }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

// ── Pick leads to call ──
function pickLeads(mode = 'hot') {
  const leads   = readJSON(LEADS_FILE, []);
  const callLog = readJSON(CALL_LOG, []);
  const dnc     = loadDNC();

  const recentCalls = {};
  callLog.forEach(c => {
    recentCalls[c.phone] = Math.max(recentCalls[c.phone] || 0, new Date(c.at).getTime());
  });

  return leads.filter(l => {
    if (l.unsubscribed || l.replyIntent === 'unsubscribe' || l.replyIntent === 'angry') return false;

    const phone = normalizePhone(l.phone, l.country === 'US' ? '1' : '44');
    if (!phone) return false;
    if (dnc.has(phone)) return false;
    if (!isCallableTime(l.country || 'UK')) return false;

    const lastCall = recentCalls[phone];
    if (lastCall && Date.now() - lastCall < RECALL_HOURS * 3600 * 1000) return false;

    if (mode === 'hot') return l.hot || l.replyIntent === 'interested' || (l.score >= 85 && l.replied);
    if (mode === 'cold') return (l.status === 'new' || l.status === 'sent') && !l.replied && !l.retellCalledAt;

    const isHot  = l.hot || l.replyIntent === 'interested' || (l.score >= 85 && l.replied);
    const isCold = (l.status === 'new' || l.status === 'sent') && !l.replied && !l.retellCalledAt;
    return isHot || isCold;
  }).sort((a, b) => {
    const aHot = (a.hot || a.replyIntent === 'interested') ? 1 : 0;
    const bHot = (b.hot || b.replyIntent === 'interested') ? 1 : 0;
    if (bHot !== aHot) return bHot - aHot;
    return (b.score || 0) - (a.score || 0);
  });
}

// ── Call a single lead ──
async function callLead(lead) {
  const phone = normalizePhone(lead.phone, lead.country === 'US' ? '1' : '44');
  if (!phone) return { ok: false, reason: 'invalid_phone' };

  if (!FROM_NUMBER) {
    logActivity('ERROR', 'No RETELL_PHONE or TELNYX_PHONE in .env');
    return { ok: false, reason: 'no_from_number' };
  }

  // Build dynamic variables — James gets these before the call
  const ownerName    = (lead.name || '').split(' ')[0] || '';
  const businessName = lead.business || lead.company || '';
  const industry     = lead.industry || '';

  const dynamicVars = {
    owner_name:    ownerName || 'there',
    business_name: businessName || 'your business',
    industry:      industry || 'your industry',
  };

  try {
    const result = await retellCall({
      toNumber:   phone,
      fromNumber: FROM_NUMBER,
      agentId:    RETELL_AGENT_ID,
      dynamicVars,
    });

    const callLog = readJSON(CALL_LOG, []);
    callLog.push({
      at:       new Date().toISOString(),
      leadId:   lead.id,
      business: businessName,
      phone,
      callId:   result.call_id,
      status:   'initiated',
      vars:     dynamicVars,
    });
    writeJSON(CALL_LOG, callLog);

    // Mark lead so email system doesn't also contact same day
    const allLeads = readJSON(LEADS_FILE, []);
    const idx = allLeads.findIndex(l => l.id === lead.id);
    if (idx !== -1) {
      allLeads[idx].retellCalledAt = new Date().toISOString();
      writeJSON(LEADS_FILE, allLeads);
    }

    logActivity('CALL', `→ ${businessName} (${phone}) | James speaking as: ${ownerName || 'owner'}`, { leadId: lead.id });
    return { ok: true, callId: result.call_id };
  } catch (e) {
    logActivity('ERROR', `Retell call failed for ${businessName}: ${e.message.slice(0, 100)}`);
    return { ok: false, reason: e.message };
  }
}

// ── Run a batch ──
async function runBatch(mode = 'hot') {
  const leads = pickLeads(mode);

  if (!leads.length) {
    logActivity('INFO', `No leads to call in mode: ${mode}`);
    return { called: 0, total: 0, mode };
  }

  const max = Math.min(leads.length, MAX_CALLS_PER_RUN);
  let called = 0;

  logActivity('INFO', `Starting Retell [${mode}] batch: ${max} of ${leads.length} leads`);

  for (let i = 0; i < max; i++) {
    const r = await callLead(leads[i]);
    if (r.ok) called++;
    if (i < max - 1) await new Promise(res => setTimeout(res, DELAY_BETWEEN_MS));
  }

  logActivity('INFO', `Retell batch done: ${called}/${max} calls initiated`);
  return { called, total: leads.length, mode };
}

// ── CLI ──
if (require.main === module) {
  const args = process.argv.slice(2);

  // Manual single call: node voice-retell.js +447xxx "Smile Dental" "Sarah" "dental"
  if (args[0] && args[0].match(/^\+?\d/)) {
    const [phone, business = 'Test Business', owner = 'there', industry = 'business'] = args;
    callLead({ phone, business, name: owner, industry, id: 'manual' })
      .then(r => { console.log(r); process.exit(0); });
  } else {
    const mode = args.includes('--cold') ? 'cold' : args.includes('--all') ? 'all' : 'hot';
    runBatch(mode).then(r => {
      console.log(`Retell batch [${r.mode}]: ${r.called} called of ${r.total}`);
      process.exit(0);
    });
  }
}

module.exports = { runBatch, callLead, pickLeads };
