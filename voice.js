// ── Klivio Voice Bot — Telnyx + Groq ──
// Handles inbound calls and outbound cold calls
// Telnyx Call Control API + built-in TTS/STT (no extra cost)
require('dotenv').config();
const https = require('https');
const KLIVIO = require('./klivio-brain');

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

// ── Active call sessions ──
const calls = {};

function getCall(id) {
  if (!calls[id]) calls[id] = { messages: [], startTime: Date.now(), strikes: 0 };
  return calls[id];
}

// ── Telnyx API request ──
function telnyxApi(path, body) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.telnyx.com',
      path: `/v2${path}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 10000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', e => { console.error('Telnyx API error:', e.message); resolve(null); });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(payload);
    req.end();
  });
}

// ── Answer incoming call ──
async function answerCall(callControlId) {
  return telnyxApi(`/calls/${callControlId}/actions/answer`, {});
}

// ── Speak text to caller ──
async function speak(callControlId, text, commandId = null) {
  const body = {
    payload: text,
    voice: 'male',
    language: 'en-GB',
    service_level: 'premium',
  };
  if (commandId) body.client_state = commandId;
  return telnyxApi(`/calls/${callControlId}/actions/speak`, body);
}

// ── Gather speech input ──
async function gather(callControlId) {
  return telnyxApi(`/calls/${callControlId}/actions/gather`, {
    minimum_digit_silence_timeout_millis: 1500,
    timeout_millis: 8000,
    speech_timeout: 'auto',
    speech_language: 'en-GB',
    client_state: 'gathering',
  });
}

// ── Hang up ──
async function hangup(callControlId) {
  return telnyxApi(`/calls/${callControlId}/actions/hangup`, {});
}

// ── AI response via Groq ──
function getAIResponse(callId, userSpeech, callType = 'inbound', context = {}) {
  return new Promise((resolve) => {
    const session = getCall(callId);
    session.messages.push({ role: 'user', content: userSpeech });

    const systemPrompt = KLIVIO.prompts.phone({
      agentName: 'James',
      callType,
      ...context,
    });

    const payload = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        ...session.messages.slice(-8),
      ],
      max_tokens: 120,
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
      timeout: 12000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(d);
          const reply = json.choices?.[0]?.message?.content || "I didn't catch that. Could you say that again?";
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

// ── Check time limit (3 min) ──
function isOverTimeLimit(callId) {
  const session = getCall(callId);
  return (Date.now() - session.startTime) > 175000; // 175 seconds
}

// ── Detect if caller is not interested ──
function detectDisengagement(text) {
  const lower = text.toLowerCase();
  const noSignals = ['not interested', 'no thank you', 'no thanks', 'remove me', 'don\'t call', 'stop calling', 'leave me alone', 'go away', 'goodbye', 'bye'];
  return noSignals.some(s => lower.includes(s));
}

// ── Main webhook handler ──
async function handleWebhook(event) {
  const { event_type, payload } = event;
  const callControlId = payload?.call_control_id;
  const callLegId = payload?.call_leg_id || callControlId;

  console.log(`[VOICE] Event: ${event_type} | Call: ${callControlId?.slice(-8)}`);

  switch (event_type) {

    case 'call.initiated': {
      // Incoming call — answer it
      await answerCall(callControlId);
      break;
    }

    case 'call.answered': {
      // Greet the caller
      const greeting = "Hi, thanks for calling Klivio. I'm James. We build AI automation systems for businesses. How can I help you today?";
      await speak(callControlId, greeting);
      setTimeout(() => gather(callControlId), 3000);
      break;
    }

    case 'call.gather.ended': {
      const transcript = payload?.speech_result?.transcription || payload?.digits || '';
      console.log(`[VOICE] Heard: "${transcript}"`);

      if (!transcript || transcript.trim().length < 2) {
        await speak(callControlId, "Sorry, I didn't catch that. Could you say that again?");
        setTimeout(() => gather(callControlId), 2000);
        return;
      }

      // Check time limit
      if (isOverTimeLimit(callLegId)) {
        await speak(callControlId, "I don't want to take more of your time. I'll send you our details by email. Have a great day!");
        setTimeout(() => hangup(callControlId), 4000);
        return;
      }

      // Check disengagement
      if (detectDisengagement(transcript)) {
        const session = getCall(callLegId);
        session.strikes++;
        if (session.strikes >= 2) {
          await speak(callControlId, "No problem at all. Have a great day!");
          setTimeout(() => hangup(callControlId), 2000);
          return;
        }
      }

      // Get AI response
      const reply = await getAIResponse(callLegId, transcript, 'inbound');
      await speak(callControlId, reply);

      // Check if AI ended the conversation
      const endSignals = ["have a great day", "have a good day", "goodbye", "best of luck", "take care"];
      if (endSignals.some(s => reply.toLowerCase().includes(s))) {
        setTimeout(() => hangup(callControlId), 5000);
      } else {
        setTimeout(() => gather(callControlId), 2500);
      }
      break;
    }

    case 'call.speak.ended': {
      // Nothing to do — gather is triggered from gather.ended
      break;
    }

    case 'call.hangup': {
      console.log(`[VOICE] Call ended: ${callControlId?.slice(-8)}`);
      delete calls[callLegId];
      break;
    }

    default:
      console.log(`[VOICE] Unhandled event: ${event_type}`);
  }
}

// ── Outbound cold call ──
async function makeCall(toNumber, businessName, industry) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      connection_id: process.env.TELNYX_CONNECTION_ID,
      to: toNumber,
      from: process.env.TELNYX_PHONE,
      webhook_url: `${process.env.BASE_URL}/api/voice`,
      client_state: Buffer.from(JSON.stringify({ businessName, industry, type: 'cold' })).toString('base64'),
    });

    const req = https.request({
      hostname: 'api.telnyx.com',
      path: '/v2/calls',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', resolve);
    req.write(payload);
    req.end();
  });
}

module.exports = { handleWebhook, makeCall };
