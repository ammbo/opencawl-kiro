import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signJWT } from './lib/jwt.js';

// We need to test the middleware by importing it and calling the handler
// The middleware exports onRequest as an array with one async function
import { onRequest } from './_middleware.js';

const middleware = onRequest[0];

const JWT_SECRET = 'test-secret-key-for-middleware';

/**
 * Creates a mock Cloudflare Pages context object.
 */
function createContext(url, { headers = {}, dbResults = {} } = {}) {
  const request = new Request(url, { headers });
  const nextResponse = new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  const prepareStubs = {};

  const context = {
    request,
    env: {
      JWT_SECRET,
      DB: {
        prepare(sql) {
          return {
            bind(...args) {
              const key = `${sql}::${args.join(',')}`;
              return {
                async first() {
                  // Check for specific query matches
                  for (const [pattern, result] of Object.entries(dbResults)) {
                    if (sql.includes(pattern) || key.includes(pattern)) {
                      return typeof result === 'function' ? result(...args) : result;
                    }
                  }
                  return null;
                },
              };
            },
          };
        },
      },
    },
    data: {},
    next: vi.fn(() => Promise.resolve(nextResponse)),
  };

  return context;
}

describe('Middleware (_middleware.js)', () => {
  describe('Public routes', () => {
    it('passes through /api/auth/send-code without auth', async () => {
      const ctx = createContext('https://example.com/api/auth/send-code');
      const res = await middleware(ctx);
      expect(ctx.next).toHaveBeenCalled();
    });

    it('passes through /api/auth/verify-code without auth', async () => {
      const ctx = createContext('https://example.com/api/auth/verify-code');
      await middleware(ctx);
      expect(ctx.next).toHaveBeenCalled();
    });

    it('does NOT pass through /api/waitlist/join (removed from public paths)', async () => {
      const ctx = createContext('https://example.com/api/waitlist/join');
      const res = await middleware(ctx);
      expect(ctx.next).not.toHaveBeenCalled();
      expect(res.status).toBe(401);
    });

    it('passes through /api/webhooks/* without auth', async () => {
      const ctx = createContext('https://example.com/api/webhooks/stripe');
      await middleware(ctx);
      expect(ctx.next).toHaveBeenCalled();
    });

    it('passes through /api/webhooks/elevenlabs/post-call without auth', async () => {
      const ctx = createContext('https://example.com/api/webhooks/elevenlabs/post-call');
      await middleware(ctx);
      expect(ctx.next).toHaveBeenCalled();
    });
  });

  describe('Non-API paths (static assets)', () => {
    it('passes through root path', async () => {
      const ctx = createContext('https://example.com/');
      await middleware(ctx);
      expect(ctx.next).toHaveBeenCalled();
    });

    it('passes through /dashboard path', async () => {
      const ctx = createContext('https://example.com/dashboard');
      await middleware(ctx);
      expect(ctx.next).toHaveBeenCalled();
    });
  });

  describe('Bearer token auth (/api/openclaw/*)', () => {
    it('returns 401 when no Authorization header and no session cookie', async () => {
      const ctx = createContext('https://example.com/api/openclaw/call');
      const res = await middleware(ctx);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(ctx.next).not.toHaveBeenCalled();
    });

    it('returns 401 when Authorization header is not Bearer and no session cookie', async () => {
      const ctx = createContext('https://example.com/api/openclaw/call', {
        headers: { Authorization: 'Basic abc123' },
      });
      const res = await middleware(ctx);
      expect(res.status).toBe(401);
      expect(ctx.next).not.toHaveBeenCalled();
    });

    it('returns 401 when API key hash not found in DB', async () => {
      const ctx = createContext('https://example.com/api/openclaw/call', {
        headers: { Authorization: 'Bearer invalid-key' },
        dbResults: {},
      });
      const res = await middleware(ctx);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.message).toContain('Invalid or revoked');
      expect(ctx.next).not.toHaveBeenCalled();
    });

    it('authenticates and attaches user when valid API key found', async () => {
      const ctx = createContext('https://example.com/api/openclaw/credits', {
        headers: { Authorization: 'Bearer valid-api-key-token' },
        dbResults: {
          api_keys: {
            user_id: 'user-123',
            phone: '+15551234567',
            plan: 'starter',
            credits_balance: 1000,
            voice_id: 'voice-1',
            twilio_phone_number: '+15559876543',
            is_admin: 0,
            stripe_customer_id: 'cus_123',
          },
        },
      });
      await middleware(ctx);
      expect(ctx.next).toHaveBeenCalled();
      expect(ctx.data.user).toEqual({
        id: 'user-123',
        phone: '+15551234567',
        plan: 'starter',
        credits_balance: 1000,
        voice_id: 'voice-1',
        twilio_phone_number: '+15559876543',
        is_admin: 0,
        stripe_customer_id: 'cus_123',
      });
    });
  });

  describe('Session cookie fallback auth (/api/openclaw/*)', () => {
    it('authenticates /api/openclaw/call with valid session cookie when no Bearer token', async () => {
      const token = await signJWT(
        { sub: 'user-session-1', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 },
        JWT_SECRET,
      );
      const ctx = createContext('https://example.com/api/openclaw/call', {
        headers: { Cookie: `session=${token}` },
        dbResults: {
          users: {
            id: 'user-session-1',
            phone: '+15551112222',
            plan: 'free',
            credits_balance: 100,
            voice_id: null,
            twilio_phone_number: null,
            is_admin: 0,
            stripe_customer_id: null,
          },
        },
      });
      await middleware(ctx);
      expect(ctx.next).toHaveBeenCalled();
      expect(ctx.data.user.id).toBe('user-session-1');
      expect(ctx.data.user.plan).toBe('free');
    });

    it('authenticates /api/openclaw/status with valid session cookie', async () => {
      const token = await signJWT(
        { sub: 'user-session-2', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 },
        JWT_SECRET,
      );
      const ctx = createContext('https://example.com/api/openclaw/status', {
        headers: { Cookie: `session=${token}` },
        dbResults: {
          users: {
            id: 'user-session-2',
            phone: '+15553334444',
            plan: 'starter',
            credits_balance: 500,
            voice_id: 'voice-2',
            twilio_phone_number: '+15559998888',
            is_admin: 0,
            stripe_customer_id: 'cus_456',
          },
        },
      });
      await middleware(ctx);
      expect(ctx.next).toHaveBeenCalled();
      expect(ctx.data.user.id).toBe('user-session-2');
      expect(ctx.data.user.plan).toBe('starter');
    });

    it('authenticates /api/openclaw/credits with valid session cookie', async () => {
      const token = await signJWT(
        { sub: 'user-session-3', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 },
        JWT_SECRET,
      );
      const ctx = createContext('https://example.com/api/openclaw/credits', {
        headers: { Cookie: `session=${token}` },
        dbResults: {
          users: {
            id: 'user-session-3',
            phone: '+15555556666',
            plan: 'pro',
            credits_balance: 9999,
            voice_id: 'voice-3',
            twilio_phone_number: '+15557778888',
            is_admin: 0,
            stripe_customer_id: 'cus_789',
          },
        },
      });
      await middleware(ctx);
      expect(ctx.next).toHaveBeenCalled();
      expect(ctx.data.user.id).toBe('user-session-3');
      expect(ctx.data.user.plan).toBe('pro');
    });

    it('returns 401 on /api/openclaw/call with invalid session cookie and no Bearer', async () => {
      const ctx = createContext('https://example.com/api/openclaw/call', {
        headers: { Cookie: 'session=invalid.jwt.token' },
      });
      const res = await middleware(ctx);
      expect(res.status).toBe(401);
      expect(ctx.next).not.toHaveBeenCalled();
      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toContain('Invalid or expired session');
    });

    it('returns 401 on /api/openclaw/call with expired session cookie and no Bearer', async () => {
      const token = await signJWT(
        { sub: 'user-expired', iat: Math.floor(Date.now() / 1000) - 7200, exp: Math.floor(Date.now() / 1000) - 3600 },
        JWT_SECRET,
      );
      const ctx = createContext('https://example.com/api/openclaw/call', {
        headers: { Cookie: `session=${token}` },
      });
      const res = await middleware(ctx);
      expect(res.status).toBe(401);
      expect(ctx.next).not.toHaveBeenCalled();
    });

    it('returns 401 on /api/openclaw/call when session user not found in DB', async () => {
      const token = await signJWT(
        { sub: 'nonexistent-user', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 },
        JWT_SECRET,
      );
      const ctx = createContext('https://example.com/api/openclaw/call', {
        headers: { Cookie: `session=${token}` },
        dbResults: {},
      });
      const res = await middleware(ctx);
      expect(res.status).toBe(401);
      expect(ctx.next).not.toHaveBeenCalled();
      const body = await res.json();
      expect(body.error.message).toContain('User not found');
    });

    it('prefers Bearer token over session cookie when both are present', async () => {
      const token = await signJWT(
        { sub: 'user-session-ignored', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 },
        JWT_SECRET,
      );
      const ctx = createContext('https://example.com/api/openclaw/call', {
        headers: {
          Authorization: 'Bearer valid-api-key-token',
          Cookie: `session=${token}`,
        },
        dbResults: {
          api_keys: {
            user_id: 'user-bearer',
            phone: '+15551234567',
            plan: 'starter',
            credits_balance: 1000,
            voice_id: 'voice-1',
            twilio_phone_number: '+15559876543',
            is_admin: 0,
            stripe_customer_id: 'cus_123',
          },
        },
      });
      await middleware(ctx);
      expect(ctx.next).toHaveBeenCalled();
      expect(ctx.data.user.id).toBe('user-bearer');
    });
  });

  describe('JWT session auth (/api/* protected routes)', () => {
    it('returns 401 when no session cookie', async () => {
      const ctx = createContext('https://example.com/api/auth/me');
      const res = await middleware(ctx);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toContain('Missing session cookie');
    });

    it('returns 401 when JWT is invalid', async () => {
      const ctx = createContext('https://example.com/api/auth/me', {
        headers: { Cookie: 'session=invalid.jwt.token' },
      });
      const res = await middleware(ctx);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.message).toContain('Invalid or expired');
    });

    it('returns 401 when user not found in DB', async () => {
      const token = await signJWT(
        { sub: 'nonexistent-user', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 },
        JWT_SECRET,
      );
      const ctx = createContext('https://example.com/api/auth/me', {
        headers: { Cookie: `session=${token}` },
        dbResults: {},
      });
      const res = await middleware(ctx);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.message).toContain('User not found');
    });

    it('authenticates and attaches user with valid JWT', async () => {
      const token = await signJWT(
        { sub: 'user-456', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 },
        JWT_SECRET,
      );
      const ctx = createContext('https://example.com/api/keys/list', {
        headers: { Cookie: `session=${token}` },
        dbResults: {
          users: {
            id: 'user-456',
            phone: '+15551112222',
            plan: 'pro',
            credits_balance: 4200,
            voice_id: null,
            is_admin: 0,
          },
        },
      });
      await middleware(ctx);
      expect(ctx.next).toHaveBeenCalled();
      expect(ctx.data.user.id).toBe('user-456');
      expect(ctx.data.user.plan).toBe('pro');
    });
  });

  describe('Admin routes (/api/admin/*)', () => {
    it('returns 403 when user is not admin', async () => {
      const token = await signJWT(
        { sub: 'user-789', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 },
        JWT_SECRET,
      );
      const ctx = createContext('https://example.com/api/admin/stats', {
        headers: { Cookie: `session=${token}` },
        dbResults: {
          users: {
            id: 'user-789',
            phone: '+15553334444',
            plan: 'pro',
            credits_balance: 100,
            voice_id: null,
            is_admin: 0,
          },
        },
      });
      const res = await middleware(ctx);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('allows admin user to access admin routes', async () => {
      const token = await signJWT(
        { sub: 'admin-1', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 },
        JWT_SECRET,
      );
      const ctx = createContext('https://example.com/api/admin/users', {
        headers: { Cookie: `session=${token}` },
        dbResults: {
          users: {
            id: 'admin-1',
            phone: '+15550000000',
            plan: 'pro',
            credits_balance: 9999,
            voice_id: null,
            is_admin: 1,
          },
        },
      });
      await middleware(ctx);
      expect(ctx.next).toHaveBeenCalled();
      expect(ctx.data.user.is_admin).toBe(1);
    });
  });

  describe('Error response format', () => {
    it('returns consistent JSON error structure', async () => {
      const ctx = createContext('https://example.com/api/billing/usage');
      const res = await middleware(ctx);
      expect(res.headers.get('Content-Type')).toBe('application/json');
      const body = await res.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('message');
    });
  });
});
