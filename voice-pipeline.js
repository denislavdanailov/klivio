// ── Klivio Voice Pipeline — Telnyx + Deepgram + Groq + Cartesia ──
// Real-time: ~500ms latency, natural human voice, no choppy delays
require('dotenv').config();
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const KLIVIO = require('./klivio-brain');

const DOMAIN = process.env.SERVER_DOMAIN || 'klivio-production.up.railway.app';

// Active call sessions: callControlId → session object
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
      max_tokens: 80,
      temperature: 0.7,
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
      timeout: 8000,
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
// Cartesia TTS → MP3 buffer
// ─────────────────────────────────────────────────────────────
function cartesiaTTS(text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model_id: 'sonic-2',
      transcript: text,
      voice: {
        mode: 'id',
        id: process.env.CARTESIA_VOICE_ID || '694f9389-aac1-45b6-b726-9d9369183238', // "Archer" deep British male
      },
      output_format: { container: 'mp3', bit_rate: 128000, sample_rate: 44100 },
      language: 'en',
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
      res.on('end', () => resolve(Buffer.concat(chunks)));
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
      path: `/v2/calls/${callControlId}/actions/${action}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 6000,
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
// Speak: Cartesia → temp MP3 → Telnyx play_audio
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

    await telnyxAction(session.callControlId, 'play_audio', {
      urls: [audioUrl],
      client_state: clientState,
    });

    // isSpeaking = false will be set when call.playback.ended fires
  } catch (e) {
    console.error('[PIPELINE] speakText error:', e.message);
    session.isSpeaking = false; // fallback — don't block forever
  }
}

// ─────────────────────────────────────────────────────────────
// Handle final transcript from user
// ─────────────────────────────────────────────────────────────
async function handleTranscript(session, transcript) {
  if (session.isSpeaking || session.processing || session.cleanedUp) return;
  session.processing = true;

  try {
    console.log(`[PIPELINE] User said: "${transcript}"`);

    const noSignals = ['not interested', 'no thank you', 'no thanks', 'remove me', "don't call", 'do not call', 'goodbye', 'bye'];
    if (noSignals.some(s => transcript.toLowerCase().includes(s))) {
      session.hanging = true;
      await speakText(session, "No problem at all. Have a great day!");
      return;
    }

    if (Date.now() - session.startTime > 170000) {
      session.hanging = true;
      await speakText(session, "I don't want to take more of your time. Check out klivio.online for more. Have a great day!");
      return;
    }

    session.messages.push({ role: 'user', content: transcript });
    const reply = await getAIResponse(session.messages);
    session.messages.push({ role: 'assistant', content: reply });

    const endSignals = ['have a great day', 'have a good day', 'take care', 'best of luck', 'goodbye'];
    if (endSignals.some(s => reply.toLowerCase().includes(s))) session.hanging = true;

    await speakText(session, reply);
  } finally {
    session.processing = false;
  }
}

// ─────────────────────────────────────────────────────────────
// WebSocket handler — called from server.js on HTTP upgrade
// ─────────────────────────────────────────────────────────────
function handleMediaWebSocket(ws, callControlId) {
  const session = sessions.get(callControlId);
  if (!session) {
    console.error('[PIPELINE] No session found for call:', callControlId);
    ws.close();
    return;
  }
  session.ws = ws;
  console.log(`[PIPELINE] WS connected: ${callControlId}`);

  // Deepgram live STT
  const dg = createClient(process.env.DEEPGRAM_API_KEY);
  const dgConn = dg.listen.live({
    model: 'nova-2-phonecall',
    language: 'en-US',
    smart_format: true,
    no_delay: true,
    endpointing: 400,       // 400ms silence = end of utterance
    interim_results: false,
    encoding: 'mulaw',
    sample_rate: 8000,
    channels: 1,
  });
  session.dgConn = dgConn;

  dgConn.on(LiveTranscriptionEvents.Open, () => {
    console.log('[PIPELINE] Deepgram STT ready');
    // Greet after 800ms (enough for audio to stabilise)
    setTimeout(() => speakText(session, "Hey, thanks for calling Klivio — this is James. How can I help?"), 800);
  });

  dgConn.on(LiveTranscriptionEvents.Transcript, async (data) => {
    const transcript = data.channel?.alternatives?.[0]?.transcript?.trim();
    if (!transcript || !data.is_final) return;
    await handleTranscript(session, transcript);
  });

  dgConn.on(LiveTranscriptionEvents.Error, err => {
    console.error('[PIPELINE] Deepgram error:', err);
  });

  // Receive μ-law audio from Telnyx, forward to Deepgram
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.event === 'media' && !session.isSpeaking) {
        const chunk = Buffer.from(msg.media.payload, 'base64');
        if (dgConn.getReadyState() === 1) dgConn.send(chunk);
      } else if (msg.event === 'stop') {
        cleanup(session);
      }
    } catch {
      // Raw binary audio (no JSON wrapper)
      if (!session.isSpeaking && dgConn.getReadyState() === 1) {
        dgConn.send(data);
      }
    }
  });

  ws.on('close', () => {
    console.log(`[PIPELINE] WS closed: ${callControlId}`);
    cleanup(session);
  });

  ws.on('error', err => {
    console.error('[PIPELINE] WS error:', err.message);
    cleanup(session);
  });
}

// ─────────────────────────────────────────────────────────────
// Call Control webhook — handles all Telnyx call events
// ─────────────────────────────────────────────────────────────
async function handleCallControlEvent(req, res) {
  res.sendStatus(200); // ACK immediately — Telnyx requires fast response

  const event         = req.body?.data?.event_type;
  const payload       = req.body?.data?.payload;
  const callControlId = payload?.call_control_id;

  if (!event || !callControlId) return;
  console.log(`[CC] ${event} — ${callControlId}`);

  switch (event) {
    case 'call.initiated': {
      // New inbound call — create session and answer
      sessions.set(callControlId, {
        callControlId,
        messages:    [],
        isSpeaking:  false,
        processing:  false,
        hanging:     false,
        cleanedUp:   false,
        startTime:   Date.now(),
      });
      await telnyxAction(callControlId, 'answer', {});
      break;
    }

    case 'call.answered': {
      // Start streaming audio to our WebSocket
      await telnyxAction(callControlId, 'streaming_start', {
        stream_url:   `wss://${DOMAIN}/api/voice/stream?call=${encodeURIComponent(callControlId)}`,
        stream_track: 'inbound_track',
      });
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

      // If conversation is done, hang up after a brief pause
      if (session.hanging) {
        setTimeout(() => telnyxAction(callControlId, 'hangup', {}), 800);
      }
      break;
    }

    case 'call.hangup': {
      const session = sessions.get(callControlId);
      if (session) cleanup(session);
      break;
    }

    case 'call.streaming.started':
      console.log('[CC] Streaming started — Deepgram will connect via WS');
      break;

    case 'call.streaming.stopped':
      console.log('[CC] Streaming stopped');
      break;
  }
}

// ─────────────────────────────────────────────────────────────
// Cleanup session
// ─────────────────────────────────────────────────────────────
function cleanup(session) {
  if (session.cleanedUp) return;
  session.cleanedUp = true;
  try { session.dgConn?.finish(); } catch {}
  sessions.delete(session.callControlId);
  console.log(`[PIPELINE] Cleaned up: ${session.callControlId}`);
}

module.exports = { handleCallControlEvent, handleMediaWebSocket };
