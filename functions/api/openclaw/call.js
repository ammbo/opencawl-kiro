/**
 * POST /api/openclaw/call
 * Initiates an outbound call via ElevenLabs Conversational AI + Twilio.
 *
 * Expects Bearer token auth (handled by middleware — user in context.data.user).
 * Body: { destination_phone: string, message?: string, system_prompt?: string, voice_id?: string, first_message?: string }
 *
 * Flow:
 *   1. Parse & validate input
 *   2. Check credit balance (minimum 12 credits = 1 min)
 *   3. Create call record in DB (status: pending)
 *   4. Invoke ElevenLabs outbound call API
 *   5. Return call_id + status
 */

import { isValidE164, parseBody } from '../../lib/validation.js';
import { check } from '../../lib/credits.js';
import { buildElevenLabsPayload, validateOverrideFields } from '../../lib/agent-overrides.js';

const MINIMUM_CALL_CREDITS = 12; // 1 minute at 12 credits/min

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function onRequestPost(context) {
  const user = context.data.user;
  const db = context.env.DB;

  try {
    // 1. Parse and validate body — only destination_phone is always required
    const parsed = await parseBody(context.request, ['destination_phone']);
    if (!parsed.success) {
      return json(
        { error: { code: 'INVALID_INPUT', message: parsed.error } },
        400,
      );
    }

    const { destination_phone, message, system_prompt, voice_id, first_message } = parsed.data;

    // message is required unless both system_prompt and first_message are provided
    if (!message && !(system_prompt && first_message)) {
      return json(
        { error: { code: 'INVALID_INPUT', message: 'Missing required fields: message' } },
        400,
      );
    }

    if (!isValidE164(destination_phone)) {
      return json(
        { error: { code: 'INVALID_INPUT', message: 'destination_phone must be a valid E.164 phone number' } },
        400,
      );
    }

    // Validate override field lengths
    const validation = validateOverrideFields({ system_prompt, first_message });
    if (!validation.valid) {
      return json(
        { error: { code: 'INVALID_INPUT', message: validation.error } },
        400,
      );
    }

    // 2. Check credits
    const creditCheck = await check(db, user.id, MINIMUM_CALL_CREDITS);
    if (!creditCheck.sufficient) {
      return json(
        {
          error: {
            code: 'INSUFFICIENT_CREDITS',
            message: `Your credit balance (${creditCheck.balance}) is insufficient for this operation (minimum: ${MINIMUM_CALL_CREDITS})`,
          },
        },
        402,
      );
    }

    // 3. Create call record (including override columns)
    const callId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db
      .prepare(
        'INSERT INTO calls (id, user_id, direction, destination_phone, status, override_system_prompt, override_voice_id, override_first_message, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(callId, user.id, 'outbound', destination_phone, 'pending', system_prompt || null, voice_id || null, first_message || null, now, now)
      .run();

    // 4. Invoke ElevenLabs outbound call
    const agentId = context.env.ELEVENLABS_AGENT_ID;
    const elevenLabsKey = context.env.ELEVENLABS_API_KEY;
    const fromNumber = user.twilio_phone_number || context.env.TWILIO_DEFAULT_NUMBER;

    const overrides = {};
    if (system_prompt) overrides.system_prompt = system_prompt;
    if (voice_id) overrides.voice_id = voice_id;
    if (first_message) overrides.first_message = first_message;

    const elevenLabsPayload = buildElevenLabsPayload(agentId, fromNumber, destination_phone, user, overrides, message);

    const elResponse = await fetch(
      'https://api.elevenlabs.io/v1/convai/twilio/outbound-call',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': elevenLabsKey,
        },
        body: JSON.stringify(elevenLabsPayload),
      },
    );

    if (!elResponse.ok) {
      // Log the error but still return the call_id — the call record exists
      console.error(
        '[openclaw/call] ElevenLabs outbound call failed:',
        elResponse.status,
        await elResponse.text().catch(() => ''),
      );

      // Update call status to failed
      await db
        .prepare('UPDATE calls SET status = ?, updated_at = ? WHERE id = ?')
        .bind('failed', new Date().toISOString(), callId)
        .run();

      return json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to initiate outbound call' } },
        500,
      );
    }

    // 5. Return success
    return json({ call_id: callId, status: 'pending' });
  } catch (err) {
    console.error('[openclaw/call] Error:', err.message || err);
    return json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to initiate call' } },
      500,
    );
  }
}
