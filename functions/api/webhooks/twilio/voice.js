/**
 * POST /api/webhooks/twilio/voice
 *
 * Handles inbound Twilio voice webhooks.
 * Validates the Twilio signature and returns TwiML that connects the call
 * to the ElevenLabs agent via WebSocket stream.
 *
 * All caller identification, routing, and agent config overrides are now
 * handled by the ElevenLabs Conversation Initiation Client Data webhook
 * at /api/webhooks/elevenlabs/conversation-init. This endpoint only needs
 * to bridge Twilio → ElevenLabs.
 */

import { verifyTwilioSignature } from '../../../lib/webhooks.js';

function twimlResponse(twiml, status = 200) {
  return new Response(twiml, {
    status,
    headers: { 'Content-Type': 'text/xml' },
  });
}

function parseFormBody(body) {
  const params = {};
  if (!body) return params;
  const pairs = body.split('&');
  for (const pair of pairs) {
    const [key, ...rest] = pair.split('=');
    if (key) {
      params[decodeURIComponent(key)] = decodeURIComponent(rest.join('=').replace(/\+/g, ' '));
    }
  }
  return params;
}

function escapeXml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function onRequestPost(context) {
  const { env } = context;

  try {
    const rawBody = await context.request.text();
    const params = parseFormBody(rawBody);

    console.log(`[twilio-voice] Inbound: From=${params.From} Called=${params.Called} Sid=${params.CallSid}`);

    const signature = context.request.headers.get('X-Twilio-Signature') || '';
    const isValid = await verifyTwilioSignature(context.request.url, params, signature, env.TWILIO_AUTH_TOKEN);
    if (!isValid) {
      console.error('[twilio-voice] Signature validation failed');
      return twimlResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Request validation failed.</Say></Response>',
        403,
      );
    }

    const agentId = env.ELEVENLABS_AGENT_ID;

    const twiml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Response>',
      '  <Connect>',
      `    <Stream url="wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${escapeXml(agentId)}">`,
      '    </Stream>',
      '  </Connect>',
      '</Response>',
    ].join('\n');

    return twimlResponse(twiml);
  } catch (err) {
    console.error('[twilio-voice] Error:', err.message || err);
    return twimlResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred. Please try again later.</Say></Response>',
      500,
    );
  }
}
