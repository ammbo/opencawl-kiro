/**
 * POST /api/webhooks/elevenlabs/conversation-init
 *
 * ElevenLabs Conversation Initiation Client Data webhook.
 * Called by ElevenLabs when an inbound Twilio call connects to the agent.
 *
 * ElevenLabs sends:
 *   { caller_id, agent_id, called_number, call_sid }
 *
 * We return:
 *   {
 *     type: "conversation_initiation_client_data",
 *     dynamic_variables: { ... },
 *     conversation_config_override: { agent: { ... }, tts: { ... } }
 *   }
 *
 * Flow:
 *   1. Authenticate request via secret header
 *   2. Look up the called number → find the owner user
 *   3. Check if it's a shared number
 *   4. Classify caller: owner | unknown_shared | unknown_dedicated
 *   5. For owner: create call record, return dispatch-mode overrides
 *   6. For unknown_shared: return promo agent overrides (no call record)
 *   7. For unknown_dedicated: check accepted_numbers, create call record if
 *      accepted, return owner's agent config overrides or rejection
 */

import { classifyCaller } from '../../../lib/inbound-routing.js';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/* ── System prompts ─────────────────────────────── */

const OWNER_DISPATCH_SYSTEM_PROMPT = `You are the user's AI phone assistant. Listen to their instruction.
If they want you to make a call on their behalf, use the dispatch_call tool
with the destination phone number and the goal/task description.
Confirm the dispatch to the user before hanging up.`;

const PROMO_SYSTEM_PROMPT = `You are the OpenClaw AI assistant. Your ONLY purpose is to tell callers about OpenClaw — the AI phone agent platform — and encourage them to sign up at openclaw.com.

Rules you MUST follow:
- ONLY discuss OpenClaw, its features, pricing, and how to sign up.
- If the caller asks about anything unrelated to OpenClaw, politely redirect: "I'm here to help you learn about OpenClaw! Is there anything about our AI phone agent platform I can help with?"
- Never pretend to be anyone else or assist with unrelated tasks.
- Keep responses concise and friendly.
- Mention that users can create their own AI phone agent, get a dedicated phone number, and customize their agent's personality.
- Direct them to openclaw.com to get started.`;

const PROMO_FIRST_MESSAGE =
  "Hey there! You've reached a number powered by OpenClaw — the AI phone agent platform. I can tell you all about how it works. What would you like to know?";

const REJECTED_MESSAGE =
  'This number is not currently accepting calls from your number. Goodbye.';


/* ── Helpers ────────────────────────────────────── */

function generateId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

/**
 * Build the ElevenLabs conversation_initiation_client_data response.
 * @param {object} dynamicVars
 * @param {object} [overrides] - { prompt, first_message, voice_id, language }
 * @returns {object}
 */
function buildInitResponse(dynamicVars, overrides = {}) {
  const response = {
    type: 'conversation_initiation_client_data',
    dynamic_variables: dynamicVars,
  };

  const configOverride = {};
  let hasOverride = false;

  if (overrides.prompt != null) {
    if (!configOverride.agent) configOverride.agent = {};
    configOverride.agent.prompt = { prompt: overrides.prompt };
    hasOverride = true;
  }

  if (overrides.first_message != null) {
    if (!configOverride.agent) configOverride.agent = {};
    configOverride.agent.first_message = overrides.first_message;
    hasOverride = true;
  }

  if (overrides.language != null) {
    if (!configOverride.agent) configOverride.agent = {};
    configOverride.agent.language = overrides.language;
    hasOverride = true;
  }

  if (overrides.voice_id != null) {
    configOverride.tts = { voice_id: overrides.voice_id };
    hasOverride = true;
  }

  if (hasOverride) {
    response.conversation_config_override = configOverride;
  }

  return response;
}


/* ── Route builders ─────────────────────────────── */

/**
 * Owner calling their own number → dispatch mode.
 * Creates a call record and returns dispatch system prompt + owner's voice.
 */
async function handleOwner(db, owner, callerNumber) {
  const callId = generateId();
  const now = new Date().toISOString();

  await db
    .prepare(
      'INSERT INTO calls (id, user_id, direction, destination_phone, status, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(callId, owner.id, 'inbound', callerNumber, 'in_progress', 'inbound', now, now)
    .run();

  const dynamicVars = {
    user_id: owner.id,
    call_id: callId,
    caller: callerNumber,
    owner_mode: 'dispatch',
  };

  const overrides = {
    prompt: OWNER_DISPATCH_SYSTEM_PROMPT,
  };

  // Apply owner's voice if configured
  if (owner.voice_id) {
    overrides.voice_id = owner.voice_id;
  }

  // Owner's first_message for dispatch mode (optional)
  if (owner.first_message) {
    overrides.first_message = owner.first_message;
  }

  return buildInitResponse(dynamicVars, overrides);
}

/**
 * Unknown caller on a shared number → promo agent.
 * No call record created.
 */
function handleUnknownShared(callerNumber) {
  const dynamicVars = {
    caller: callerNumber,
  };

  return buildInitResponse(dynamicVars, {
    prompt: PROMO_SYSTEM_PROMPT,
    first_message: PROMO_FIRST_MESSAGE,
  });
}

/**
 * Unknown caller on a dedicated number → check accepted list, apply owner config.
 */
async function handleUnknownDedicated(db, owner, callerNumber) {
  // Check accepted_numbers for this owner
  const acceptedRows = await db
    .prepare('SELECT phone_number FROM accepted_numbers WHERE user_id = ?')
    .bind(owner.id)
    .all();
  const acceptedNumbers = (acceptedRows.results || []).map((r) => r.phone_number);

  const isOpenAccess = acceptedNumbers.length === 0;
  const isAccepted = acceptedNumbers.includes(callerNumber);

  if (!isOpenAccess && !isAccepted) {
    // Rejected — return a polite rejection prompt that will end the call quickly
    return buildInitResponse(
      { caller: callerNumber },
      {
        prompt: 'Say the following message exactly, then end the conversation: "' + REJECTED_MESSAGE + '"',
        first_message: REJECTED_MESSAGE,
      },
    );
  }

  // Accepted — create call record and return owner's full agent config
  const callId = generateId();
  const now = new Date().toISOString();

  await db
    .prepare(
      'INSERT INTO calls (id, user_id, direction, destination_phone, status, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(callId, owner.id, 'inbound', callerNumber, 'in_progress', 'inbound', now, now)
    .run();

  // Query call history for context
  const historyRows = await db
    .prepare(
      "SELECT id FROM calls WHERE user_id = ? AND destination_phone = ? AND direction = 'inbound' AND id != ?",
    )
    .bind(owner.id, callerNumber, callId)
    .all();
  const previousCallCount = historyRows.results ? historyRows.results.length : 0;

  const dynamicVars = {
    user_id: owner.id,
    call_id: callId,
    caller: callerNumber,
    previous_call_count: String(previousCallCount),
  };

  const overrides = {};

  // Apply all of the owner's stored agent config
  if (owner.system_prompt) {
    overrides.prompt = owner.system_prompt;
  }
  if (owner.voice_id) {
    overrides.voice_id = owner.voice_id;
  }
  if (owner.first_message) {
    overrides.first_message = owner.first_message;
  }

  return buildInitResponse(dynamicVars, overrides);
}


/* ── Main handler ───────────────────────────────── */

export async function onRequestPost(context) {
  const { env } = context;
  const db = env.DB;

  try {
    // 1. Authenticate — ElevenLabs sends secrets you configure in the headers.
    //    We expect a shared secret in the x-webhook-secret header.
    const webhookSecret = env.ELEVENLABS_WEBHOOK_SECRET_CONVERSATION_INIT;
    if (webhookSecret) {
      const provided = context.request.headers.get('x-webhook-secret') || '';
      if (provided !== webhookSecret) {
        console.error('[conversation-init] Invalid webhook secret');
        return json({ error: { code: 'UNAUTHORIZED', message: 'Invalid webhook secret' } }, 401);
      }
    }

    // 2. Parse the request body
    let body;
    try {
      body = await context.request.json();
    } catch {
      return json({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } }, 400);
    }

    const { caller_id, agent_id, called_number, call_sid } = body;

    if (!caller_id || !called_number) {
      console.error('[conversation-init] Missing caller_id or called_number', body);
      return json({ error: { code: 'BAD_REQUEST', message: 'Missing required fields' } }, 400);
    }

    console.log(`[conversation-init] caller=${caller_id} called=${called_number} sid=${call_sid}`);

    // 3. Check if the called number is a shared number
    const sharedRow = await db
      .prepare('SELECT phone_number FROM shared_phone_numbers WHERE phone_number = ?')
      .bind(called_number)
      .first();
    const isSharedNumber = !!sharedRow;

    // 4. Look up the owner of the called number
    const owner = await db
      .prepare('SELECT * FROM users WHERE twilio_phone_number = ?')
      .bind(called_number)
      .first();

    if (!owner) {
      console.warn(`[conversation-init] No owner found for ${called_number}`);
      // Return promo agent as fallback — the number exists in Twilio but no user owns it
      return json(handleUnknownShared(caller_id));
    }

    // 5. Classify the caller
    const classification = classifyCaller(caller_id, owner, isSharedNumber);

    console.log(`[conversation-init] classification=${classification} owner=${owner.id}`);

    // 6. Route based on classification
    let response;

    switch (classification) {
      case 'owner':
        response = await handleOwner(db, owner, caller_id);
        break;

      case 'unknown_shared':
        response = handleUnknownShared(caller_id);
        break;

      case 'unknown_dedicated':
        response = await handleUnknownDedicated(db, owner, caller_id);
        break;

      default:
        response = handleUnknownShared(caller_id);
    }

    return json(response);
  } catch (err) {
    console.error('[conversation-init] Error:', err.message || err, err.stack);
    // Return a safe fallback so the call doesn't just die
    return json(
      buildInitResponse(
        { caller: 'unknown' },
        {
          prompt: 'Apologize to the caller and let them know we are experiencing technical difficulties. Ask them to try again later.',
          first_message: "I'm sorry, we're experiencing a brief technical issue. Please try calling back in a moment.",
        },
      ),
    );
  }
}
