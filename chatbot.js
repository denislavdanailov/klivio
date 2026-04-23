// ── Klivio Website Chatbot — Groq powered ──
require('dotenv').config();
const https = require('https');
const KLIVIO = require('./klivio-brain');

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Conversation memory per session (in-memory, resets on server restart)
const sessions = {};

function getSession(id) {
  if (!sessions[id]) {
    sessions[id] = {
      messages: [],
      createdAt: Date.now(),
    };
  }
  // Clean up sessions older than 2 hours
  if (Date.now() - sessions[id].createdAt > 7200000) {
    sessions[id] = { messages: [], createdAt: Date.now() };
  }
  return sessions[id];
}

async function chat(sessionId, userMessage) {
  const session = getSession(sessionId);

  session.messages.push({ role: 'user', content: userMessage });

  // Keep last 10 messages for context (5 exchanges)
  const recent = session.messages.slice(-10);

  const payload = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: KLIVIO.prompts.chat() },
      ...recent,
    ],
    max_tokens: 200,
    temperature: 0.7,
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 15000,
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const reply = json.choices?.[0]?.message?.content || getFallbackReply(userMessage);
          session.messages.push({ role: 'assistant', content: reply });
          resolve(reply);
        } catch {
          resolve(getFallbackReply(userMessage));
        }
      });
    });
    req.on('error', () => resolve(getFallbackReply(userMessage)));
    req.on('timeout', () => { req.destroy(); resolve(getFallbackReply(userMessage)); });
    req.write(payload);
    req.end();
  });
}

function getFallbackReply(msg) {
  const m = msg.toLowerCase();
  if (m.includes('price') || m.includes('cost') || m.includes('how much'))
    return "Our plans start at £197/mo. Starter (1 AI worker), Growth £297/mo (2 workers), Full System £497/mo (3 workers including Voice AI). All include full setup — no extra charges.";
  if (m.includes('how long') || m.includes('setup') || m.includes('how fast'))
    return "Most products are live within 2-7 business days. We handle everything — no technical work needed from you.";
  if (m.includes('cancel') || m.includes('contract'))
    return "No contracts, no lock-in. Cancel anytime with one email — no questions asked.";
  if (m.includes('trial') || m.includes('free'))
    return "We don't offer a free trial, but there's zero risk — no setup fees, no contracts. If you're not happy after the first month, just cancel.";
  if (m.includes('hello') || m.includes('hi') || m.includes('hey'))
    return "Hi! I'm Klivio's AI assistant. We build AI workers for UK businesses — things like lead responders, chatbots, voice assistants, and more. What does your business do?";
  return "Happy to help! What would you like to know about Klivio? I can tell you about our products, pricing, or how setup works.";
}

module.exports = { chat };
