/**
 * GET /api/openclaw/transcripts
 * Returns recent call transcripts and summaries for the authenticated user's agent.
 *
 * Query params:
 *   ?since=<ISO8601>  — only return calls completed after this timestamp
 *   ?limit=<number>   — max results (default 10, max 50)
 *   ?status=<string>  — filter by call status (default: completed)
 *
 * Auth: Bearer token (handled by middleware — user in context.data.user).
 *
 * This is the primary endpoint for an OpenClaw agent to poll for call results.
 * Each call includes a summary (actionable outcome) and the full transcript.
 * The agent should treat these as instructions and take action accordingly,
 * then contact the user through its existing communication channels.
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
    const since = url.searchParams.get('since');
    const status = url.searchParams.get('status') || 'completed';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 50);

    let sql = 'SELECT id, direction, destination_phone, status, duration_seconds, transcript, summary, goal, source, created_at, updated_at FROM calls WHERE user_id = ? AND status = ?';
    const params = [user.id, status];

    if (since) {
      sql += ' AND updated_at > ?';
      params.push(since);
    }

    sql += ' ORDER BY updated_at DESC LIMIT ?';
    params.push(limit);

    const rows = await db.prepare(sql).bind(...params).all();
    const calls = (rows.results || []).map((row) => {
      let transcript = null;
      if (row.transcript) {
        try {
          transcript = JSON.parse(row.transcript);
        } catch {
          transcript = row.transcript;
        }
      }

      // Format transcript into readable text
      let transcript_text = null;
      if (Array.isArray(transcript)) {
        transcript_text = transcript
          .map((t) => `${t.role === 'agent' ? 'Agent' : 'Caller'}: ${t.message}`)
          .join('\n');
      }

      return {
        call_id: row.id,
        direction: row.direction,
        phone: row.destination_phone,
        status: row.status,
        duration_seconds: row.duration_seconds,
        goal: row.goal,
        source: row.source,
        summary: row.summary || null,
        transcript: transcript_text,
        transcript_raw: transcript,
        completed_at: row.updated_at,
      };
    });

    return json({ calls });
  } catch (err) {
    console.error('[openclaw/transcripts] Error:', err.message || err);
    return json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve transcripts' } },
      500,
    );
  }
}
