/**
 * POST /api/webhooks/twilio/sms
 *
 * Handles inbound Twilio SMS webhooks for task dispatch.
 * When an owner texts their OpenCawl number with a phone number and goal,
 * the system dispatches an outbound AI call.
 *
 * Flow:
 *   1. Parse form-encoded body (From, To, Body)
 *   2. Verify Twilio signature
 *   3. Look up owner of the To number
 *   4. If sender is not the owner, return TwiML rejection
 *   5. Parse Body for E.164 phone number
 *   6. If no phone found, reply with TwiML asking for clarification
 *   7. If phone found, create call record with source: 'sms_dispatch', initiate outbound call
 *   8. Reply with TwiML confirming dispatch or error
 */

import { verifyTwilioSignature } from '../../../lib/webhooks.js';
import { isValidE164 } from '../../../lib/validation.js';
import { buildElevenLabsPayload } from '../../../lib/agent-overrides.js';

/**
 * Returns a TwiML XML response with a <Message> body.
 * @param {string} message - The SMS reply text
 * @param {number} status - HTTP status code
 * @returns {Response}
 */
function twimlMessage(message, status = 200) {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`;
  return new Response(twiml, {
    status,
    headers: { 'Content-Type': 'text/xml' },
  });
}

/**
 * Parses a URL-encoded form body into a key-value object.
 * @param {string} body - The raw URL-encoded body string
 * @returns {Record<string, string>}
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

/**
 * Extracts an E.164 phone number from a message body.
 * @param {string} body - The SMS message body
 * @returns {{ phone: string|null, goal: string }}
 */
function parseDispatchMessage(body) {
  if (!body || typeof body !== 'string') {
    return { phone: null, goal: '' };
  }

  const match = body.match(/\+\d{1,15}/);
  if (!match) {
    return { phone: null, goal: body.trim() };
  }

  const phone = match[0];
  // Goal is the remainder of the message minus the phone number, trimmed
  const goal = body.replace(phone, '').trim();
  return { phone, goal };
}

export async function onRequestPost(context) {
  const { env } = context;
  const db = env.DB;

  try {
    // 1. Parse form-encoded body
    const rawBody = await context.request.text();
    const params = parseFormBody(rawBody);

    const from = params.From || '';
    const to = params.To || '';
    const body = params.Body || '';

    // 2. Verify Twilio signature
    const signature = context.request.headers.get('X-Twilio-Signature') || '';
    const url = context.request.url;

    const isValid = await verifyTwilioSignature(url, params, signature, env.TWILIO_AUTH_TOKEN);
    if (!isValid) {
      return twimlMessage('Request validation failed.', 403);
    }

    // 3. Look up owner of the To number
    const owner = await db
      .prepare('SELECT * FROM users WHERE twilio_phone_number = ?')
      .bind(to)
      .first();

    if (!owner) {
      return twimlMessage('This number is not configured.');
    }

    // 4. If sender is not the owner, reject
    if (from !== owner.phone) {
      return twimlMessage('This number does not accept SMS from unknown senders.');
    }

    // 5. Parse Body for E.164 phone number
    const { phone: destinationPhone, goal } = parseDispatchMessage(body);

    // 6. If no phone number found, ask for clarification
    if (!destinationPhone) {
      return twimlMessage(
        'Please include a phone number in E.164 format (e.g. +15551234567) and your instructions for the call.'
      );
    }

    // Validate the extracted phone number
    if (!isValidE164(destinationPhone)) {
      return twimlMessage(
        'The phone number provided is not valid. Please use E.164 format (e.g. +15551234567).'
      );
    }

    // 7. Create call record with source: 'sms_dispatch'
    const callId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db
      .prepare(
        'INSERT INTO calls (id, user_id, direction, destination_phone, status, goal, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(callId, owner.id, 'outbound', destinationPhone, 'pending', goal || null, 'sms_dispatch', now, now)
      .run();

    // Initiate ElevenLabs outbound call
    const agentId = env.ELEVENLABS_AGENT_ID;
    const elevenLabsKey = env.ELEVENLABS_API_KEY;
    const fromNumber = owner.twilio_phone_number || env.TWILIO_DEFAULT_NUMBER;

    const overrides = {};
    if (goal) {
      overrides.system_prompt = `Your goal for this call: ${goal}`;
    }

    const payload = buildElevenLabsPayload(agentId, fromNumber, destinationPhone, owner, overrides);

    // Add call_id to dynamic variables so post-call webhook can link back
    if (payload.conversation_initiation_client_data?.dynamic_variables) {
      payload.conversation_initiation_client_data.dynamic_variables.call_id = callId;
    }

    const elResponse = await fetch(
      'https://api.elevenlabs.io/v1/convai/twilio/outbound-call',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': elevenLabsKey,
        },
        body: JSON.stringify(payload),
      },
    );

    if (!elResponse.ok) {
      const errText = await elResponse.text().catch(() => '');
      console.error('[twilio-sms] Outbound call failed:', elResponse.status, errText);

      // Update call status to failed
      await db
        .prepare('UPDATE calls SET status = ?, updated_at = ? WHERE id = ?')
        .bind('failed', new Date().toISOString(), callId)
        .run();

      return twimlMessage('Failed to dispatch the call. Please try again.');
    }

    // 8. Reply with TwiML confirming dispatch
    const confirmMsg = goal
      ? `Call dispatched to ${destinationPhone}. Goal: ${goal}`
      : `Call dispatched to ${destinationPhone}.`;

    return twimlMessage(confirmMsg);
  } catch (err) {
    console.error('[twilio-sms] Error:', err.message || err);
    return twimlMessage('An error occurred. Please try again later.', 500);
  }
}
