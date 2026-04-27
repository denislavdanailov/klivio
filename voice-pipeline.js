// ── Klivio Voice Pipeline — Telnyx Call Control + Groq + Cartesia ──
// transcription_start (Premium) → instant filler → AI → playback_start TTS loop
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
const VOICE_ID = process.env.CARTESIA_VOICE_ID || 'a0e99841-438c-4a64-b679-ae501e7d6091';

// Filler phrases to mask LLM/TTS latency — short, natural acknowledgments
const FILLER_PHRASES = ['Mm-hm.', 'Right.', 'Yeah.', 'Got it.', 'Mm.'];
const FILLER_FILES = []; // populated on init

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
      max_tokens: 60,
      temperature: 0.85,
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
      timeout: 5000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d).choices?.[0]?.message?.content?.trim() || "Sorry — could you say that again?"); }
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
// Cartesia TTS → MP3 buffer
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
// Pre-generate filler audio files on boot (one-time cost)
// ─────────────────────────────────────────────────────────────
(async () => {
  // Wait briefly for env vars / startup
  await new Promise(r => setTimeout(r, 500));
  for (let i = 0; i < FILLER_PHRASES.length; i++) {
    try {
      const audio = await cartesiaTTS(FILLER_PHRASES[i]);
      const fname = `klivio-filler-${i}.mp3`;
      fs.writeFileSync(path.join('/tmp', fname), audio);
      FILLER_FILES.push(fname);
      console.log(`[INIT] Filler ready: "${FILLER_PHRASES[i]}" → ${fname}`);
    } catch (e) {
      console.error(`[INIT] Filler "${FILLER_PHRASES[i]}" failed:`, e.message);
    }
  }
  console.log(`[INIT] ${FILLER_FILES.length}/${FILLER_PHRASES.length} fillers ready`);
})();

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
// Play a random filler immediately (no await on caller path)
// ─────────────────────────────────────────────────────────────
async function playFiller(session) {
  if (!FILLER_FILES.length || session.cleanedUp || session.hanging) return;
  const fname = FILLER_FILES[Math.floor(Math.random() * FILLER_FILES.length)];
  const audioUrl = `https://${DOMAIN}/api/voice/audio/${fname}`;
  session.isSpeaking = true;
  await telnyxAction(session.callControlId, 'playback_start', {
    audio_url: audioUrl,
    client_state: Buffer.from('filler:' + fname).toString('base64'),
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
  if (session.processing || session.cleanedUp) return;
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

      // Start continuous transcription — Telnyx Premium engine 'B' (better accents)
      const trxResult = await telnyxAction(callControlId, 'transcription_start', {
        language: 'en',
        transcription_engine: 'B',
        interim_results_enabled: false,
      });
      if (trxResult?.errors) {
        console.error('[CC] transcription_start error (B):', JSON.stringify(trxResult.errors));
        // Fallback to Google engine
        await telnyxAction(callControlId, 'transcription_start', {
          language: 'en-US',
          transcription_engine: 'A',
          interim_results_enabled: false,
        });
      }
      session.transcribing = true;

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

      // Clean up temp audio file (but NOT pre-generated fillers)
      const clientState = payload?.client_state;
      if (clientState) {
        try {
          const raw = Buffer.from(clientState, 'base64').toString();
          if (!raw.startsWith('filler:')) {
            fs.unlink(path.join('/tmp', raw), () => {});
          }
        } catch {}
      }

      if (session.hanging) {
        setTimeout(() => telnyxAction(callControlId, 'hangup', {}), 600);
      }
      // Otherwise: transcription is always on — just wait for caller speech
      break;
    }

    case 'call.transcription': {
      const session = sessions.get(callControlId);
      if (!session) break;

      const trxData = payload?.transcription_data || {};
      const transcript = trxData.transcript || '';
      const isFinal = trxData.is_final !== false;

      if (!transcript.trim()) break;
      console.log(`[CC] Transcript (final=${isFinal}): "${transcript}"`);

      if (!isFinal) break;

      // Ignore caller speech while we're still talking
      if (session.isSpeaking || session.processing) {
        console.log('[CC] Ignoring transcript — AI is busy');
        break;
      }

      // Fire filler IMMEDIATELY (parallel) to mask LLM+TTS latency
      playFiller(session).catch(() => {});

      // Process AI response in main flow (will interrupt filler when ready)
      await handleTranscript(session, transcript);
      break;
    }

    case 'call.hangup': {
      const session = sessions.get(callControlId);
      if (session) cleanup(session);
      break;
    }

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
