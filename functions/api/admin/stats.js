/**
 * GET /api/admin/stats
 * Returns platform statistics: total users, active calls, total credits consumed.
 */
export async function onRequestGet(context) {
  const db = context.env.DB;

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    const [usersResult, callsResult, creditsResult] = await Promise.all([
      db.prepare('SELECT COUNT(*) as total FROM users').first(),
      db.prepare("SELECT COUNT(*) as total FROM calls WHERE status = 'in_progress'").first(),
      db.prepare(
        'SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM credit_transactions WHERE amount < 0',
      ).first(),
    ]);

    return json({
      total_users: usersResult.total,
      active_calls: callsResult.total,
      total_credits_consumed: creditsResult.total,
    });
  } catch (err) {
    return json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve platform stats' } },
      500,
    );
  }
}
