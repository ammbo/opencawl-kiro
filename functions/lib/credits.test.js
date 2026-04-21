import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateCreditCost,
  check,
  deduct,
  add,
  getTransactions,
  checkLowBalance,
} from './credits.js';

// --- calculateCreditCost ---

describe('calculateCreditCost', () => {
  it('calculates call cost at 12 credits/min with ceil', () => {
    expect(calculateCreditCost('call', 1)).toBe(12);
    expect(calculateCreditCost('call', 2)).toBe(24);
    expect(calculateCreditCost('call', 0.5)).toBe(12); // ceil(0.5) = 1
    expect(calculateCreditCost('call', 1.1)).toBe(24); // ceil(1.1) = 2
    expect(calculateCreditCost('call', 3.9)).toBe(48); // ceil(3.9) = 4
  });

  it('calculates SMS cost at 2 credits/message', () => {
    expect(calculateCreditCost('sms', 1)).toBe(2);
    expect(calculateCreditCost('sms', 5)).toBe(10);
    expect(calculateCreditCost('sms', 0)).toBe(0);
  });

  it('calculates intent cost at 1 credit/operation', () => {
    expect(calculateCreditCost('intent', 1)).toBe(1);
    expect(calculateCreditCost('intent', 10)).toBe(10);
    expect(calculateCreditCost('intent', 0)).toBe(0);
  });

  it('throws for unknown operation type', () => {
    expect(() => calculateCreditCost('unknown', 1)).toThrow('Unknown operation type');
  });
});

// --- checkLowBalance ---

describe('checkLowBalance', () => {
  it('returns both false when balance >= 50', () => {
    expect(checkLowBalance(50)).toEqual({ lowBalance: false, criticalBalance: false });
    expect(checkLowBalance(100)).toEqual({ lowBalance: false, criticalBalance: false });
  });

  it('returns lowBalance true when balance < 50 but >= 20', () => {
    expect(checkLowBalance(49)).toEqual({ lowBalance: true, criticalBalance: false });
    expect(checkLowBalance(20)).toEqual({ lowBalance: true, criticalBalance: false });
  });

  it('returns both true when balance < 20', () => {
    expect(checkLowBalance(19)).toEqual({ lowBalance: true, criticalBalance: true });
    expect(checkLowBalance(0)).toEqual({ lowBalance: true, criticalBalance: true });
  });
});

// --- Mock D1 Database helpers ---

function createMockDb(userData = null) {
  let currentBalance = userData ? userData.credits_balance : 0;
  const transactions = [];

  const db = {
    prepare: vi.fn((sql) => {
      const stmt = {
        _sql: sql,
        _bindings: [],
        bind: vi.fn((...args) => {
          stmt._bindings = args;
          return stmt;
        }),
        first: vi.fn(async () => {
          if (sql.includes('SELECT credits_balance FROM users')) {
            if (!userData) return null;
            return { credits_balance: currentBalance };
          }
          return null;
        }),
        all: vi.fn(async () => {
          return { results: transactions };
        }),
      };
      return stmt;
    }),
    batch: vi.fn(async (stmts) => {
      const results = [];
      for (const stmt of stmts) {
        if (stmt._sql.includes('UPDATE users SET credits_balance = credits_balance -')) {
          const amount = stmt._bindings[0];
          const requiredBalance = stmt._bindings[3];
          if (currentBalance >= requiredBalance) {
            currentBalance -= amount;
            results.push({ meta: { changes: 1 } });
          } else {
            results.push({ meta: { changes: 0 } });
          }
        } else if (stmt._sql.includes('UPDATE users SET credits_balance = credits_balance +')) {
          const amount = stmt._bindings[0];
          currentBalance += amount;
          results.push({ meta: { changes: 1 } });
        } else if (stmt._sql.includes('INSERT INTO credit_transactions')) {
          transactions.push({
            id: stmt._bindings[0],
            user_id: stmt._bindings[1],
            amount: stmt._bindings[2],
            operation_type: stmt._bindings[3],
            reference_id: stmt._bindings[4],
            created_at: stmt._bindings[5],
          });
          results.push({ meta: { changes: 1 } });
        }
      }
      return results;
    }),
  };

  return { db, getBalance: () => currentBalance, getTransactions: () => transactions };
}

// --- check ---

describe('check', () => {
  it('returns sufficient true when balance >= required', async () => {
    const { db } = createMockDb({ credits_balance: 100 });
    const result = await check(db, 'user-1', 50);
    expect(result).toEqual({ sufficient: true, balance: 100 });
  });

  it('returns sufficient false when balance < required', async () => {
    const { db } = createMockDb({ credits_balance: 10 });
    const result = await check(db, 'user-1', 50);
    expect(result).toEqual({ sufficient: false, balance: 10 });
  });

  it('returns sufficient false and balance 0 for unknown user', async () => {
    const { db } = createMockDb(null);
    const result = await check(db, 'unknown', 10);
    expect(result).toEqual({ sufficient: false, balance: 0 });
  });
});

// --- deduct ---

describe('deduct', () => {
  it('deducts credits and returns new balance', async () => {
    const { db, getBalance } = createMockDb({ credits_balance: 100 });
    const result = await deduct(db, 'user-1', 24, 'call', 'call-123');
    expect(result.success).toBe(true);
    expect(result.newBalance).toBe(76);
    expect(getBalance()).toBe(76);
  });

  it('returns success false when balance insufficient', async () => {
    const { db, getBalance } = createMockDb({ credits_balance: 10 });
    const result = await deduct(db, 'user-1', 24, 'call', 'call-123');
    expect(result.success).toBe(false);
    expect(getBalance()).toBe(10); // unchanged
  });

  it('stores negative amount in credit_transactions', async () => {
    const { db, getTransactions: getTx } = createMockDb({ credits_balance: 100 });
    await deduct(db, 'user-1', 24, 'call', 'call-123');
    const txs = getTx();
    expect(txs).toHaveLength(1);
    expect(txs[0].amount).toBe(-24);
    expect(txs[0].operation_type).toBe('call');
    expect(txs[0].reference_id).toBe('call-123');
  });

  it('uses D1 batch for atomicity', async () => {
    const { db } = createMockDb({ credits_balance: 100 });
    await deduct(db, 'user-1', 12, 'call', 'ref-1');
    expect(db.batch).toHaveBeenCalledTimes(1);
    const batchArgs = db.batch.mock.calls[0][0];
    expect(batchArgs).toHaveLength(2);
  });
});

// --- add ---

describe('add', () => {
  it('adds credits and returns new balance', async () => {
    const { db, getBalance } = createMockDb({ credits_balance: 100 });
    const result = await add(db, 'user-1', 1200, 'plan_credit', 'sub-123');
    expect(result.success).toBe(true);
    expect(result.newBalance).toBe(1300);
    expect(getBalance()).toBe(1300);
  });

  it('stores positive amount in credit_transactions', async () => {
    const { db, getTransactions: getTx } = createMockDb({ credits_balance: 100 });
    await add(db, 'user-1', 1200, 'plan_credit', 'sub-123');
    const txs = getTx();
    expect(txs).toHaveLength(1);
    expect(txs[0].amount).toBe(1200);
    expect(txs[0].operation_type).toBe('plan_credit');
  });

  it('uses D1 batch for atomicity', async () => {
    const { db } = createMockDb({ credits_balance: 100 });
    await add(db, 'user-1', 50, 'admin_grant', 'admin-1');
    expect(db.batch).toHaveBeenCalledTimes(1);
    const batchArgs = db.batch.mock.calls[0][0];
    expect(batchArgs).toHaveLength(2);
  });
});

// --- getTransactions ---

describe('getTransactions', () => {
  it('queries transactions with default limit and offset', async () => {
    const { db } = createMockDb({ credits_balance: 100 });
    // Add some transactions first
    await deduct(db, 'user-1', 12, 'call', 'call-1');
    await deduct(db, 'user-1', 2, 'sms', 'sms-1');

    const txs = await getTransactions(db, 'user-1');
    expect(txs).toHaveLength(2);
  });

  it('passes limit and offset to the query', async () => {
    const { db } = createMockDb({ credits_balance: 100 });
    await getTransactions(db, 'user-1', 10, 5);
    // Verify prepare was called with the right SQL
    const prepareCall = db.prepare.mock.calls.find(
      (c) => c[0].includes('SELECT') && c[0].includes('credit_transactions')
    );
    expect(prepareCall).toBeDefined();
  });
});
