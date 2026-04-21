/**
 * POST /api/voice/select
 * Updates the authenticated user's voice_id and voice_name in the users table.
 */
export async function onRequestPost(context) {
  const user = context.data.user;
  const db = context.env.DB;

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json(
      { error: { code: 'INVALID_INPUT', message: 'Invalid JSON body' } },
      400,
    );
  }

  const { voice_id, voice_name } = body;

  if (!voice_id || typeof voice_id !== 'string') {
    return json(
      { error: { code: 'INVALID_INPUT', message: 'Missing or invalid voice_id' } },
      400,
    );
  }

  try {
    const now = new Date().toISOString();
    await db
      .prepare('UPDATE users SET voice_id = ?, voice_name = ?, updated_at = ? WHERE id = ?')
      .bind(voice_id, voice_name || null, now, user.id)
      .run();

    return json({ success: true, voice_id });
  } catch (err) {
    return json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to update voice selection' } },
      500,
    );
  }
}
