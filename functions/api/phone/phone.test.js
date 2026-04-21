import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestPost as provision } from './provision.js';
import { onRequestPost as configure } from './configure.js';

const PAID_USER = {
  id: 'user-paid-1',
  phone: '+15551234567',
  plan: 'starter',
  credits_balance: 1000,
  voice_id: null,
  twilio_phone_number: null,
};

const FREE_USER = {
  id: 'user-free-1',
  phone: '+15559876543',
  plan: 'free',
  credits_balance: 250,
  voice_id: null,
  twilio_phone_number: null,
};

const PROVISIONED_USER = {
  ...PAID_USER,
  id: 'user-prov-1',
  twilio_phone_number: '+14155551234',
};

const ENV = {
  TWILIO_ACCOUNT_SID: 'ACtest123',
  TWILIO_AUTH_TOKEN: 'authtoken456',
  ELEVENLABS_API_KEY: 'xi-test-key',
  ELEVENLABS_AGENT_ID: 'agent-test-id',
};

/**
 * Creates a mock context for phone endpoints.
 */
function createContext({ user = PAID_USER, body = null, dbFirstResult = null } = {}) {
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== null) {
    init.body = JSON.stringify(body);
  }

  const request = new Request('https://example.com/api/phone/provision', init);
  const dbOps = [];

  const stmtMethods = (sql, args = []) => ({
    async run() {
      dbOps.push({ sql, args, op: 'run' });
      return { success: true, meta: { changes: 1 } };
    },
    async first() {
      dbOps.push({ sql, args, op: 'first' });
      return dbFirstResult;
    },
  });

  const context = {
    request,
    env: {
      ...ENV,
      DB: {
        prepare(sql) {
          return {
            ...stmtMethods(sql),
            bind(...args) {
              return stmtMethods(sql, args);
            },
          };
        },
      },
    },
    data: { user },
    _dbOps: dbOps,
  };

  return context;
}

let originalFetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ─── POST /api/phone/provision ───

describe('POST /api/phone/provision', () => {
  it('returns 409 if paid user already has a phone number', async () => {
    const ctx = createContext({ user: PROVISIONED_USER });
    const res = await provision(ctx);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error.code).toBe('CONFLICT');
  });

  it('provisions a Twilio number for paid user and returns it', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('twilio.com') && url.includes('IncomingPhoneNumbers.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ phone_number: '+14155559999', sid: 'PN123' }),
        });
      }
      if (url.includes('elevenlabs.io')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'el-123' }) });
      }
      return Promise.resolve({ ok: false });
    });

    const ctx = createContext();
    const res = await provision(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.phone_number).toBe('+14155559999');

    // Verify DB update was called
    const updateOp = ctx._dbOps.find((op) => op.sql.includes('UPDATE users'));
    expect(updateOp).toBeDefined();
    expect(updateOp.args[0]).toBe('+14155559999');
  });

  it('returns 500 when Twilio API fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve('Twilio error'),
    });

    const ctx = createContext();
    const res = await provision(ctx);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error.code).toBe('TWILIO_ERROR');
  });

  it('returns 500 when Twilio fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const ctx = createContext();
    const res = await provision(ctx);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error.code).toBe('TWILIO_ERROR');
  });

  it('assigns shared pool number for free-tier user', async () => {
    const ctx = createContext({
      user: FREE_USER,
      dbFirstResult: { phone_number: '+14155550000' },
    });

    const res = await provision(ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.phone_number).toBe('+14155550000');
    expect(data.shared).toBe(true);
  });

  it('returns 503 when no shared numbers available for free user', async () => {
    const ctx = createContext({ user: FREE_USER, dbFirstResult: null });
    const res = await provision(ctx);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error.code).toBe('NO_NUMBERS_AVAILABLE');
  });
});

// ─── POST /api/phone/configure ───

describe('POST /api/phone/configure', () => {
  it('returns 404 if user has no phone number', async () => {
    const ctx = createContext({ user: PAID_USER, body: { webhook_url: 'https://example.com/hook' } });
    ctx.request = new Request('https://example.com/api/phone/configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhook_url: 'https://example.com/hook' }),
    });

    const res = await configure(ctx);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for invalid JSON body', async () => {
    const ctx = createContext({ user: PROVISIONED_USER });
    ctx.request = new Request('https://example.com/api/phone/configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });

    const res = await configure(ctx);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
  });

  it('updates webhook URL via Twilio API', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('IncomingPhoneNumbers.json?PhoneNumber=')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              incoming_phone_numbers: [{ sid: 'PN456' }],
            }),
        });
      }
      if (url.includes('IncomingPhoneNumbers/PN456.json')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ sid: 'PN456' }) });
      }
      return Promise.resolve({ ok: false });
    });

    const ctx = createContext({ user: PROVISIONED_USER });
    ctx.request = new Request('https://example.com/api/phone/configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhook_url: 'https://example.com/new-hook' }),
    });

    const res = await configure(ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('returns 500 when Twilio lookup fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });

    const ctx = createContext({ user: PROVISIONED_USER });
    ctx.request = new Request('https://example.com/api/phone/configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhook_url: 'https://example.com/hook' }),
    });

    const res = await configure(ctx);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error.code).toBe('TWILIO_ERROR');
  });

  it('returns 400 when no configuration changes provided', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('IncomingPhoneNumbers.json?PhoneNumber=')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              incoming_phone_numbers: [{ sid: 'PN456' }],
            }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const ctx = createContext({ user: PROVISIONED_USER });
    ctx.request = new Request('https://example.com/api/phone/configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await configure(ctx);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
  });
});
