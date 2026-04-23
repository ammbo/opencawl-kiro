/**
 * POST /api/openclaw/results
 * Stores the Openclaw agent's result for a given call.
 *
 * Body: { call_id: string, result: string }
 * Auth: Bearer token (handled by middleware — user in context.data.user).
 */

import { parseBody } from '../../lib/validation.js';

const MAX_RESULT_LENGTH = 10_000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function onRequestPost(context) {
  const user = context.data.user;
  const db = context.env.DB;

  try {
    // 1. Parse and validate body
    const parsed = await parseBody(context.request, ['call_id', 'result']);
    if (!parsed.success) {
      return json(
        { error: { code: 'INVALID_INPUT', message: parsed.error } },
        400,
      );
    }

    const { call_id, result } = parsed.data;

    // 2. Enforce result length limit
    if (result.length > MAX_RESULT_LENGTH) {
      return json(
        { error: { code: 'INVALID_INPUT', message: 'result must not exceed 10,000 characters' } },
        400,
      );
    }

    // 3. Update the call record (scoped to authenticated user)
    const now = new Date().toISOString();
    const { meta } = await db
      .prepare('UPDATE calls SET openclaw_result = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .bind(result, now, call_id, user.id)
      .run();

    // 4. If no row was updated, the call doesn't exist or doesn't belong to this user
    if (!meta.changes) {
      return json(
        { error: { code: 'NOT_FOUND', message: 'Call not found' } },
        404,
      );
    }

    // 5. Success
    return json({ success: true, call_id });
  } catch (err) {
    console.error('[openclaw/results] Error:', err.message || err);
    return json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to update call result' } },
      500,
    );
  }
}
