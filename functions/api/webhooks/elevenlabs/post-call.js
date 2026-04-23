/**
 * POST /api/webhooks/elevenlabs/post-call
 * Handles ElevenLabs post_call_transcription webhook.
 * Verifies HMAC-SHA256 signature, logs transcript, generates a summary,
 * updates call record, and handles billing.
 *
 * The summary is stored on the call record so the user's OpenClaw agent
 * can pick it up when it polls GET /api/openclaw/transcripts.
 */

import { verifyElevenLabsSignature } from '../../../lib/webhooks.js';
import { calculateCreditCost, deduct, recordPaidUsage } from '../../../lib/credits.js';

/**
 * Generate a concise summary from a call transcript.
 * Extracts the key outcome — what happened and what was decided.
 *
 * @param {string} direction - 'inbound' or 'outbound'
 * @param {string|null} destination - the other party's phone number
 * @param {Array<{role: string, message: string}>|null} transcript
 * @param {string|null} goal - the original call goal if any
 * @returns {string}
 */
export function generateCallSummary(direction, destination, transcript, goal) {
  const target = destination || 'unknown number';

  if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
    return `Call ${direction === 'outbound' ? 'to' : 'from'} ${target} completed. No transcript available.`;
  }

  // Collect the last few agent messages to capture the outcome
  const agentMessages = transcript
    .filter((t) => t.role === 'agent' && t.message)
    .map((t) => t.message);

  if (agentMessages.length === 0) {
    return `Call ${direction === 'outbound' ? 'to' : 'from'} ${target} completed. No agent messages in transcript.`;
  }

  // Use the last agent message as the primary outcome
  const outcome = agentMessages[agentMessages.length - 1];

  const parts = [];
  if (goal) {
    parts.push(`Goal: ${goal}`);
  }
  parts.push(`Outcome: ${outcome}`);

  return parts.join(' | ');
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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
      rawBody, sigHeader, env.ELEVENLABS_WEBHOOK_SECRET_POST_CALL
    );

    if (!valid || !event) {
      console.error('[elevenlabs-post-call] Invalid signature');
      return json({ error: { code: 'UNAUTHORIZED', message: 'Invalid webhook signature' } }, 401);
    }

    // 2. Extract data from the webhook event
    const data = event.data || event;
    const {
      conversation_id,
      transcript,
      metadata,
    } = data;

    const callDurationSecs = metadata?.call_duration_secs ?? data.call_duration_secs ?? 0;
    const userId = metadata?.start_time_unix_secs ? null : (data.conversation_initiation_client_data?.dynamic_variables?.user_id);
    const callId = data.conversation_initiation_client_data?.dynamic_variables?.call_id;

    // Also check metadata directly (our outbound calls put user_id/call_id there)
    const resolvedUserId = userId || metadata?.user_id || data.conversation_initiation_client_data?.dynamic_variables?.user_id;
    const resolvedCallId = callId || metadata?.call_id || data.conversation_initiation_client_data?.dynamic_variables?.call_id;

    if (!resolvedCallId || !resolvedUserId) {
      console.error('[elevenlabs-post-call] Missing user_id or call_id in webhook data');
      return json({ received: true });
    }

    // 3. Look up the call record to get direction, destination, goal
    const callRecord = await db
      .prepare('SELECT direction, destination_phone, goal FROM calls WHERE id = ?')
      .bind(resolvedCallId)
      .first();

    // 4. Generate summary from transcript
    const summary = generateCallSummary(
      callRecord?.direction || 'outbound',
      callRecord?.destination_phone || null,
      transcript,
      callRecord?.goal || null,
    );

    // 5. Update call record with transcript, summary, and status
    const now = new Date().toISOString();
    const transcriptJson = transcript ? JSON.stringify(transcript) : null;
    const durationSeconds = callDurationSecs || 0;

    await db
      .prepare(
        'UPDATE calls SET status = ?, duration_seconds = ?, transcript = ?, summary = ?, elevenlabs_conversation_id = ?, updated_at = ? WHERE id = ?'
      )
      .bind('completed', durationSeconds, transcriptJson, summary, conversation_id || null, now, resolvedCallId)
      .run();

    // 6. Bill the user
    if (durationSeconds > 0) {
      const durationMinutes = durationSeconds / 60;

      const user = await db
        .prepare('SELECT * FROM users WHERE id = ?')
        .bind(resolvedUserId)
        .first();

      if (user) {
        if (user.plan === 'free') {
          const cost = calculateCreditCost('call', durationMinutes);
          await deduct(db, resolvedUserId, cost, 'call', resolvedCallId);
        } else {
          await recordPaidUsage(db, user, durationMinutes, resolvedCallId, env);
        }
      }
    }

    return json({ received: true });
  } catch (err) {
    console.error('[elevenlabs-post-call] Error:', err.message || err);
    return json({ received: true }, 200);
  }
}
