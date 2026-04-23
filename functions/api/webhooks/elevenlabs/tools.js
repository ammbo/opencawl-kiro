/**
 * POST /api/webhooks/elevenlabs/tools
 *
 * Handles ElevenLabs tool-call webhooks for the dispatch_call tool.
 * When an owner calls their number and instructs the agent to make a call,
 * ElevenLabs invokes this webhook with the tool parameters.
 *
 * Flow:
 *   1. Verify ElevenLabs HMAC signature
 *   2. Extract user_id from conversation dynamic variables
 *   3. Parse dispatch_call tool parameters (destination_phone, goal)
 *   4. Validate destination phone (E.164)
 *   5. Create call record in DB with source: 'voice_dispatch'
 *   6. Initiate ElevenLabs outbound call with goal as system prompt context
 *   7. Return tool result JSON to ElevenLabs
 */

import { verifyElevenLabsSignature } from '../../../lib/webhooks.js';
import { isValidE164 } from '../../../lib/validation.js';
import { buildElevenLabsPayload } from '../../../lib/agent-overrides.js';
import { generateOutboundPrompt } from '../../../lib/outbound-prompt.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Builds a tool result response for ElevenLabs.
 * @param {string} toolCallId - The tool_call_id from the request
 * @param {string} message - The result message
 * @returns {object}
 */
function toolResult(toolCallId, message) {
  return { tool_call_id: toolCallId, result: message };
}

export async function onRequestPost(context) {
  const { env } = context;
  const db = env.DB;

  try {
    // 1. Read raw body and verify HMAC signature
    const rawBody = await context.request.text();
    const sigHeader = context.request.headers.get('elevenlabs-signature')
      || context.request.headers.get('xi-signature')
      || '';

    const { valid, event } = await verifyElevenLabsSignature(
      rawBody, sigHeader, env.ELEVENLABS_WEBHOOK_SECRET_TOOLS
    );

    if (!valid || !event) {
      console.error('[elevenlabs-tools] Invalid signature');
      return json({ error: { code: 'UNAUTHORIZED', message: 'Invalid webhook signature' } }, 401);
    }

    // 2. Extract tool call data and user_id from dynamic variables
    const toolCallId = event.tool_call_id;
    const toolName = event.tool_name;
    const parameters = event.parameters || {};
    const dynamicVars = event.conversation_initiation_client_data?.dynamic_variables || {};
    const userId = dynamicVars.user_id;

    if (!toolCallId) {
      console.error('[elevenlabs-tools] Missing tool_call_id');
      return json({ error: { code: 'BAD_REQUEST', message: 'Missing tool_call_id' } }, 400);
    }

    // Only handle dispatch_call tool
    if (toolName !== 'dispatch_call') {
      return json(toolResult(toolCallId, `Unknown tool: ${toolName}`));
    }

    // 3. Parse dispatch_call parameters
    const { destination_phone, goal } = parameters;

    if (!destination_phone) {
      return json(toolResult(toolCallId, 'Error: destination_phone is required'));
    }

    // 4. Validate destination phone (E.164)
    if (!isValidE164(destination_phone)) {
      return json(toolResult(toolCallId, 'Error: destination_phone must be a valid E.164 phone number (e.g. +15551234567)'));
    }

    if (!userId) {
      console.error('[elevenlabs-tools] Missing user_id in dynamic variables');
      return json(toolResult(toolCallId, 'Error: Unable to identify user for dispatch'));
    }

    // Look up the user
    const user = await db
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(userId)
      .first();

    if (!user) {
      console.error('[elevenlabs-tools] User not found:', userId);
      return json(toolResult(toolCallId, 'Error: User not found'));
    }

    // 5. Create call record in DB with source: 'voice_dispatch'
    const callId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db
      .prepare(
        'INSERT INTO calls (id, user_id, direction, destination_phone, status, goal, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(callId, userId, 'outbound', destination_phone, 'pending', goal || null, 'voice_dispatch', now, now)
      .run();

    // 6. Initiate ElevenLabs outbound call with goal as system prompt context
    const agentId = env.ELEVENLABS_AGENT_ID;
    const elevenLabsKey = env.ELEVENLABS_API_KEY;
    const fromNumber = user.elevenlabs_phone_number_id || env.ELEVENLABS_PHONE_NUMBER_ID;

    const overrides = {};
    if (goal) {
      const generated = await generateOutboundPrompt(env.AI, goal);
      overrides.system_prompt = generated.system_prompt;
      overrides.first_message = generated.first_message;
    }

    const payload = buildElevenLabsPayload(agentId, fromNumber, destination_phone, user, overrides);

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
      console.error('[elevenlabs-tools] Outbound call failed:', elResponse.status, errText);

      // Update call status to failed
      await db
        .prepare('UPDATE calls SET status = ?, updated_at = ? WHERE id = ?')
        .bind('failed', new Date().toISOString(), callId)
        .run();

      return json(toolResult(toolCallId, 'Error: Failed to initiate the outbound call. Please try again.'));
    }

    // 7. Return success tool result to ElevenLabs
    const successMsg = goal
      ? `Call dispatched successfully to ${destination_phone}. Goal: ${goal}`
      : `Call dispatched successfully to ${destination_phone}.`;

    return json(toolResult(toolCallId, successMsg));
  } catch (err) {
    console.error('[elevenlabs-tools] Error:', err.message || err);
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
  }
}
