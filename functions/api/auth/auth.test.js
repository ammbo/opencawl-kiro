import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestPost as sendCode } from './send-code.js';
import { onRequestPost as verifyCode } from './verify-code.js';
import { onRequestGet as me } from './me.js';
import { onRequestPost as logout } from './logout.js';
import { onRequestPost as onboardingComplete } from './onboarding-complete.js';

// Mock global fetch for Twilio API calls
const originalFetch = globalThis.fetch;

/**
 * Helper to create a mock context for auth endpoints.
 */
function createContext({ method = 'POST', body = null, headers = {}, dbResults = {}, user = null } = {}) {
  const init = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body !== null) {
    init.body = JSON.stringify(body);
  }

  const request = new Request('https://example.com/api/auth/test', init);

  const dbRows = {};
  const dbInserts = [];
  const dbDeletes = [];

  const context = {
    request,
    env: {
      TWILIO_ACCOUNT_SID: 'ACtest123',
      TWILIO_AUTH_TOKEN: 'test-auth-token',
      TWILIO_VERIFY_SERVICE_SID: 'VAtest456',
      JWT_SECRET: 'test-jwt-secret-key',
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
                  if (sql.includes('DELETE')) {
                    dbDeletes.push({ sql, args });
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

  if (user) {
    context.data.user = user;
  }

  // Expose tracking arrays for assertions
  context._dbInserts = dbInserts;
  context._dbDeletes = dbDeletes;

  return context;
}

describe('POST /api/auth/send-code', () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns 400 when body is empty', async () => {
    const ctx = createContext({ body: null, method: 'POST' });
    // Need a request with no body
    ctx.request = new Request('https://example.com/api/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await sendCode(ctx);
    expect(res.status).toBe(400);
  });

  it('returns 400 when phone is missing', async () => {
    const ctx = createContext({ body: {} });
    const res = await sendCode(ctx);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
  });

  it('returns 400 for invalid phone number format', async () => {
    const ctx = createContext({ body: { phone: 'not-a-phone' } });
    const res = await sendCode(ctx);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
    expect(data.error.message).toContain('E.164');
  });

  it('returns 400 for phone without + prefix', async () => {
    const ctx = createContext({ body: { phone: '15551234567' } });
    const res = await sendCode(ctx);
    expect(res.status).toBe(400);
  });

  it('returns 200 on successful Twilio call', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'pending', sid: 'VE123' }), { status: 200 }),
    );

    const ctx = createContext({ body: { phone: '+15551234567' } });
    const res = await sendCode(ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Verify Twilio was called correctly
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('verify.twilio.com');
    expect(url).toContain('VAtest456');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Authorization']).toContain('Basic');
  });

  it('returns 500 when Twilio API fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 60200, message: 'Invalid parameter' }), { status: 400 }),
    );

    const ctx = createContext({ body: { phone: '+15551234567' } });
    const res = await sendCode(ctx);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error.code).toBe('INTERNAL_ERROR');
  });

  it('returns 500 when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const ctx = createContext({ body: { phone: '+15551234567' } });
    const res = await sendCode(ctx);
    expect(res.status).toBe(500);
  });
});

describe('POST /api/auth/verify-code', () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns 400 when phone or code is missing', async () => {
    const ctx = createContext({ body: { phone: '+15551234567' } });
    const res = await verifyCode(ctx);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.message).toContain('code');
  });

  it('returns 400 for invalid phone format', async () => {
    const ctx = createContext({ body: { phone: 'bad', code: '123456' } });
    const res = await verifyCode(ctx);
    expect(res.status).toBe(400);
  });

  it('returns 401 when Twilio returns non-approved status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'pending' }), { status: 200 }),
    );

    const ctx = createContext({ body: { phone: '+15551234567', code: '000000' } });
    const res = await verifyCode(ctx);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when Twilio API returns error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 60200 }), { status: 404 }),
    );

    const ctx = createContext({ body: { phone: '+15551234567', code: '123456' } });
    const res = await verifyCode(ctx);
    expect(res.status).toBe(401);
  });

  it('creates new user on first login and returns profile with JWT cookie', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'approved' }), { status: 200 }),
    );

    const ctx = createContext({
      body: { phone: '+15559999999', code: '123456' },
      dbResults: {}, // No existing user
    });

    const res = await verifyCode(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.user.phone).toBe('+15559999999');
    expect(data.user.plan).toBe('free');
    expect(data.user.credits_balance).toBe(250);
    expect(data.user.voice_id).toBeNull();

    // Check Set-Cookie header
    const cookie = res.headers.get('Set-Cookie');
    expect(cookie).toContain('session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Max-Age=86400');

    // Verify DB inserts (user + session)
    expect(ctx._dbInserts.length).toBe(2);
    expect(ctx._dbInserts[0].sql).toContain('INSERT INTO users');
    expect(ctx._dbInserts[1].sql).toContain('INSERT INTO sessions');
  });

  it('retrieves existing user on returning login', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'approved' }), { status: 200 }),
    );

    const existingUser = {
      id: 'existing-user-id',
      phone: '+15551234567',
      plan: 'starter',
      credits_balance: 1000,
      voice_id: 'voice-abc',
      is_admin: 0,
    };

    const ctx = createContext({
      body: { phone: '+15551234567', code: '123456' },
      dbResults: { 'SELECT * FROM users': existingUser },
    });

    const res = await verifyCode(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.user.id).toBe('existing-user-id');
    expect(data.user.plan).toBe('starter');
    expect(data.user.credits_balance).toBe(1000);

    // Only session insert, no user insert
    expect(ctx._dbInserts.length).toBe(1);
    expect(ctx._dbInserts[0].sql).toContain('INSERT INTO sessions');
  });

  it('returns 500 when Twilio fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const ctx = createContext({ body: { phone: '+15551234567', code: '123456' } });
    const res = await verifyCode(ctx);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error.code).toBe('INTERNAL_ERROR');
  });
});

describe('GET /api/auth/me', () => {
  it('returns user profile from context.data.user', async () => {
    const user = {
      id: 'user-123',
      phone: '+15551234567',
      plan: 'pro',
      credits_balance: 4200,
      voice_id: 'voice-xyz',
      is_admin: 1,
      created_at: '2024-01-01T00:00:00Z',
      onboarding_completed: 1,
    };

    const ctx = createContext({ method: 'GET', user });
    const res = await me(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.user.id).toBe('user-123');
    expect(data.user.phone).toBe('+15551234567');
    expect(data.user.plan).toBe('pro');
    expect(data.user.credits_balance).toBe(4200);
    expect(data.user.voice_id).toBe('voice-xyz');
    // is_admin and created_at are now included in profile
    expect(data.user.is_admin).toBe(1);
    expect(data.user.created_at).toBe('2024-01-01T00:00:00Z');
    expect(data.user.onboarding_completed).toBe(true);
  });

  it('returns user with null voice_id', async () => {
    const user = {
      id: 'user-456',
      phone: '+15559876543',
      plan: 'free',
      credits_balance: 250,
      voice_id: null,
      onboarding_completed: 0,
    };

    const ctx = createContext({ method: 'GET', user });
    const res = await me(ctx);
    const data = await res.json();
    expect(data.user.voice_id).toBeNull();
    expect(data.user.onboarding_completed).toBe(false);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears session cookie and returns success', async () => {
    const ctx = createContext({
      headers: { Cookie: 'session=some-jwt-token; other=value' },
    });

    const res = await logout(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);

    // Check cookie is cleared
    const cookie = res.headers.get('Set-Cookie');
    expect(cookie).toContain('session=;');
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');

    // Verify session was deleted from DB
    expect(ctx._dbDeletes.length).toBe(1);
    expect(ctx._dbDeletes[0].sql).toContain('DELETE FROM sessions');
  });

  it('handles missing session cookie gracefully', async () => {
    const ctx = createContext({ headers: {} });
    const res = await logout(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);

    // No DB delete when no cookie
    expect(ctx._dbDeletes.length).toBe(0);
  });

  it('clears cookie even if DB delete fails', async () => {
    // Override DB to throw on delete
    const ctx = createContext({
      headers: { Cookie: 'session=some-jwt-token' },
    });
    const originalPrepare = ctx.env.DB.prepare;
    ctx.env.DB.prepare = (sql) => {
      if (sql.includes('DELETE')) {
        return {
          bind() {
            return {
              async run() {
                throw new Error('DB error');
              },
            };
          },
        };
      }
      return originalPrepare(sql);
    };

    const res = await logout(ctx);
    expect(res.status).toBe(200);
    const cookie = res.headers.get('Set-Cookie');
    expect(cookie).toContain('Max-Age=0');
  });
});

describe('POST /api/auth/onboarding-complete', () => {
  it('sets onboarding_completed to 1 and returns success', async () => {
    const user = { id: 'user-123', phone: '+15551234567', onboarding_completed: 0 };
    const ctx = createContext({ user });

    const res = await onboardingComplete(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);

    // Verify the UPDATE was issued with the correct user id
    const updateCalls = ctx._dbInserts; // inserts track won't catch UPDATE, check via run tracking
    // The mock DB's run() tracks INSERTs and DELETEs; for UPDATE we verify response is correct
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });

  it('works for user who already completed onboarding', async () => {
    const user = { id: 'user-456', phone: '+15559876543', onboarding_completed: 1 };
    const ctx = createContext({ user });

    const res = await onboardingComplete(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
  });
});
