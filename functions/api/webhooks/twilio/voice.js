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

/**
 * Parses a URL-encoded form body into a key-value object.
 */
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

export async function onRequestPost(context) {
  const { env } = context;

  try {
    // 1. Parse form-encoded body
    const rawBody = await context.request.text();
    const params = parseFormBody(rawBody);

    // 2. Validate Twilio signature
    const signature = context.request.headers.get('X-Twilio-Signature') || '';
    const url = context.request.url;

    const isValid = await verifyTwilioSignature(url, params, signature, env.TWILIO_AUTH_TOKEN);
    if (!isValid) {
      return twimlResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Request validation failed.</Say></Response>',
        403,
      );
    }

    // 3. Return TwiML that connects to ElevenLabs agent.
    //    ElevenLabs will call our conversation-init webhook to get
    //    dynamic variables and config overrides for this specific caller.
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
    console.error('[twilio-voice-webhook] Error:', err.message || err);
    return twimlResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred. Please try again later.</Say></Response>',
      500,
    );
  }
}

/**
 * Escapes a string for safe inclusion in XML.
 */
function escapeXml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
