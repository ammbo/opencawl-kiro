import { describe, it, expect } from 'vitest';
import { onRequestGet as getStats } from './stats.js';
import { onRequestGet as getUsers } from './users.js';

/**
 * Helper to create a mock DB that routes queries by SQL pattern matching.
 */
function createMockDb(queryResults = {}) {
  const mutations = [];

  function makeExecutor(sql, args = []) {
    return {
      bind(...boundArgs) {
        return makeExecutor(sql, boundArgs);
      },
      async first() {
        for (const [pattern, result] of Object.entries(queryResults)) {
          if (sql.includes(pattern)) {
            return typeof result === 'function' ? result(...args) : result;
          }
        }
        return null;
      },
      async all() {
        for (const [pattern, result] of Object.entries(queryResults)) {
          if (sql.includes(pattern)) {
            const val = typeof result === 'function' ? result(...args) : result;
            return { results: val };
          }
        }
        return { results: [] };
      },
      async run() {
        mutations.push({ sql, args });
        return { success: true };
      },
    };
  }

  return {
    _mutations: mutations,
    prepare(sql) {
      return makeExecutor(sql);
    },
  };
}

function createGetContext(path, db) {
  return {
    request: new Request(`https://example.com${path}`, { method: 'GET' }),
    env: { DB: db },
    data: { user: { is_admin: 1 } },
  };
}

function createPostContext(path, body, db) {
  return {
    request: new Request(`https://example.com${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env: { DB: db },
    data: { user: { is_admin: 1 } },
  };
}

// --- GET /api/admin/stats ---
describe('GET /api/admin/stats', () => {
  it('returns total users, active calls, and credits consumed', async () => {
    const db = createMockDb({
      'COUNT(*) as total FROM users': { total: 42 },
      'COUNT(*) as total FROM calls': { total: 3 },
      'COALESCE(SUM(ABS(amount)), 0)': { total: 9500 },
    });
    const ctx = createGetContext('/api/admin/stats', db);
    const res = await getStats(ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total_users).toBe(42);
    expect(data.active_calls).toBe(3);
    expect(data.total_credits_consumed).toBe(9500);
  });

  it('returns zeros when no data exists', async () => {
    const db = createMockDb({
      'COUNT(*) as total FROM users': { total: 0 },
      'COUNT(*) as total FROM calls': { total: 0 },
      'COALESCE(SUM(ABS(amount)), 0)': { total: 0 },
    });
    const ctx = createGetContext('/api/admin/stats', db);
    const res = await getStats(ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total_users).toBe(0);
    expect(data.active_calls).toBe(0);
    expect(data.total_credits_consumed).toBe(0);
  });
});

// --- GET /api/admin/users ---
describe('GET /api/admin/users', () => {
  it('returns paginated user list with defaults', async () => {
    const users = [
      { id: 'u1', phone: '+15551111111', plan: 'free', credits_balance: 250, created_at: '2024-01-01T00:00:00Z' },
      { id: 'u2', phone: '+15552222222', plan: 'starter', credits_balance: 1200, created_at: '2024-01-02T00:00:00Z' },
    ];
    const db = createMockDb({ 'SELECT id, phone, plan': users });
    const ctx = createGetContext('/api/admin/users', db);
    const res = await getUsers(ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.users).toEqual(users);
    expect(data.page).toBe(1);
    expect(data.limit).toBe(50);
  });

  it('respects page and limit query params', async () => {
    const db = createMockDb({ 'SELECT id, phone, plan': [] });
    const ctx = createGetContext('/api/admin/users?page=2&limit=10', db);
    const res = await getUsers(ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.page).toBe(2);
    expect(data.limit).toBe(10);
  });

  it('clamps limit to max 100', async () => {
    const db = createMockDb({ 'SELECT id, phone, plan': [] });
    const ctx = createGetContext('/api/admin/users?limit=500', db);
    const res = await getUsers(ctx);
    const data = await res.json();
    expect(data.limit).toBe(100);
  });
});


