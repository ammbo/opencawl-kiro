import { describe, it, expect, vi } from 'vitest';
import { aggregateDailyUsage, getUsageForPeriod } from './usage.js';

// --- aggregateDailyUsage ---

describe('aggregateDailyUsage', () => {
  it('returns empty array for no transactions', () => {
    expect(aggregateDailyUsage([])).toEqual([]);
  });

  it('ignores credit (positive amount) transactions', () => {
    const txs = [
      { amount: 1200, created_at: '2024-01-15T10:00:00Z', operation_type: 'plan_credit' },
      { amount: 50, created_at: '2024-01-15T11:00:00Z', operation_type: 'admin_grant' },
    ];
    expect(aggregateDailyUsage(txs)).toEqual([]);
  });

  it('ignores zero-amount transactions', () => {
    const txs = [
      { amount: 0, created_at: '2024-01-15T10:00:00Z', operation_type: 'call' },
    ];
    expect(aggregateDailyUsage(txs)).toEqual([]);
  });

  it('groups single debit transaction into one day', () => {
    const txs = [
      { amount: -12, created_at: '2024-01-15T10:30:00Z', operation_type: 'call' },
    ];
    expect(aggregateDailyUsage(txs)).toEqual([
      { date: '2024-01-15', total: 12, breakdown: { call: 12, sms: 0, intent: 0, other: 0 } },
    ]);
  });

  it('groups multiple transactions on the same day', () => {
    const txs = [
      { amount: -12, created_at: '2024-01-15T08:00:00Z', operation_type: 'call' },
      { amount: -2, created_at: '2024-01-15T09:00:00Z', operation_type: 'sms' },
      { amount: -1, created_at: '2024-01-15T10:00:00Z', operation_type: 'intent' },
    ];
    expect(aggregateDailyUsage(txs)).toEqual([
      { date: '2024-01-15', total: 15, breakdown: { call: 12, sms: 2, intent: 1, other: 0 } },
    ]);
  });

  it('groups transactions across multiple days sorted ascending', () => {
    const txs = [
      { amount: -24, created_at: '2024-01-17T14:00:00Z', operation_type: 'call' },
      { amount: -2, created_at: '2024-01-15T09:00:00Z', operation_type: 'sms' },
      { amount: -1, created_at: '2024-01-16T12:00:00Z', operation_type: 'intent' },
    ];
    const result = aggregateDailyUsage(txs);
    expect(result).toHaveLength(3);
    expect(result[0].date).toBe('2024-01-15');
    expect(result[1].date).toBe('2024-01-16');
    expect(result[2].date).toBe('2024-01-17');
  });

  it('categorizes unknown operation types as other', () => {
    const txs = [
      { amount: -5, created_at: '2024-01-15T10:00:00Z', operation_type: 'refund_adjustment' },
    ];
    expect(aggregateDailyUsage(txs)).toEqual([
      { date: '2024-01-15', total: 5, breakdown: { call: 0, sms: 0, intent: 0, other: 5 } },
    ]);
  });

  it('mixes credits and debits, only counting debits', () => {
    const txs = [
      { amount: 1200, created_at: '2024-01-15T00:00:00Z', operation_type: 'plan_credit' },
      { amount: -12, created_at: '2024-01-15T10:00:00Z', operation_type: 'call' },
      { amount: -2, created_at: '2024-01-15T11:00:00Z', operation_type: 'sms' },
    ];
    const result = aggregateDailyUsage(txs);
    expect(result).toHaveLength(1);
    expect(result[0].total).toBe(14);
  });

  it('sum of daily totals equals sum of all debit amounts', () => {
    const txs = [
      { amount: -12, created_at: '2024-01-15T08:00:00Z', operation_type: 'call' },
      { amount: -2, created_at: '2024-01-15T09:00:00Z', operation_type: 'sms' },
      { amount: -24, created_at: '2024-01-16T10:00:00Z', operation_type: 'call' },
      { amount: -1, created_at: '2024-01-17T11:00:00Z', operation_type: 'intent' },
      { amount: 500, created_at: '2024-01-17T12:00:00Z', operation_type: 'plan_credit' },
    ];
    const result = aggregateDailyUsage(txs);
    const totalFromDays = result.reduce((sum, d) => sum + d.total, 0);
    const totalFromTxs = txs
      .filter((t) => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    expect(totalFromDays).toBe(totalFromTxs);
  });
});

// --- getUsageForPeriod ---

describe('getUsageForPeriod', () => {
  function createMockDb(rows) {
    return {
      prepare: vi.fn(() => ({
        bind: vi.fn(function () { return this; }),
        all: vi.fn(async () => ({ results: rows })),
      })),
    };
  }

  it('queries DB and returns aggregated usage', async () => {
    const rows = [
      { amount: -12, operation_type: 'call', created_at: '2024-01-15T10:00:00Z' },
      { amount: -2, operation_type: 'sms', created_at: '2024-01-15T11:00:00Z' },
      { amount: -24, operation_type: 'call', created_at: '2024-01-16T09:00:00Z' },
    ];
    const db = createMockDb(rows);

    const result = await getUsageForPeriod(db, 'user-1', '2024-01-15', '2024-01-16T23:59:59Z');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      date: '2024-01-15',
      total: 14,
      breakdown: { call: 12, sms: 2, intent: 0, other: 0 },
    });
    expect(result[1]).toEqual({
      date: '2024-01-16',
      total: 24,
      breakdown: { call: 24, sms: 0, intent: 0, other: 0 },
    });
  });

  it('passes correct parameters to DB query', async () => {
    const db = createMockDb([]);
    await getUsageForPeriod(db, 'user-42', '2024-02-01', '2024-02-28T23:59:59Z');

    expect(db.prepare).toHaveBeenCalledTimes(1);
    const prepareArg = db.prepare.mock.calls[0][0];
    expect(prepareArg).toContain('credit_transactions');
    expect(prepareArg).toContain('user_id');
    expect(prepareArg).toContain('created_at');
  });

  it('returns empty array when no transactions in period', async () => {
    const db = createMockDb([]);
    const result = await getUsageForPeriod(db, 'user-1', '2024-01-01', '2024-01-31T23:59:59Z');
    expect(result).toEqual([]);
  });
});
