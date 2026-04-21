/**
 * POST /api/keys/revoke
 * Revokes an API key by ID for the authenticated user.
 * Sets is_active = 0 and records the revoked_at timestamp.
 */
export async function onRequestPost(context) {
  const user = context.data.user;
  const db = context.env.DB;

  let body;
  try {
    body = await context.request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: { code: 'INVALID_INPUT', message: 'Invalid JSON body' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { key_id } = body;
  if (!key_id) {
    return new Response(
      JSON.stringify({ error: { code: 'INVALID_INPUT', message: 'Missing key_id' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const now = new Date().toISOString();
    const result = await db
      .prepare(
        'UPDATE api_keys SET is_active = 0, revoked_at = ? WHERE id = ? AND user_id = ?',
      )
      .bind(now, key_id, user.id)
      .run();

    if (!result.meta.changes) {
      return new Response(
        JSON.stringify({ error: { code: 'NOT_FOUND', message: 'API key not found' } }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Failed to revoke API key' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
