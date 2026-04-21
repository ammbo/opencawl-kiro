/**
 * GET /api/admin/users
 * Returns a paginated list of all users.
 */
export async function onRequestGet(context) {
  const db = context.env.DB;
  const url = new URL(context.request.url);

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
    const offset = (page - 1) * limit;

    const { results } = await db
      .prepare(
        'SELECT id, phone, plan, credits_balance, created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?',
      )
      .bind(limit, offset)
      .all();

    return json({ users: results, page, limit });
  } catch (err) {
    return json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve users' } },
      500,
    );
  }
}
