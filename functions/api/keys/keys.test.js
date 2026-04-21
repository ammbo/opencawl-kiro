import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestPost as createKey } from './create.js';
import { onRequestGet as listKeys } from './list.js';
import { onRequestPost as revokeKey } from './revoke.js';

const TEST_USER = {
  id: 'user-123',
  phone: '+15551234567',
  plan: 'starter',
  credits_balance: 1000,
  voice_id: null,
};

/**
 * Helper to create a mock context for key endpoints.
 */
function createContext({ method = 'POST', body = null, user = TEST_USER, dbResults = [], dbChanges = 1 } = {}) {
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== null) {
    init.body = JSON.stringify(body);
  }

  const request = new Request('https://example.com/api/keys/test', init);
  const dbInserts = [];

  const context = {
    request,
    env: {
      DB: {
        prepare(sql) {
          return {
            bind(...args) {
              return {
                async run() {
                  if (sql.includes('INSERT')) {
                    dbInserts.push({ sql, args });
                  }
                  return { success: true, meta: { changes: dbChanges } };
                },
                async all() {
                  return { results: dbResults };
                },
              };
            },
          };
        },
      },
    },
    data: { user },
    _dbInserts: dbInserts,
  };

  return context;
}

describe('POST /api/keys/create', () => {
  it('returns 200 with plaintext key and prefix', async () => {
    const ctx = createContext();
    const res = await createKey(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.key).toBeDefined();
    expect(data.prefix).toBeDefined();
    expect(data.key.length).toBe(64); // 32 bytes hex
    expect(data.prefix).toBe(data.key.slice(0, 8));
  });

  it('inserts key hash into database', async () => {
    const ctx = createContext();
    await createKey(ctx);

    expect(ctx._dbInserts.length).toBe(1);
    const insert = ctx._dbInserts[0];
    expect(insert.sql).toContain('INSERT INTO api_keys');
    // args: id, user_id, keyHash, prefix, now
    expect(insert.args[1]).toBe('user-123');
  });

  it('returns 500 when DB insert fails', async () => {
    const ctx = createContext();
    ctx.env.DB.prepare = () => ({
      bind() {
        return {
          async run() {
            throw new Error('DB error');
          },
        };
      },
    });

    const res = await createKey(ctx);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error.code).toBe('INTERNAL_ERROR');
  });
});

describe('GET /api/keys/list', () => {
  it('returns 200 with empty keys array', async () => {
    const ctx = createContext({ method: 'GET', dbResults: [] });
    const res = await listKeys(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.keys).toEqual([]);
  });

  it('returns keys with prefix, status, and dates — no hash', async () => {
    const mockKeys = [
      { id: 'key-1', key_prefix: 'abcd1234', is_active: 1, created_at: '2024-01-01T00:00:00Z', revoked_at: null },
      { id: 'key-2', key_prefix: 'efgh5678', is_active: 0, created_at: '2024-01-02T00:00:00Z', revoked_at: '2024-01-03T00:00:00Z' },
    ];

    const ctx = createContext({ method: 'GET', dbResults: mockKeys });
    const res = await listKeys(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.keys.length).toBe(2);
    expect(data.keys[0].key_prefix).toBe('abcd1234');
    expect(data.keys[0].key_hash).toBeUndefined();
    expect(data.keys[1].is_active).toBe(0);
    expect(data.keys[1].revoked_at).toBe('2024-01-03T00:00:00Z');
  });

  it('returns 500 when DB query fails', async () => {
    const ctx = createContext({ method: 'GET' });
    ctx.env.DB.prepare = () => ({
      bind() {
        return {
          async all() {
            throw new Error('DB error');
          },
        };
      },
    });

    const res = await listKeys(ctx);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error.code).toBe('INTERNAL_ERROR');
  });
});

describe('POST /api/keys/revoke', () => {
  it('returns 200 with success on valid revoke', async () => {
    const ctx = createContext({ body: { key_id: 'key-1' }, dbChanges: 1 });
    const res = await revokeKey(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('returns 404 when key not found or not owned by user', async () => {
    const ctx = createContext({ body: { key_id: 'nonexistent' }, dbChanges: 0 });
    const res = await revokeKey(ctx);
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 when key_id is missing', async () => {
    const ctx = createContext({ body: {} });
    const res = await revokeKey(ctx);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
  });

  it('returns 400 when body is not valid JSON', async () => {
    const ctx = createContext();
    ctx.request = new Request('https://example.com/api/keys/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });

    const res = await revokeKey(ctx);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
  });

  it('returns 500 when DB update fails', async () => {
    const ctx = createContext({ body: { key_id: 'key-1' } });
    ctx.env.DB.prepare = () => ({
      bind() {
        return {
          async run() {
            throw new Error('DB error');
          },
        };
      },
    });

    const res = await revokeKey(ctx);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error.code).toBe('INTERNAL_ERROR');
  });
});
