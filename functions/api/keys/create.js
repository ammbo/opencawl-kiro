import { generateApiKey, hashApiKey, getKeyPrefix } from '../../lib/api-keys.js';

/**
 * POST /api/keys/create
 * Generates a new API key for the authenticated user.
 * Returns the plaintext key exactly once — it is never stored or retrievable again.
 */
export async function onRequestPost(context) {
  const user = context.data.user;
  const db = context.env.DB;

  try {
    const key = generateApiKey();
    const keyHash = await hashApiKey(key);
    const prefix = getKeyPrefix(key);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db
      .prepare(
        'INSERT INTO api_keys (id, user_id, key_hash, key_prefix, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
      )
      .bind(id, user.id, keyHash, prefix, now)
      .run();

    return new Response(JSON.stringify({ key, prefix }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create API key' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
