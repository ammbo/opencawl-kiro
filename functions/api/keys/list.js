/**
 * GET /api/keys/list
 * Returns the authenticated user's API keys with prefix, creation date, and active status.
 * Never returns the full key hash.
 */
export async function onRequestGet(context) {
  const user = context.data.user;
  const db = context.env.DB;

  try {
    const { results } = await db
      .prepare(
        'SELECT id, key_prefix, is_active, created_at, revoked_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC',
      )
      .bind(user.id)
      .all();

    return new Response(JSON.stringify({ keys: results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list API keys' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
