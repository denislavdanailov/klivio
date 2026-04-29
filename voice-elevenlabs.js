// ── Klivio Voice — ElevenLabs Conversational AI + Telnyx Media Streaming ──
// Bidirectional audio bridge: Telnyx ↔ ElevenLabs Conversational AI
// Transcoding: G.711 μ-law 8kHz (Telnyx) ↔ PCM s16le 16kHz (ElevenLabs)
require('dotenv').config();
const WebSocket = require('ws');
const https     = require('https');
const KLIVIO    = require('./klivio-brain');
const DB        = require('./db');

const DOMAIN      = process.env.SERVER_DOMAIN || 'klivio-production.up.railway.app';
const EL_API_KEY  = process.env.ELEVENLABS_API_KEY;
const EL_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;

const sessions = new Map();

// ─── G.711 μ-law ↔ PCM s16le codec (no external deps) ────────────────────────

// μ-law decode table (Sun/CCITT reference — verified against ITU-T G.711)
const EXP_LUT  = [0, 132, 396, 924, 1980, 4092, 8316, 16764];
const ULAW_DEC = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  const u    = ~i & 0xFF;
  const sign = u & 0x80 ? -1 : 1;
  const exp  = (u >> 4) & 0x07;
  const mant = u & 0x0F;
  ULAW_DEC[i] = sign * (EXP_LUT[exp] + (mant << (exp + 3)));
}

// μ-law encode: int16 linear → μ-law byte
function ulawEncode(s) {
  const sign = s < 0 ? 0x80 : 0;
  if (s < 0) s = -s;
  if (s > 32635) s = 32635;
  s += 132; // BIAS
  let exp = 7, mask = 0x4000;
  while ((s & mask) === 0 && exp > 0) { exp--; mask >>= 1; }
  const mant = (s >> (exp + 3)) & 0x0F;
  return (~(sign | (exp << 4) | mant)) & 0xFF;
}

// Telnyx base64 μ-law 8kHz → base64 PCM s16le 16kHz (upsample 2x, linear interp)
function telnyxToEL(b64) {
  const ulaw = Buffer.from(b64, 'base64');
  const n    = ulaw.length;
  const pcm  = Buffer.allocUnsafe(n * 4); // 2× samples × 2 bytes
  for (let i = 0; i < n; i++) {
    const s0 = ULAW_DEC[ulaw[i]];
    const s1 = i + 1 < n ? ULAW_DEC[ulaw[i + 1]] : s0;
    pcm.writeInt16LE(s0,                         i * 4);
    pcm.writeInt16LE(Math.round((s0 + s1) / 2), i * 4 + 2);
  }
  return pcm.toString('base64');
}

// ElevenLabs base64 PCM s16le 16kHz → base64 μ-law 8kHz (downsample 2x, avg)
function elToTelnyx(b64) {
  const pcm  = Buffer.from(b64, 'base64');
  const n    = Math.floor(pcm.length / 4); // pairs of int16 → one output sample
  const ulaw = Buffer.allocUnsafe(n);
  for (let i = 0; i < n; i++) {
    const s0   = pcm.readInt16LE(i * 4);
    const s1   = (i * 4 + 2) < pcm.length ? pcm.readInt16LE(i * 4 + 2) : s0;
    ulaw[i]    = ulawEncode(Math.round((s0 + s1) / 2));
  }
  return ulaw.toString('base64');
}

// ─────────────────────────────────────────────────────────────
// Telnyx Call Control API helper
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
// Telnyx Call Control webhook
// ─────────────────────────────────────────────────────────────
async function handleCallControlEvent(req, res) {
  res.sendStatus(200);

  const event         = req.body?.data?.event_type;
  const payload       = req.body?.data?.payload;
  const callControlId = payload?.call_control_id;

  if (!event || !callControlId) return;
  console.log(`[CC] ${event} — ${callControlId.slice(0, 24)}...`);

  switch (event) {
    case 'call.initiated':
      sessions.set(callControlId, { callControlId, elWs: null, cleanedUp: false });
      await telnyxAction(callControlId, 'answer', {});
      break;

    case 'call.answered': {
      const streamUrl = `wss://${DOMAIN}/api/voice/stream?call=${encodeURIComponent(callControlId)}`;
      const result = await telnyxAction(callControlId, 'streaming_start', {
        stream_url:   streamUrl,
        stream_track: 'inbound_track',
      });
      if (result?.errors) console.error('[CC] streaming_start error:', JSON.stringify(result.errors));
      else console.log('[CC] streaming_start OK');
      break;
    }

    case 'call.hangup': {
      const session = sessions.get(callControlId);
      if (session) cleanup(session);
      break;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// WebSocket bridge — Telnyx ↔ ElevenLabs Conversational AI
// ─────────────────────────────────────────────────────────────
function handleMediaWebSocket(ws, callControlId) {
  console.log(`[EL] WS connected — ${callControlId?.slice(0, 24)}...`);

  if (!EL_API_KEY || !EL_AGENT_ID) {
    console.error('[EL] Missing ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID — check Railway env vars');
    ws.close();
    return;
  }

  let session = sessions.get(callControlId);
  if (!session) {
    session = { callControlId, elWs: null, cleanedUp: false };
    sessions.set(callControlId, session);
  }

  // Buffer caller audio that arrives before ElevenLabs WS opens
  const audioQueue = [];
  let elReady = false;

  // ── Connect to ElevenLabs Conversational AI ──
  // output_format=ulaw_8000 → ElevenLabs encodes natively to μ-law 8kHz,
  // so we forward audio bytes to Telnyx with ZERO transcoding (no artifacts).
  const elWs = new WebSocket(
    `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${EL_AGENT_ID}&output_format=ulaw_8000`,
    { headers: { 'xi-api-key': EL_API_KEY } }
  );
  session.elWs = elWs;

  elWs.on('open', () => {
    console.log('[EL] ElevenLabs connected');

    // Override agent config for this call — system prompt + opening line
    elWs.send(JSON.stringify({
      type: 'conversation_initiation_client_data',
      conversation_config_override: {
        agent: {
          prompt: {
            prompt: KLIVIO.prompts.phone({ agentName: 'James', callType: 'inbound' }),
          },
          first_message: "Hey, this is James from Klivio! How can I help you today?",
        },
      },
    }));

    // Flush queued caller audio
    elReady = true;
    for (const chunk of audioQueue) {
      elWs.send(JSON.stringify({ user_audio_chunk: chunk }));
    }
    audioQueue.length = 0;
  });

  // ── ElevenLabs → Telnyx: stream audio + handle barge-in ──
  elWs.on('message', (rawData) => {
    try {
      const msg = JSON.parse(rawData);

      switch (msg.type) {
        case 'audio':
          // Forward AI voice chunk to caller — already μ-law 8kHz (output_format=ulaw_8000),
          // pass through directly with no transcoding so quality is preserved.
          if (msg.audio_event?.audio_base_64 && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              event: 'media',
              media: { payload: msg.audio_event.audio_base_64 },
            }));
          }
          break;

        case 'interruption':
          // Caller started talking — clear AI audio from Telnyx buffer (barge-in)
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ event: 'clear' }));
          }
          break;

        case 'ping':
          // ElevenLabs keep-alive — must respond or connection drops
          elWs.send(JSON.stringify({ type: 'pong', event_id: msg.ping_event?.event_id }));
          break;

        case 'agent_response':
          console.log('[EL] Agent:', (msg.agent_response_event?.agent_response || '').slice(0, 80));
          break;

        case 'user_transcript':
          console.log('[EL] Caller:', msg.user_transcription_event?.user_transcript || '');
          break;

        case 'conversation_initiation_metadata':
          session.conversationId = msg.conversation_initiation_metadata_event?.conversation_id;
          console.log('[EL] Conversation ID:', session.conversationId);
          break;

        case 'error':
          console.error('[EL] ElevenLabs error:', JSON.stringify(msg));
          break;
      }
    } catch (e) {
      console.error('[EL] EL message parse error:', e.message);
    }
  });

  // ── Telnyx → ElevenLabs: pipe caller audio (μ-law→PCM) ──
  ws.on('message', (rawData) => {
    try {
      const msg = JSON.parse(rawData);

      if (msg.event === 'media') {
        const raw = msg.media?.payload;
        if (!raw) return;
        const chunk = telnyxToEL(raw); // convert μ-law 8kHz → PCM 16kHz
        if (elReady) {
          elWs.send(JSON.stringify({ user_audio_chunk: chunk }));
        } else {
          audioQueue.push(chunk);
        }
      } else if (msg.event === 'start') {
        console.log('[EL] Telnyx stream started — stream_id:', msg.start?.stream_id);
      } else if (msg.event === 'stop') {
        console.log('[EL] Telnyx stream stopped');
        elWs.close();
      }
    } catch (e) {
      console.error('[EL] Telnyx WS parse error:', e.message);
    }
  });

  ws.on('close', () => {
    console.log('[EL] Telnyx WS closed');
    if (elWs.readyState === WebSocket.OPEN) elWs.close();
  });

  ws.on('error', (e) => {
    console.error('[EL] Telnyx WS error:', e.message);
    if (elWs.readyState === WebSocket.OPEN) elWs.close();
  });

  elWs.on('close', () => console.log('[EL] ElevenLabs WS closed'));
  elWs.on('error', (e) => console.error('[EL] ElevenLabs WS error:', e.message));
}

// ─────────────────────────────────────────────────────────────
// Cleanup — save call record to DB
// ─────────────────────────────────────────────────────────────
async function cleanup(session) {
  if (session.cleanedUp) return;
  session.cleanedUp = true;
  if (session.elWs?.readyState === WebSocket.OPEN) session.elWs.close();
  sessions.delete(session.callControlId);
  console.log(`[EL] Cleaned up: ${session.callControlId.slice(0, 24)}...`);

  // Save call record to DB (so every call is tracked, even if no sale)
  try {
    await DB.createOrder({
      source:   'phone',
      product:  'Voice Assistant',  // what they called about — update if sale confirmed
      status:   'new',
      call_id:  session.conversationId || session.callControlId,
      notes:    `Inbound call. ElevenLabs conversation: ${session.conversationId || 'unknown'}`,
    });
  } catch (e) {
    console.error('[EL] Failed to save call record:', e.message);
  }
}

module.exports = { handleCallControlEvent, handleMediaWebSocket };
