// ── Klivio Voice Pipeline — Telnyx Call Control + Groq + Cartesia ──
// Call Control gather approach: speak → gather speech → AI → speak → repeat
require('dotenv').config();
const https = require('https');
const fs    = require('fs');
const path  = require('path');
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
        id: process.env.CARTESIA_VOICE_ID || '694f9389-aac1-45b6-b726-9d9369183238',
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
      path: `/v2/calls/${callControlId}/actions/${action}`,
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

    const playResult = await telnyxAction(session.callControlId, 'play_audio', {
      urls: [audioUrl],
      client_state: clientState,
    });
    console.log('[PIPELINE] play_audio response:', JSON.stringify(playResult).slice(0, 300));
    // isSpeaking = false is set when call.playback.ended fires
  } catch (e) {
    console.error('[PIPELINE] speakText error:', e.message);
    session.isSpeaking = false;
    // On TTS failure, still try to gather so the call doesn't die
    if (!session.hanging && !session.cleanedUp) {
      startGather(session);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Start gathering caller's speech
// ─────────────────────────────────────────────────────────────
async function startGather(session) {
  if (session.cleanedUp || session.hanging) return;
  console.log('[PIPELINE] Gathering speech...');
  await telnyxAction(session.callControlId, 'gather', {
    input: ['speech'],
    speech_timeout: 'auto',
    speech_end_timeout: 1500,
    language: 'en-US',
    minimum_digits: 0,
  });
}

// ─────────────────────────────────────────────────────────────
// Handle speech from caller
// ─────────────────────────────────────────────────────────────
async function handleTranscript(session, transcript) {
  if (session.processing || session.cleanedUp) return;
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
// Call Control webhook — handles all Telnyx call events
// ─────────────────────────────────────────────────────────────
async function handleCallControlEvent(req, res) {
  res.sendStatus(200); // ACK immediately — Telnyx requires fast response

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
        startTime:   Date.now(),
      });
      await telnyxAction(callControlId, 'answer', {});
      break;
    }

    case 'call.answered': {
      const session = sessions.get(callControlId);
      if (!session) break;
      // Speak greeting immediately — no WebSocket needed
      await speakText(session, "Hey, thanks for calling Klivio — this is James. How can I help?");
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
        // End of conversation — hang up
        setTimeout(() => telnyxAction(callControlId, 'hangup', {}), 800);
      } else {
        // Listen for caller's response
        await startGather(session);
      }
      break;
    }

    case 'call.gather.ended': {
      const session = sessions.get(callControlId);
      if (!session) break;

      // Extract speech result from payload
      const speechResult = payload?.speech_result
        || payload?.digits
        || '';

      console.log(`[CC] Gather ended — speech: "${speechResult}"`);

      if (!speechResult.trim()) {
        // No speech detected
        if (!session.hanging) {
          await speakText(session, "I didn't quite catch that — could you say that again?");
        }
        break;
      }

      await handleTranscript(session, speechResult);
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
      // Ignore — we're not using WebSocket streaming anymore
      break;
  }
}

// ─────────────────────────────────────────────────────────────
// WebSocket handler — kept for compatibility but not used
// ─────────────────────────────────────────────────────────────
function handleMediaWebSocket(ws, callControlId) {
  console.log('[PIPELINE] WS connected (not used in gather mode):', callControlId);
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
