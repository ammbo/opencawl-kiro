/**
 * POST /api/admin/waitlist/reject
 * Rejects a waitlist entry by updating its status to 'rejected'.
 */
export async function onRequestPost(context) {
  const db = context.env.DB;

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    const body = await context.request.json();
    const { waitlist_id } = body;

    if (!waitlist_id) {
      return json(
        { error: { code: 'INVALID_INPUT', message: 'waitlist_id is required' } },
        400,
      );
    }

    const entry = await db
      .prepare('SELECT * FROM waitlist WHERE id = ?')
      .bind(waitlist_id)
      .first();

    if (!entry) {
      return json(
        { error: { code: 'NOT_FOUND', message: 'Waitlist entry not found' } },
        404,
      );
    }

    await db
      .prepare("UPDATE waitlist SET status = 'rejected' WHERE id = ?")
      .bind(waitlist_id)
      .run();

    return json({ success: true });
  } catch (err) {
    return json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to reject waitlist entry' } },
      500,
    );
  }
}
