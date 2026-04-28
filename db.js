// ── Klivio DB — Supabase REST client (no SDK, just https) ──
// All order data from website / email / phone saved here.
require('dotenv').config();
const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kjnwgmuufdxvmykanamr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqbndnbXV1ZmR4dm15a2FuYW1yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MzM4MzksImV4cCI6MjA5MTAwOTgzOX0.waqWtZZNUxTJX5G8cpT8PYKI3HBREnYDJh52aZR7YP4';

function supabaseRequest(method, path, body, params) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      'apikey':         SUPABASE_KEY,
      'Authorization':  `Bearer ${SUPABASE_KEY}`,
      'Content-Type':   'application/json',
      'Prefer':         'return=representation',
    };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    const req = https.request({
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method,
      headers,
      timeout: 10000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const parsed = d ? JSON.parse(d) : null;
          if (res.statusCode >= 400) {
            reject(new Error(`Supabase ${res.statusCode}: ${JSON.stringify(parsed)}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Supabase timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────
// Orders
// ─────────────────────────────────────────────────────────────

const DELIVERY_DAYS = {
  'AI Lead Responder':        2,
  'Follow-Up Automator':      3,
  'AI Chatbot':               4,
  'Review & Referral System': 2,
  'Valuation Bot':            3,
  'Report Generator':         3,
  'Cold Outreach Setup':      5,
  'Live Chat Assistant':      3,
  'Voice Assistant':          5,
  'Custom Build':             10,
};

function addBusinessDays(date, days) {
  const d = new Date(date);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

/**
 * Create a new order from any channel.
 * @param {Object} data
 * @param {'website'|'stripe'|'email'|'phone'} data.source
 * @param {string} data.product
 * @param {string} [data.name]
 * @param {string} [data.email]
 * @param {string} [data.phone]
 * @param {string} [data.website_url]
 * @param {string} [data.price]
 * @param {string} [data.notes]
 * @param {string} [data.stripe_session_id]
 * @param {string} [data.call_id]
 * @param {string} [data.transcript]
 * @param {string} [data.language]
 * @param {string} [data.status]   default 'new'
 * @returns {Promise<Object>} saved order row
 */
async function createOrder(data) {
  const deliveryDays = DELIVERY_DAYS[data.product] || 5;
  const deadline     = addBusinessDays(new Date(), deliveryDays);

  const row = {
    source:            data.source || 'website',
    name:              data.name   || null,
    email:             data.email  || null,
    phone:             data.phone  || null,
    website_url:       data.website_url || null,
    language:          data.language   || 'English',
    product:           data.product,
    price:             data.price  || null,
    status:            data.status || 'new',
    deadline:          deadline.toISOString(),
    delivery_days:     deliveryDays,
    notes:             data.notes  || null,
    stripe_session_id: data.stripe_session_id || null,
    call_id:           data.call_id           || null,
    transcript:        data.transcript        || null,
    status_history:    [{ status: data.status || 'new', at: new Date().toISOString() }],
    onboarding_qa:     {},
  };

  const result = await supabaseRequest('POST', '/orders', row);
  const order = Array.isArray(result) ? result[0] : result;
  console.log(`[DB] Order saved — ${order?.id} | ${data.source} | ${data.product}`);
  return order;
}

/**
 * Update order status (and append to status_history).
 */
async function updateOrderStatus(id, status, notes) {
  const current = await getOrder(id);
  if (!current) throw new Error(`Order not found: ${id}`);

  const history = [...(current.status_history || []), { status, at: new Date().toISOString(), notes }];
  return supabaseRequest('PATCH', '/orders', { status, status_history: history }, { id: `eq.${id}` });
}

/**
 * Save onboarding Q&A answers to an order.
 */
async function saveOnboardingAnswers(id, qa) {
  return supabaseRequest('PATCH', '/orders', { onboarding_qa: qa }, { id: `eq.${id}` });
}

/**
 * Get a single order by id.
 */
async function getOrder(id) {
  const rows = await supabaseRequest('GET', '/orders', null, { id: `eq.${id}`, limit: '1' });
  return rows?.[0] || null;
}

/**
 * Get orders — optionally filter by status or source.
 * @param {{ status?: string, source?: string, email?: string, limit?: number }} filters
 */
async function getOrders(filters = {}) {
  const params = { order: 'created_at.desc', limit: String(filters.limit || 100) };
  if (filters.status) params.status = `eq.${filters.status}`;
  if (filters.source) params.source = `eq.${filters.source}`;
  if (filters.email)  params.email  = `eq.${filters.email}`;
  return supabaseRequest('GET', '/orders', null, params) || [];
}

/**
 * Find order by Stripe session ID (dedup).
 */
async function findByStripeSession(sessionId) {
  const rows = await supabaseRequest('GET', '/orders', null, {
    stripe_session_id: `eq.${sessionId}`,
    limit: '1',
  });
  return rows?.[0] || null;
}

module.exports = {
  createOrder,
  updateOrderStatus,
  saveOnboardingAnswers,
  getOrder,
  getOrders,
  findByStripeSession,
  DELIVERY_DAYS,
  addBusinessDays,
};
