// ── Klivio Voice Pipeline — Telnyx Call Control + Groq + Cartesia ──
// transcription_start for real STT → AI → playback_start TTS loop
require('dotenv').config();
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const KLIVIO = require('./klivio-brain');

const DOMAIN = process.env.SERVER_DOMAIN || 'klivio-production.up.railway.app';

// Cartesia voice — confirmed MALE voices (sonic-2):
//   a0e99841-438c-4a64-b679-ae501e7d6091 — Barbershop Man (casual, friendly)
//   7cf0e2b1-8daf-4fe4-89ad-f6039398f359 — Newsman (professional)
//   729651dc-c6c4-4987-aa9a-b0c30d4d4a88 — Movieman (deep)
//   421b3369-f63f-4b03-8980-37a44df1d4e8 — Friendly Australian Man
const VOICE_ID = process.env.CARTESIA_VOICE_ID || 'a0e99841-438c-4a64-b679-ae501e7d6091';

// Active call sessions
const sessions = new Map();

// ─────────────────────────────────────────────────────────────
// Groq LLM
// ─────────────────────────────────────────────────────────────
function getAIResponse(messages) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: KLIVIO.prompts.phone({ agentName: 'James', callType: 'inbound' }) },
        ...messages.slice(-8),
      ],
      max_tokens: 70,
      temperature: 0.8,
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
      timeout: 6000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d).choices?.[0]?.message?.content?.trim() || "Could you say that again?"); }
        catch { resolve("Sorry, give me just a moment."); }
      });
    });
    req.on('error', () => resolve("Sorry, give me just a moment."));
    req.on('timeout', () => { req.destroy(); resolve("Sorry, give me just a moment."); });
    req.write(payload);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────
// Cartesia TTS → MP3 buffer (with speed control for natural delivery)
// ─────────────────────────────────────────────────────────────
function cartesiaTTS(text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model_id: 'sonic-2',
      transcript: text,
      voice: { mode: 'id', id: VOICE_ID },
      output_format: { container: 'mp3', bit_rate: 128000, sample_rate: 44100 },
      language: 'en',
      speed: 'normal',
    });
    const req = https.request({
      hostname: 'api.cartesia.ai',
      path: '/tts/bytes',
      method: 'POST',
      headers: {
        'Cartesia-Version': '2025-04-16',
        'X-API-Key': process.env.CARTESIA_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 12000,
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < 100) reject(new Error(`Cartesia error: ${buf.toString()}`));
        else resolve(buf);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Cartesia TTS timeout')); });
    req.write(payload);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────
// Telnyx Call Control API
// ─────────────────────────────────────────────────────────────
function telnyxAction(callControlId, action, params = {}) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(params);
    const req = https.request({
      hostname: 'api.telnyx.com',
      path: `/v2/calls/${encodeURIComponent(callControlId)}/actions/${action}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 8000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
    });
    req.on('error', e => { console.error(`[CC] ${action} error:`, e.message); resolve({}); });
    req.on('timeout', () => { req.destroy(); resolve({}); });
    req.write(payload);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────
// Speak: Cartesia → temp MP3 → Telnyx playback_start
// ─────────────────────────────────────────────────────────────
async function speakText(session, text) {
  if (session.cleanedUp) return;
  session.isSpeaking = true;

  try {
    console.log(`[PIPELINE] Saying: "${text.slice(0, 70)}"`);
    const audio = await cartesiaTTS(text);

    const filename = `klivio-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.mp3`;
    const filepath = path.join('/tmp', filename);
    fs.writeFileSync(filepath, audio);

    const audioUrl = `https://${DOMAIN}/api/voice/audio/${filename}`;
    const clientState = Buffer.from(filename).toString('base64');

    const playResult = await telnyxAction(session.callControlId, 'playback_start', {
      audio_url: audioUrl,
      client_state: clientState,
    });

    if (playResult?.errors) {
      console.error('[PIPELINE] playback_start error:', JSON.stringify(playResult.errors));
      session.isSpeaking = false;
    }
  } catch (e) {
    console.error('[PIPELINE] speakText error:', e.message);
    session.isSpeaking = false;
  }
}

// ─────────────────────────────────────────────────────────────
// Handle final transcript from caller
// ─────────────────────────────────────────────────────────────
async function handleTranscript(session, transcript) {
  if (session.processing || session.cleanedUp || session.isSpeaking) return;
  if (!transcript || transcript.trim().length < 2) return;

  session.processing = true;
  try {
    console.log(`[PIPELINE] User said: "${transcript}"`);

    const noSignals = ['not interested', 'no thank you', 'no thanks', 'remove me', "don't call", 'do not call', 'goodbye', 'bye now'];
    if (noSignals.some(s => transcript.toLowerCase().includes(s))) {
      session.hanging = true;
      await speakText(session, "No worries — have a great day!");
      return;
    }

    if (Date.now() - session.startTime > 170000) {
      session.hanging = true;
      await speakText(session, "I don't want to take more of your time. Check klivio dot online for more. Cheers!");
      return;
    }

    session.messages.push({ role: 'user', content: transcript });
    const reply = await getAIResponse(session.messages);
    session.messages.push({ role: 'assistant', content: reply });

    const endSignals = ['have a great day', 'have a good one', 'take care', 'cheers', 'goodbye'];
    if (endSignals.some(s => reply.toLowerCase().includes(s))) session.hanging = true;

    await speakText(session, reply);
  } finally {
    session.processing = false;
  }
}

// ─────────────────────────────────────────────────────────────
// Call Control webhook
// ─────────────────────────────────────────────────────────────
async function handleCallControlEvent(req, res) {
  res.sendStatus(200);

  const event         = req.body?.data?.event_type;
  const payload       = req.body?.data?.payload;
  const callControlId = payload?.call_control_id;

  if (!event || !callControlId) return;
  console.log(`[CC] ${event} — ${callControlId.slice(0, 20)}...`);

  switch (event) {
    case 'call.initiated': {
      sessions.set(callControlId, {
        callControlId,
        messages:    [],
        isSpeaking:  false,
        processing:  false,
        hanging:     false,
        cleanedUp:   false,
        transcribing: false,
        startTime:   Date.now(),
      });
      await telnyxAction(callControlId, 'answer', {});
      break;
    }

    case 'call.answered': {
      const session = sessions.get(callControlId);
      if (!session) break;

      // Start continuous transcription (Google engine)
      const trxResult = await telnyxAction(callControlId, 'transcription_start', {
        language: 'en',
        transcription_engine: 'A',
        interim_results_enabled: false,
      });
      if (trxResult?.errors) {
        console.error('[CC] transcription_start error:', JSON.stringify(trxResult.errors));
      } else {
        session.transcribing = true;
      }

      // Speak greeting
      await speakText(session, "Hey, James here from Klivio — how can I help?");
      break;
    }

    case 'call.playback.started': {
      const session = sessions.get(callControlId);
      if (session) session.isSpeaking = true;
      break;
    }

    case 'call.playback.ended': {
      const session = sessions.get(callControlId);
      if (!session) break;
      session.isSpeaking = false;

      // Clean up temp audio file
      const clientState = payload?.client_state;
      if (clientState) {
        try {
          const filename = Buffer.from(clientState, 'base64').toString();
          fs.unlink(path.join('/tmp', filename), () => {});
        } catch {}
      }

      if (session.hanging) {
        setTimeout(() => telnyxAction(callControlId, 'hangup', {}), 600);
      }
      // Otherwise: transcription is already running — just wait for caller
      break;
    }

    case 'call.transcription': {
      const session = sessions.get(callControlId);
      if (!session) break;

      const trxData = payload?.transcription_data || {};
      const transcript = trxData.transcript || '';
      const isFinal = trxData.is_final !== false; // default true if undefined

      if (!transcript.trim()) break;
      console.log(`[CC] Transcript (final=${isFinal}): "${transcript}"`);

      if (!isFinal) break;

      // Ignore caller speech while we're still talking (avoid AI hearing itself)
      if (session.isSpeaking) {
        console.log('[CC] Ignoring transcript — AI is speaking');
        break;
      }

      await handleTranscript(session, transcript);
      break;
    }

    case 'call.hangup': {
      const session = sessions.get(callControlId);
      if (session) cleanup(session);
      break;
    }

    // Ignore unused legacy streaming events
    case 'call.streaming.started':
    case 'call.streaming.stopped':
    case 'streaming.started':
    case 'streaming.failed':
      break;
  }
}

// ─────────────────────────────────────────────────────────────
// WebSocket handler — kept for compatibility but not used
// ─────────────────────────────────────────────────────────────
function handleMediaWebSocket(ws, callControlId) {
  console.log('[PIPELINE] WS connected (not used):', callControlId);
  ws.close();
}

// ─────────────────────────────────────────────────────────────
// Cleanup session
// ─────────────────────────────────────────────────────────────
function cleanup(session) {
  if (session.cleanedUp) return;
  session.cleanedUp = true;
  sessions.delete(session.callControlId);
  console.log(`[PIPELINE] Cleaned up: ${session.callControlId.slice(0, 20)}...`);
}

module.exports = { handleCallControlEvent, handleMediaWebSocket };
