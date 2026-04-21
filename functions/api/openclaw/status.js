/**
 * GET /api/openclaw/status
 * Returns the status, duration, and transcript for a given call.
 *
 * Query: ?call_id=<uuid>
 * Auth: Bearer token (handled by middleware — user in context.data.user).
 */

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function onRequestGet(context) {
  const user = context.data.user;
  const db = context.env.DB;

  try {
    const url = new URL(context.request.url);
    const callId = url.searchParams.get('call_id');

    if (!callId) {
      return json(
        { error: { code: 'INVALID_INPUT', message: 'Missing required query parameter: call_id' } },
        400,
      );
    }

    const row = await db
      .prepare('SELECT * FROM calls WHERE id = ? AND user_id = ?')
      .bind(callId, user.id)
      .first();

    if (!row) {
      return json(
        { error: { code: 'NOT_FOUND', message: 'Call not found' } },
        404,
      );
    }

    const hasOverride =
      row.override_system_prompt != null ||
      row.override_voice_id != null ||
      row.override_first_message != null;

    return json({
      call_id: row.id,
      status: row.status,
      duration_seconds: row.duration_seconds,
      transcript: row.transcript,
      agent_override: hasOverride
        ? {
            system_prompt: row.override_system_prompt ?? null,
            voice_id: row.override_voice_id ?? null,
            first_message: row.override_first_message ?? null,
          }
        : null,
    });
  } catch (err) {
    console.error('[openclaw/status] Error:', err.message || err);
    return json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve call status' } },
      500,
    );
  }
}
