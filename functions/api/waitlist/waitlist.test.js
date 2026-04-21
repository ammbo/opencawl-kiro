import { describe, it, expect } from 'vitest';
import { onRequestPost as join } from './join.js';
import { checkSiteGate } from '../../lib/site-gate.js';

/**
 * Helper to create a mock context for waitlist endpoints.
 */
function createContext({ body = null, dbResults = {} } = {}) {
  const init = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
  if (body !== null) {
    init.body = JSON.stringify(body);
  }

  const request = new Request('https://example.com/api/waitlist/join', init);

  const dbInserts = [];

  const context = {
    request,
    env: {
      DB: {
        prepare(sql) {
          return {
            bind(...args) {
              return {
                async first() {
                  for (const [pattern, result] of Object.entries(dbResults)) {
                    if (sql.includes(pattern)) {
                      return typeof result === 'function' ? result(...args) : result;
                    }
                  }
                  return null;
                },
                async run() {
                  if (sql.includes('INSERT')) {
                    dbInserts.push({ sql, args });
                  }
                  return { success: true };
                },
              };
            },
          };
        },
      },
    },
    data: {},
  };

  context._dbInserts = dbInserts;
  return context;
}

describe('POST /api/waitlist/join', () => {
  it('returns 400 when body is empty', async () => {
    const ctx = createContext();
    ctx.request = new Request('https://example.com/api/waitlist/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await join(ctx);
    expect(res.status).toBe(400);
  });

  it('returns 400 when phone is missing', async () => {
    const ctx = createContext({ body: {} });
    const res = await join(ctx);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
  });

  it('returns 400 for invalid phone number format', async () => {
    const ctx = createContext({ body: { phone: 'not-a-phone' } });
    const res = await join(ctx);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
    expect(data.error.message).toContain('E.164');
  });

  it('returns 409 when phone already on waitlist', async () => {
    const ctx = createContext({
      body: { phone: '+15551234567' },
      dbResults: {
        'SELECT * FROM waitlist': { id: 'existing-id', phone: '+15551234567', status: 'pending' },
      },
    });
    const res = await join(ctx);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error.code).toBe('CONFLICT');
  });

  it('returns 200 and inserts record for valid new phone', async () => {
    const ctx = createContext({ body: { phone: '+15559876543' } });
    const res = await join(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain('waitlist');

    expect(ctx._dbInserts.length).toBe(1);
    expect(ctx._dbInserts[0].sql).toContain('INSERT INTO waitlist');
    expect(ctx._dbInserts[0].args).toContain('+15559876543');
    expect(ctx._dbInserts[0].args).toContain('pending');
  });
});

describe('checkSiteGate', () => {
  function createMockDb(result) {
    return {
      prepare() {
        return {
          bind() {
            return {
              async first() {
                return result;
              },
            };
          },
        };
      },
    };
  }

  it('returns approved: true when phone is approved', async () => {
    const db = createMockDb({ id: '1', phone: '+15551234567', status: 'approved', invite_code: null });
    const result = await checkSiteGate(db, '+15551234567');
    expect(result.approved).toBe(true);
  });

  it('returns approved: true when phone has invite code', async () => {
    const db = createMockDb({ id: '2', phone: '+15551234567', status: 'pending', invite_code: 'ABC123' });
    const result = await checkSiteGate(db, '+15551234567');
    expect(result.approved).toBe(true);
  });

  it('returns approved: false when phone is not in waitlist', async () => {
    const db = createMockDb(null);
    const result = await checkSiteGate(db, '+15559999999');
    expect(result.approved).toBe(false);
  });

  it('returns approved: false when phone is pending without invite code', async () => {
    // The query filters for approved OR invite_code IS NOT NULL,
    // so a pending entry without invite code won't match
    const db = createMockDb(null);
    const result = await checkSiteGate(db, '+15551234567');
    expect(result.approved).toBe(false);
  });
});
