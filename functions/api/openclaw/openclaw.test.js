import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { onRequestPost as callEndpoint } from './call.js';
import { onRequestGet as statusEndpoint } from './status.js';
import { onRequestGet as creditsEndpoint } from './credits.js';

const TEST_USER = {
  id: 'user-abc',
  phone: '+15551234567',
  plan: 'starter',
  credits_balance: 500,
  voice_id: 'voice-xyz',
  twilio_phone_number: '+15559876543',
  is_admin: false,
};

/**
 * Creates a mock context for openclaw endpoints.
 */
function createContext({
  method = 'POST',
  body = null,
  user = TEST_USER,
  url = 'https://example.com/api/openclaw/call',
  dbFirstResult = null,
  dbChanges = 1,
  fetchResponse = { ok: true, status: 200, json: async () => ({}) },
} = {}) {
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== null) {
    init.body = JSON.stringify(body);
  }

  const request = new Request(url, init);
  const dbInserts = [];
  const dbUpdates = [];

  const context = {
    request,
    env: {
      DB: {
        prepare(sql) {
          return {
            bind(...args) {
              return {
                async run() {
                  if (sql.includes('INSERT')) dbInserts.push({ sql, args });
                  if (sql.includes('UPDATE')) dbUpdates.push({ sql, args });
                  return { success: true, meta: { changes: dbChanges } };
                },
                async first() {
                  return dbFirstResult;
                },
              };
            },
          };
        },
      },
      ELEVENLABS_API_KEY: 'xi-test-key',
      ELEVENLABS_AGENT_ID: 'agent-test-id',
      TWILIO_DEFAULT_NUMBER: '+15550001111',
    },
    data: { user: { ...user } },
    _dbInserts: dbInserts,
    _dbUpdates: dbUpdates,
  };

  return context;
}

// ─── POST /api/openclaw/call ────────────────────────────────────────────────

describe('POST /api/openclaw/call', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  function restoreFetch() {
    globalThis.fetch = originalFetch;
  }

  it('returns 200 with call_id and pending status on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const ctx = createContext({
      body: { destination_phone: '+14155551234', message: 'Hello from OpenClaw' },
    });

    // Mock the credit check — user has 500 credits
    ctx.env.DB.prepare = ((original) => {
      return function (sql) {
        if (sql.includes('SELECT credits_balance')) {
          return {
            bind() {
              return { async first() { return { credits_balance: 500 }; } };
            },
          };
        }
        return original.call(this, sql);
      };
    })(ctx.env.DB.prepare);

    const res = await callEndpoint(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.call_id).toBeDefined();
    expect(data.status).toBe('pending');

    restoreFetch();
  });

  it('returns 400 when destination_phone is missing', async () => {
    const ctx = createContext({ body: { message: 'Hello' } });
    const res = await callEndpoint(ctx);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
    expect(data.error.message).toContain('destination_phone');
  });

  it('returns 400 when message is missing and no system_prompt + first_message provided', async () => {
    const ctx = createContext({ body: { destination_phone: '+14155551234' } });
    const res = await callEndpoint(ctx);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
    expect(data.error.message).toContain('message');
  });

  it('succeeds without message when system_prompt and first_message are both provided (Req 1.8)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const ctx = createContext({
      body: {
        destination_phone: '+14155551234',
        system_prompt: 'You are a helpful assistant.',
        first_message: 'Hello there!',
      },
    });

    ctx.env.DB.prepare = ((original) => {
      return function (sql) {
        if (sql.includes('SELECT credits_balance')) {
          return {
            bind() {
              return { async first() { return { credits_balance: 500 }; } };
            },
          };
        }
        return original.call(this, sql);
      };
    })(ctx.env.DB.prepare);

    const res = await callEndpoint(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.call_id).toBeDefined();
    expect(data.status).toBe('pending');

    restoreFetch();
  });

  it('works with default behavior when no overrides provided (Req 1.4)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const ctx = createContext({
      body: { destination_phone: '+14155551234', message: 'Hello from OpenClaw' },
    });

    ctx.env.DB.prepare = ((original) => {
      return function (sql) {
        if (sql.includes('SELECT credits_balance')) {
          return {
            bind() {
              return { async first() { return { credits_balance: 500 }; } };
            },
          };
        }
        return original.call(this, sql);
      };
    })(ctx.env.DB.prepare);

    const res = await callEndpoint(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.call_id).toBeDefined();
    expect(data.status).toBe('pending');

    // Verify the ElevenLabs payload uses user's voice_id via conversation_config_override
    const fetchCall = globalThis.fetch.mock.calls[0];
    const payload = JSON.parse(fetchCall[1].body);
    expect(payload.agent_id).toBe('agent-test-id');
    expect(payload.conversation_initiation_client_data.dynamic_variables.message).toBe('Hello from OpenClaw');
    // User has voice_id 'voice-xyz', should be in conversation_config_override.tts.voice_id
    expect(payload.conversation_initiation_client_data.conversation_config_override.tts.voice_id).toBe('voice-xyz');

    restoreFetch();
  });

  it('returns 400 on oversized system_prompt (Req 1.5)', async () => {
    const ctx = createContext({
      body: {
        destination_phone: '+14155551234',
        system_prompt: 'x'.repeat(10_001),
        first_message: 'Hello',
      },
    });

    const res = await callEndpoint(ctx);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
    expect(data.error.message).toContain('system_prompt');
  });

  it('returns 400 on oversized first_message (Req 1.6)', async () => {
    const ctx = createContext({
      body: {
        destination_phone: '+14155551234',
        system_prompt: 'You are helpful.',
        first_message: 'x'.repeat(2_001),
      },
    });

    const res = await callEndpoint(ctx);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
    expect(data.error.message).toContain('first_message');
  });

  it('returns 400 for invalid phone number', async () => {
    const ctx = createContext({
      body: { destination_phone: 'not-a-phone', message: 'Hello' },
    });
    const res = await callEndpoint(ctx);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
    expect(data.error.message).toContain('E.164');
  });

  it('returns 402 when credits are insufficient', async () => {
    const lowCreditFreeUser = { ...TEST_USER, plan: 'free', credits_balance: 5 };
    const ctx = createContext({
      body: { destination_phone: '+14155551234', message: 'Hello' },
      user: lowCreditFreeUser,
    });

    // Mock credit check returning low balance for free user
    ctx.env.DB.prepare = function (sql) {
      if (sql.includes('SELECT credits_balance')) {
        return {
          bind() {
            return { async first() { return { credits_balance: 5 }; } };
          },
        };
      }
      return {
        bind() {
          return {
            async run() { return { success: true, meta: { changes: 1 } }; },
            async first() { return null; },
          };
        },
      };
    };

    const res = await callEndpoint(ctx);
    expect(res.status).toBe(402);

    const data = await res.json();
    expect(data.error.code).toBe('INSUFFICIENT_CREDITS');
  });

  it('allows paid (starter) user to call regardless of credits_balance (Req 6.5)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const starterUser = { ...TEST_USER, plan: 'starter', credits_balance: 0 };
    const ctx = createContext({
      body: { destination_phone: '+14155551234', message: 'Hello from paid user' },
      user: starterUser,
    });

    const res = await callEndpoint(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.call_id).toBeDefined();
    expect(data.status).toBe('pending');

    restoreFetch();
  });

  it('allows paid (pro) user to call regardless of credits_balance (Req 6.5)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const proUser = { ...TEST_USER, plan: 'pro', credits_balance: 0 };
    const ctx = createContext({
      body: { destination_phone: '+14155551234', message: 'Hello from pro user' },
      user: proUser,
    });

    const res = await callEndpoint(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.call_id).toBeDefined();
    expect(data.status).toBe('pending');

    restoreFetch();
  });

  it('includes source: api in the call record INSERT (Req 2.6)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const insertCalls = [];
    const ctx = createContext({
      body: { destination_phone: '+14155551234', message: 'Test source column' },
    });

    // Intercept DB prepare to capture INSERT bind args
    ctx.env.DB.prepare = function (sql) {
      return {
        bind(...args) {
          if (sql.includes('INSERT')) insertCalls.push({ sql, args });
          return {
            async run() { return { success: true, meta: { changes: 1 } }; },
            async first() { return null; },
          };
        },
      };
    };

    const res = await callEndpoint(ctx);
    expect(res.status).toBe(200);

    // Verify the INSERT was called and includes 'api' as source
    expect(insertCalls.length).toBeGreaterThanOrEqual(1);
    const callInsert = insertCalls.find(c => c.sql.includes('INSERT INTO calls'));
    expect(callInsert).toBeDefined();
    expect(callInsert.sql).toContain('source');
    // source is the 10th bind parameter in the INSERT
    expect(callInsert.args).toContain('api');

    restoreFetch();
  });

  it('returns 400 for empty body', async () => {
    const ctx = createContext();
    ctx.request = new Request('https://example.com/api/openclaw/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '',
    });

    const res = await callEndpoint(ctx);
    expect(res.status).toBe(400);
  });

  it('returns 500 when ElevenLabs API fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const ctx = createContext({
      body: { destination_phone: '+14155551234', message: 'Hello' },
    });

    ctx.env.DB.prepare = function (sql) {
      if (sql.includes('SELECT credits_balance')) {
        return {
          bind() {
            return { async first() { return { credits_balance: 500 }; } };
          },
        };
      }
      return {
        bind() {
          return {
            async run() { return { success: true, meta: { changes: 1 } }; },
            async first() { return null; },
          };
        },
      };
    };

    const res = await callEndpoint(ctx);
    expect(res.status).toBe(500);

    const data = await res.json();
    expect(data.error.code).toBe('INTERNAL_ERROR');

    restoreFetch();
  });
});

// ─── GET /api/openclaw/status ───────────────────────────────────────────────

describe('GET /api/openclaw/status', () => {
  it('returns 200 with call details when found', async () => {
    const callRow = {
      id: 'call-123',
      user_id: 'user-abc',
      status: 'completed',
      duration_seconds: 120,
      transcript: '{"text":"Hello"}',
      override_system_prompt: null,
      override_voice_id: null,
      override_first_message: null,
    };

    const ctx = createContext({
      method: 'GET',
      url: 'https://example.com/api/openclaw/status?call_id=call-123',
      dbFirstResult: callRow,
    });

    const res = await statusEndpoint(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.call_id).toBe('call-123');
    expect(data.status).toBe('completed');
    expect(data.duration_seconds).toBe(120);
    expect(data.transcript).toBe('{"text":"Hello"}');
    expect(data.agent_override).toBeNull();
  });

  it('returns 404 when call not found', async () => {
    const ctx = createContext({
      method: 'GET',
      url: 'https://example.com/api/openclaw/status?call_id=nonexistent',
      dbFirstResult: null,
    });

    const res = await statusEndpoint(ctx);
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 when call_id query param is missing', async () => {
    const ctx = createContext({
      method: 'GET',
      url: 'https://example.com/api/openclaw/status',
    });

    const res = await statusEndpoint(ctx);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
  });

  it('returns 500 when DB query fails', async () => {
    const ctx = createContext({
      method: 'GET',
      url: 'https://example.com/api/openclaw/status?call_id=call-123',
    });
    ctx.env.DB.prepare = () => ({
      bind() {
        return {
          async first() { throw new Error('DB error'); },
        };
      },
    });

    const res = await statusEndpoint(ctx);
    expect(res.status).toBe(500);

    const data = await res.json();
    expect(data.error.code).toBe('INTERNAL_ERROR');
  });

  // ─── Task 9.3: Unit tests for status endpoint ──────────────────────────

  it('returns existing fields: call_id, status, duration_seconds, transcript (Req 7.1)', async () => {
    const callRow = {
      id: 'call-456',
      user_id: 'user-abc',
      status: 'completed',
      duration_seconds: 60,
      transcript: 'Some transcript text',
      override_system_prompt: null,
      override_voice_id: null,
      override_first_message: null,
    };

    const ctx = createContext({
      method: 'GET',
      url: 'https://example.com/api/openclaw/status?call_id=call-456',
      dbFirstResult: callRow,
    });

    const res = await statusEndpoint(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty('call_id', 'call-456');
    expect(data).toHaveProperty('status', 'completed');
    expect(data).toHaveProperty('duration_seconds', 60);
    expect(data).toHaveProperty('transcript', 'Some transcript text');
  });

  it('returns null duration and transcript for in-progress call (Req 7.3)', async () => {
    const callRow = {
      id: 'call-789',
      user_id: 'user-abc',
      status: 'in_progress',
      duration_seconds: null,
      transcript: null,
      override_system_prompt: null,
      override_voice_id: null,
      override_first_message: null,
    };

    const ctx = createContext({
      method: 'GET',
      url: 'https://example.com/api/openclaw/status?call_id=call-789',
      dbFirstResult: callRow,
    });

    const res = await statusEndpoint(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe('in_progress');
    expect(data.duration_seconds).toBeNull();
    expect(data.transcript).toBeNull();
  });

  it('returns 404 when call belongs to a different user (Req 7.4)', async () => {
    // The DB query filters by user_id, so a call belonging to another user returns null
    const ctx = createContext({
      method: 'GET',
      url: 'https://example.com/api/openclaw/status?call_id=call-other',
      dbFirstResult: null, // simulates no match for this user
    });

    const res = await statusEndpoint(ctx);
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error.code).toBe('NOT_FOUND');
  });

  it('returns agent_override object when overrides were used', async () => {
    const callRow = {
      id: 'call-ovr',
      user_id: 'user-abc',
      status: 'completed',
      duration_seconds: 30,
      transcript: 'Hi there',
      override_system_prompt: 'You are a pirate.',
      override_voice_id: 'voice-pirate',
      override_first_message: 'Ahoy!',
    };

    const ctx = createContext({
      method: 'GET',
      url: 'https://example.com/api/openclaw/status?call_id=call-ovr',
      dbFirstResult: callRow,
    });

    const res = await statusEndpoint(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.agent_override).toEqual({
      system_prompt: 'You are a pirate.',
      voice_id: 'voice-pirate',
      first_message: 'Ahoy!',
    });
  });

  it('returns agent_override with partial overrides (only some fields set)', async () => {
    const callRow = {
      id: 'call-partial',
      user_id: 'user-abc',
      status: 'completed',
      duration_seconds: 15,
      transcript: 'Partial test',
      override_system_prompt: 'Custom prompt',
      override_voice_id: null,
      override_first_message: null,
    };

    const ctx = createContext({
      method: 'GET',
      url: 'https://example.com/api/openclaw/status?call_id=call-partial',
      dbFirstResult: callRow,
    });

    const res = await statusEndpoint(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.agent_override).toEqual({
      system_prompt: 'Custom prompt',
      voice_id: null,
      first_message: null,
    });
  });

  // ─── Task 9.2: Property test — call status returns stored overrides ────

  /**
   * Property 11: Call status returns stored overrides
   * **Validates: Requirements 7.2**
   *
   * For any call initiated with override fields, the status endpoint returns
   * those same override values in the agent_override response object.
   */
  it('Property 11: status endpoint returns stored override values for any combination', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          system_prompt: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null }),
          voice_id: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
          first_message: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null }),
        }),
        async (overrides) => {
          const hasAnyOverride =
            overrides.system_prompt !== null ||
            overrides.voice_id !== null ||
            overrides.first_message !== null;

          const callRow = {
            id: 'call-prop',
            user_id: 'user-abc',
            status: 'completed',
            duration_seconds: 42,
            transcript: 'test',
            override_system_prompt: overrides.system_prompt,
            override_voice_id: overrides.voice_id,
            override_first_message: overrides.first_message,
          };

          const ctx = createContext({
            method: 'GET',
            url: 'https://example.com/api/openclaw/status?call_id=call-prop',
            dbFirstResult: callRow,
          });

          const res = await statusEndpoint(ctx);
          expect(res.status).toBe(200);

          const data = await res.json();

          if (hasAnyOverride) {
            expect(data.agent_override).not.toBeNull();
            expect(data.agent_override.system_prompt).toBe(overrides.system_prompt);
            expect(data.agent_override.voice_id).toBe(overrides.voice_id);
            expect(data.agent_override.first_message).toBe(overrides.first_message);
          } else {
            expect(data.agent_override).toBeNull();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── GET /api/openclaw/credits ──────────────────────────────────────────────

describe('GET /api/openclaw/credits', () => {
  it('returns 200 with credits_balance', async () => {
    const ctx = createContext({
      method: 'GET',
      url: 'https://example.com/api/openclaw/credits',
    });

    const res = await creditsEndpoint(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.credits_balance).toBe(500);
  });

  it('returns correct balance for zero credits', async () => {
    const ctx = createContext({
      method: 'GET',
      url: 'https://example.com/api/openclaw/credits',
      user: { ...TEST_USER, credits_balance: 0 },
    });

    const res = await creditsEndpoint(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.credits_balance).toBe(0);
  });
});
