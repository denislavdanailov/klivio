// ── Klivio Voice Bot — Twilio + Groq ──
require('dotenv').config();
const https = require('https');
const KLIVIO = require('./klivio-brain');

// ── In-memory sessions ──
const sessions = {};

function getSession(callSid) {
  if (!sessions[callSid]) sessions[callSid] = { messages: [], startTime: Date.now() };
  return sessions[callSid];
}

function cleanSession(callSid) {
  delete sessions[callSid];
}

// ── Groq AI response ──
function getAIResponse(callSid, userSpeech) {
  return new Promise((resolve) => {
    const session = getSession(callSid);
    session.messages.push({ role: 'user', content: userSpeech });

    const payload = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: KLIVIO.prompts.phone({ agentName: 'James', callType: 'inbound' }) },
        ...session.messages.slice(-8),
      ],
      max_tokens: 100,
      temperature: 0.75,
    });

    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 10000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(d);
          const reply = json.choices?.[0]?.message?.content?.trim() || "Could you say that again?";
          session.messages.push({ role: 'assistant', content: reply });
          resolve(reply);
        } catch { resolve("Sorry, give me just a moment."); }
      });
    });
    req.on('error', () => resolve("Sorry, give me just a moment."));
    req.on('timeout', () => { req.destroy(); resolve("Sorry, give me just a moment."); });
    req.write(payload);
    req.end();
  });
}

function isOverTimeLimit(callSid) {
  const session = getSession(callSid);
  return (Date.now() - session.startTime) > 170000;
}

// ── TwiML helpers ──
function twimlSayGather(text, action = '/api/voice/gather') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Brian" language="en-GB">${escapeXml(text)}</Say>
  <Gather input="speech" action="${action}" method="POST" speechTimeout="auto" language="en-GB" enhanced="true">
  </Gather>
  <Say voice="Polly.Brian" language="en-GB">I didn't catch that. Goodbye.</Say>
</Response>`;
}

function twimlSayHangup(text) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Brian" language="en-GB">${escapeXml(text)}</Say>
  <Hangup/>
</Response>`;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── Inbound call handler (initial greeting) ──
function handleInbound(req, res) {
  const callSid = req.body?.CallSid || 'unknown';
  console.log(`[VOICE] Inbound call: ${callSid}`);
  getSession(callSid);
  const greeting = "Hi, thanks for calling Klivio. I'm James. We build AI workers for businesses — things like lead response, chatbots, and review automation. How can I help you today?";
  res.type('text/xml').send(twimlSayGather(greeting));
}

// ── Gather handler (speech → AI → respond) ──
async function handleGather(req, res) {
  const callSid = req.body?.CallSid || 'unknown';
  const speech = req.body?.SpeechResult || '';
  console.log(`[VOICE] Heard: "${speech}"`);

  if (!speech.trim()) {
    return res.type('text/xml').send(twimlSayHangup("I couldn't hear you. Feel free to call back anytime. Goodbye!"));
  }

  if (isOverTimeLimit(callSid)) {
    cleanSession(callSid);
    return res.type('text/xml').send(twimlSayHangup("I don't want to take more of your time. Check out klivio.bond for more info. Have a great day!"));
  }

  const noSignals = ['not interested', 'no thank you', 'no thanks', 'remove me', "don't call", 'goodbye', 'bye', 'go away'];
  if (noSignals.some(s => speech.toLowerCase().includes(s))) {
    cleanSession(callSid);
    return res.type('text/xml').send(twimlSayHangup("No problem at all. Have a great day!"));
  }

  const reply = await getAIResponse(callSid, speech);

  const endSignals = ['have a great day', 'have a good day', 'goodbye', 'best of luck', 'take care'];
  if (endSignals.some(s => reply.toLowerCase().includes(s))) {
    cleanSession(callSid);
    return res.type('text/xml').send(twimlSayHangup(reply));
  }

  res.type('text/xml').send(twimlSayGather(reply));
}

// ── Status callback (cleanup on hangup) ──
function handleStatus(req, res) {
  const callSid = req.body?.CallSid;
  const status = req.body?.CallStatus;
  if (status === 'completed' || status === 'failed') {
    console.log(`[VOICE] Call ended: ${callSid}`);
    cleanSession(callSid);
  }
  res.sendStatus(200);
}

module.exports = { handleInbound, handleGather, handleStatus };
