/**
 * POST /api/webhooks/twilio/voice
 * Handles inbound Twilio voice webhooks.
 * Validates signature, classifies caller (owner / unknown-shared / unknown-dedicated),
 * and returns the appropriate TwiML to route the call.
 */

import { verifyTwilioSignature } from '../../../lib/webhooks.js';
import { classifyCaller, buildInboundTwiml } from '../../../lib/inbound-routing.js';

/**
 * Returns a TwiML XML response.
 * @param {string} twiml - The TwiML XML body
 * @param {number} status - HTTP status code
 * @returns {Response}
 */
function twimlResponse(twiml, status = 200) {
  return new Response(twiml, {
    status,
    headers: { 'Content-Type': 'text/xml' },
  });
}

/**
 * Generates a simple UUID v4 using crypto.getRandomValues.
 * @returns {string}
 */
function generateId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
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

export async function onRequestPost(context) {
  const { env } = context;
  const db = env.DB;

  try {
    // 1. Parse form-encoded body
    const rawBody = await context.request.text();
    const params = parseFormBody(rawBody);

    // 2. Extract key params
    const calledNumber = params.Called || '';
    const callerNumber = params.From || '';
    const callSid = params.CallSid || '';

    // 3. Validate Twilio signature
    const signature = context.request.headers.get('X-Twilio-Signature') || '';
    const url = context.request.url;

    const isValid = await verifyTwilioSignature(url, params, signature, env.TWILIO_AUTH_TOKEN);
    if (!isValid) {
      return twimlResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Request validation failed.</Say></Response>',
        403,
      );
    }

    // 4. Determine if the called number is a shared number
    const sharedRow = await db
      .prepare('SELECT phone_number FROM shared_phone_numbers WHERE phone_number = ?')
      .bind(calledNumber)
      .first();
    const isSharedNumber = !!sharedRow;

    // 5. Look up owner by Twilio phone number (the number that was called)
    const owner = await db
      .prepare('SELECT * FROM users WHERE twilio_phone_number = ?')
      .bind(calledNumber)
      .first();

    if (!owner) {
      return twimlResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, this number is not configured. Please try again later.</Say></Response>',
      );
    }

    // 6. Classify the caller
    const classification = classifyCaller(callerNumber, owner, isSharedNumber);
    const agentId = env.ELEVENLABS_AGENT_ID;

    // 7. Route based on classification
    if (classification === 'owner') {
      // Owner Call: create call record, connect with owner's stored agent config
      const callId = generateId();
      const now = new Date().toISOString();

      await db
        .prepare(
          'INSERT INTO calls (id, user_id, direction, destination_phone, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(callId, owner.id, 'inbound', callerNumber, 'in_progress', now, now)
        .run();

      const twiml = buildInboundTwiml('owner', {
        owner,
        agentId,
        callId,
        callerNumber,
      });

      return twimlResponse(twiml);
    }

    if (classification === 'unknown_shared') {
      // Unknown on Shared: promo TwiML + hangup, NO call record
      const twiml = buildInboundTwiml('unknown_shared');
      return twimlResponse(twiml);
    }

    // classification === 'unknown_dedicated'
    // Query accepted_numbers for this user
    const acceptedRows = await db
      .prepare('SELECT phone_number FROM accepted_numbers WHERE user_id = ?')
      .bind(owner.id)
      .all();
    const acceptedNumbers = (acceptedRows.results || []).map((r) => r.phone_number);

    const isOpenAccess = acceptedNumbers.length === 0;
    const isAccepted = acceptedNumbers.includes(callerNumber);

    if (!isOpenAccess && !isAccepted) {
      // Rejected: not in accepted list, list is non-empty
      const twiml = buildInboundTwiml('unknown_dedicated', {
        owner,
        agentId,
        callId: '',
        callerNumber,
        acceptedNumbers,
        callHistory: [],
      });
      return twimlResponse(twiml);
    }

    // Accepted (open access or in list): create call record, query call history
    const callId = generateId();
    const now = new Date().toISOString();

    await db
      .prepare(
        'INSERT INTO calls (id, user_id, direction, destination_phone, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(callId, owner.id, 'inbound', callerNumber, 'in_progress', now, now)
      .run();

    // Query call history: previous inbound calls from this caller to this user
    const historyRows = await db
      .prepare("SELECT id FROM calls WHERE user_id = ? AND destination_phone = ? AND direction = 'inbound'")
      .bind(owner.id, callerNumber)
      .all();
    const callHistory = historyRows.results || [];

    const twiml = buildInboundTwiml('unknown_dedicated', {
      owner,
      agentId,
      callId,
      callerNumber,
      acceptedNumbers,
      callHistory,
    });

    return twimlResponse(twiml);
  } catch (err) {
    console.error('[twilio-voice-webhook] Error:', err.message || err);
    return twimlResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred. Please try again later.</Say></Response>',
      500,
    );
  }
}
