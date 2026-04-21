/**
 * GET /api/admin/waitlist
 * Returns all waitlist entries ordered by creation date.
 */
export async function onRequestGet(context) {
  const db = context.env.DB;

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    const { results } = await db
      .prepare('SELECT * FROM waitlist ORDER BY created_at DESC')
      .all();

    return json({ entries: results });
  } catch (err) {
    return json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve waitlist entries' } },
      500,
    );
  }
}
