// ── Klivio Voice — OpenAI Realtime API + Telnyx Media Streaming ──
// Bidirectional audio bridge: Telnyx ↔ OpenAI Realtime (gpt-4o-realtime)
// μ-law 8kHz both ways — no transcoding, no file serving, no Cartesia
require('dotenv').config();
const WebSocket = require('ws');
const https     = require('https');
const KLIVIO    = require('./klivio-brain');

const DOMAIN = process.env.SERVER_DOMAIN || 'klivio-production.up.railway.app';

// Active call sessions
const sessions = new Map();

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
    case 'call.initiated': {
      sessions.set(callControlId, { callControlId, openaiWs: null, cleanedUp: false });
      await telnyxAction(callControlId, 'answer', {});
      break;
    }

    case 'call.answered': {
      // Ask Telnyx to stream caller audio to our WebSocket
      const streamUrl = `wss://${DOMAIN}/api/voice/stream?call=${encodeURIComponent(callControlId)}`;
      const result = await telnyxAction(callControlId, 'streaming_start', {
        stream_url:   streamUrl,
        stream_track: 'inbound_track',
      });
      if (result?.errors) {
        console.error('[CC] streaming_start error:', JSON.stringify(result.errors));
      } else {
        console.log('[CC] streaming_start OK');
      }
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
// WebSocket handler — Telnyx ↔ OpenAI Realtime bridge
// ─────────────────────────────────────────────────────────────
function handleMediaWebSocket(ws, callControlId) {
  console.log(`[REALTIME] WS connected — ${callControlId?.slice(0, 24)}...`);

  // Get or create session
  let session = sessions.get(callControlId);
  if (!session) {
    session = { callControlId, openaiWs: null, cleanedUp: false };
    sessions.set(callControlId, session);
  }

  // Audio chunks received before OpenAI WS is ready
  const audioQueue = [];
  let openaiReady  = false;

  // ── Connect to OpenAI Realtime ──
  const openaiWs = new WebSocket(
    'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
    {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Beta':   'realtime=v1',
      },
    }
  );
  session.openaiWs = openaiWs;

  openaiWs.on('open', () => {
    console.log('[REALTIME] OpenAI connected');

    // Configure session — μ-law 8kHz both ways (matches Telnyx phone audio)
    openaiWs.send(JSON.stringify({
      type: 'session.update',
      session: {
        modalities:           ['audio', 'text'],
        instructions:         KLIVIO.prompts.phone({ agentName: 'James', callType: 'inbound' }),
        voice:                'echo',        // natural male voice
        input_audio_format:   'g711_ulaw',   // Telnyx phone audio format
        output_audio_format:  'g711_ulaw',   // send back in same format — no transcoding
        turn_detection: {
          type:                 'server_vad', // OpenAI detects when caller stops speaking
          threshold:            0.5,
          prefix_padding_ms:    300,
          silence_duration_ms:  700,
        },
        temperature:                  0.8,
        max_response_output_tokens:   120,
      },
    }));

    // Trigger opening greeting (inject fake user turn so OpenAI speaks first)
    openaiWs.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type:    'message',
        role:    'user',
        content: [{ type: 'input_text', text: '[Call connected. Greet the caller as James from Klivio — one short friendly sentence.]' }],
      },
    }));
    openaiWs.send(JSON.stringify({ type: 'response.create' }));

    // Flush queued audio from caller (arrived before OpenAI was ready)
    openaiReady = true;
    for (const audio of audioQueue) {
      openaiWs.send(JSON.stringify({ type: 'input_audio_buffer.append', audio }));
    }
    audioQueue.length = 0;
  });

  // ── OpenAI → Telnyx: stream audio chunks to caller in real-time ──
  openaiWs.on('message', (rawData) => {
    try {
      const msg = JSON.parse(rawData);

      switch (msg.type) {
        case 'response.audio.delta':
          // Each delta is a small μ-law audio chunk — forward immediately to caller
          if (msg.delta && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ event: 'media', media: { payload: msg.delta } }));
          }
          break;

        case 'response.audio.done':
          // Response audio complete — nothing to do (streaming handles it)
          break;

        case 'input_audio_buffer.speech_started':
          // Caller started talking — clear any AI audio playing (barge-in)
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ event: 'clear' }));
          }
          // Also tell OpenAI to cancel its current response
          openaiWs.send(JSON.stringify({ type: 'response.cancel' }));
          break;

        case 'error':
          console.error('[REALTIME] OpenAI error:', JSON.stringify(msg.error));
          break;
      }
    } catch (e) {
      console.error('[REALTIME] OpenAI message parse error:', e.message);
    }
  });

  // ── Telnyx → OpenAI: pipe caller audio to OpenAI ──
  ws.on('message', (rawData) => {
    try {
      const msg = JSON.parse(rawData);

      if (msg.event === 'media') {
        const audio = msg.media?.payload;
        if (!audio) return;
        if (openaiReady) {
          openaiWs.send(JSON.stringify({ type: 'input_audio_buffer.append', audio }));
        } else {
          audioQueue.push(audio);
        }
      } else if (msg.event === 'start') {
        console.log('[REALTIME] Telnyx stream started — stream_id:', msg.start?.stream_id);
      } else if (msg.event === 'stop') {
        console.log('[REALTIME] Telnyx stream stopped');
        openaiWs.close();
      }
    } catch (e) {
      console.error('[REALTIME] Telnyx WS parse error:', e.message);
    }
  });

  ws.on('close', () => {
    console.log('[REALTIME] Telnyx WS closed');
    if (openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
  });

  ws.on('error', (e) => {
    console.error('[REALTIME] Telnyx WS error:', e.message);
    if (openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
  });

  openaiWs.on('close', () => console.log('[REALTIME] OpenAI WS closed'));
  openaiWs.on('error', (e) => console.error('[REALTIME] OpenAI WS error:', e.message));
}

// ─────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────
function cleanup(session) {
  if (session.cleanedUp) return;
  session.cleanedUp = true;
  if (session.openaiWs?.readyState === WebSocket.OPEN) session.openaiWs.close();
  sessions.delete(session.callControlId);
  console.log(`[REALTIME] Cleaned up: ${session.callControlId.slice(0, 24)}...`);
}

module.exports = { handleCallControlEvent, handleMediaWebSocket };
