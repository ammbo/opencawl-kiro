/**
 * GET /api/billing/usage
 * Returns daily credit usage for the current billing period,
 * plus recent calls and today's call count for the dashboard.
 */
import { getUsageForPeriod } from '../../lib/usage.js';

export async function onRequestGet(context) {
  const user = context.data.user;
  const db = context.env.DB;

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endDate = now.toISOString();

    // Daily usage aggregation
    const usage = await getUsageForPeriod(db, user.id, startDate, endDate);

    // Today's call count
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const callsToday = await db
      .prepare('SELECT COUNT(*) as count FROM calls WHERE user_id = ? AND created_at >= ?')
      .bind(user.id, todayStart)
      .first();

    // Recent calls (last 20)
    const { results: recentCalls } = await db
      .prepare(
        'SELECT id, direction, destination_phone, status, duration_seconds, created_at FROM calls WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
      )
      .bind(user.id)
      .all();

    return json({
      usage,
      calls_today: callsToday?.count || 0,
      recent_calls: recentCalls || [],
    });
  } catch (err) {
    return json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve usage data' } },
      500,
    );
  }
}
