/**
 * Usage aggregation for OpenClaw Phone Platform.
 * Groups credit transactions by calendar day for billing period usage charts.
 *
 * Only debit transactions (negative amounts) count as usage.
 * Uses only Web APIs — no external dependencies.
 */

const OPERATION_TYPES = ['call', 'sms', 'intent'];

/**
 * Extracts the calendar day (YYYY-MM-DD) from an ISO 8601 timestamp.
 * @param {string} isoString
 * @returns {string}
 */
function extractDate(isoString) {
  return isoString.slice(0, 10);
}

/**
 * Maps an operation_type to a breakdown category.
 * @param {string} operationType
 * @returns {'call'|'sms'|'intent'|'other'}
 */
function toCategory(operationType) {
  return OPERATION_TYPES.includes(operationType) ? operationType : 'other';
}

/**
 * Aggregates credit transactions into daily usage totals.
 * Only includes debit transactions (negative amounts).
 *
 * @param {Array<{amount: number, created_at: string, operation_type: string}>} transactions
 * @returns {Array<{date: string, total: number, breakdown: {call: number, sms: number, intent: number, other: number}}>}
 *   Sorted by date ascending.
 */
export function aggregateDailyUsage(transactions) {
  const dayMap = new Map();

  for (const tx of transactions) {
    // Only debit transactions count as usage
    if (tx.amount >= 0) continue;

    const date = extractDate(tx.created_at);
    const absAmount = Math.abs(tx.amount);
    const category = toCategory(tx.operation_type);

    if (!dayMap.has(date)) {
      dayMap.set(date, { call: 0, sms: 0, intent: 0, other: 0, total: 0 });
    }

    const day = dayMap.get(date);
    day[category] += absAmount;
    day.total += absAmount;
  }

  return Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { total, ...breakdown }]) => ({ date, total, breakdown }));
}

/**
 * Queries credit transactions for a user within a date range and returns aggregated daily usage.
 *
 * @param {D1Database} db
 * @param {string} userId
 * @param {string} startDate - ISO 8601 date string (inclusive)
 * @param {string} endDate - ISO 8601 date string (inclusive)
 * @returns {Promise<Array<{date: string, total: number, breakdown: {call: number, sms: number, intent: number, other: number}}>>}
 */
export async function getUsageForPeriod(db, userId, startDate, endDate) {
  const { results } = await db
    .prepare(
      'SELECT amount, operation_type, created_at FROM credit_transactions WHERE user_id = ? AND created_at >= ? AND created_at <= ? ORDER BY created_at ASC'
    )
    .bind(userId, startDate, endDate)
    .all();

  return aggregateDailyUsage(results);
}
