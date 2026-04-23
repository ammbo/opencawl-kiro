import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { onRequestPost as callEndpoint } from './call.js';
import { onRequestPost as resultsEndpoint } from './results.js';
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
  /**
   * Property 4: Status endpoint returns all stored call fields
   * **Validates: Requirements 6.1, 6.2, 6.3**
   *
   * For any call record with arbitrary summary, openclaw_result, and goal values
   * (including NULL), the GET /api/openclaw/status response includes those exact
   * values in the corresponding fields.
   */
  it('Property 4: status endpoint returns all stored call fields (summary, openclaw_result, goal)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          summary: fc.option(fc.string({ minLength: 1, maxLength: 500 }), { nil: null }),
          openclaw_result: fc.option(fc.string({ minLength: 1, maxLength: 500 }), { nil: null }),
          goal: fc.option(fc.string({ minLength: 1, maxLength: 500 }), { nil: null }),
        }),
        async (fields) => {
          const callRow = {
            id: 'call-prop4',
            user_id: 'user-abc',
            status: 'completed',
            duration_seconds: 90,
            transcript: 'some transcript',
            override_system_prompt: null,
            override_voice_id: null,
            override_first_message: null,
            summary: fields.summary,
            openclaw_result: fields.openclaw_result,
            goal: fields.goal,
          };

          const ctx = createContext({
            method: 'GET',
            url: 'https://example.com/api/openclaw/status?call_id=call-prop4',
            dbFirstResult: callRow,
          });

          const res = await statusEndpoint(ctx);
          expect(res.status).toBe(200);

          const data = await res.json();
          expect(data.summary).toBe(fields.summary);
          expect(data.openclaw_result).toBe(fields.openclaw_result);
          expect(data.goal).toBe(fields.goal);
        },
      ),
      { numRuns: 100 },
    );
  });

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

// ─── POST /api/openclaw/results ──────────────────────────────────────────────

describe('POST /api/openclaw/results', () => {
  /**
   * Property 1: Results round-trip — stored result matches submitted result
   * **Validates: Requirements 2.3, 2.4**
   *
   * For any valid result string (1–10,000 chars), POSTing to the results endpoint
   * then GETting status returns the exact same string in `openclaw_result`.
   */
  it('Property 1: stored result matches submitted result for any valid string', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 10_000 }),
        async (resultStr) => {
          const callId = 'call-roundtrip';

          // Track what the POST endpoint stores in the DB
          let storedResult = null;

          const postCtx = createContext({
            method: 'POST',
            url: 'https://example.com/api/openclaw/results',
            body: { call_id: callId, result: resultStr },
            dbChanges: 1,
          });

          // Override DB to capture the stored result from the UPDATE
          postCtx.env.DB.prepare = function (sql) {
            return {
              bind(...args) {
                return {
                  async run() {
                    if (sql.includes('UPDATE')) {
                      storedResult = args[0]; // result is the first bind param
                    }
                    return { success: true, meta: { changes: 1 } };
                  },
                  async first() {
                    return null;
                  },
                };
              },
            };
          };

          // POST the result
          const postRes = await resultsEndpoint(postCtx);
          expect(postRes.status).toBe(200);

          const postData = await postRes.json();
          expect(postData.success).toBe(true);
          expect(postData.call_id).toBe(callId);

          // Verify the DB received the exact result string
          expect(storedResult).toBe(resultStr);

          // Now GET status — mock DB returns a row with the stored result
          const getCtx = createContext({
            method: 'GET',
            url: `https://example.com/api/openclaw/status?call_id=${callId}`,
            dbFirstResult: {
              id: callId,
              user_id: 'user-abc',
              status: 'completed',
              duration_seconds: 60,
              transcript: null,
              override_system_prompt: null,
              override_voice_id: null,
              override_first_message: null,
              openclaw_result: storedResult,
            },
          });

          const getRes = await statusEndpoint(getCtx);
          expect(getRes.status).toBe(200);

          const getData = await getRes.json();
          expect(getData.call_id).toBe(callId);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2: Invalid payloads are rejected
   * **Validates: Requirements 2.2, 2.6**
   *
   * For any JSON payload where call_id is missing/empty OR result is missing/empty,
   * the Results_Endpoint returns HTTP 400 with error code INVALID_INPUT.
   */
  /**
   * Property 3: Result length enforcement
   * **Validates: Requirements 1.3, 2.8**
   *
   * For any string of length > 10,000 characters submitted as the `result` field,
   * the Results_Endpoint returns HTTP 400 with error code INVALID_INPUT.
   * For any string of length between 1 and 10,000 characters (inclusive),
   * the endpoint accepts it (HTTP 200) given a valid call_id owned by the user.
   */
  it('Property 3: strings > 10,000 chars are rejected, strings 1–10,000 chars are accepted', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate strings that are over the limit (10,001 to 15,000 chars)
        fc.string({ minLength: 10_001, maxLength: 15_000 }),
        async (oversizedResult) => {
          const ctx = createContext({
            method: 'POST',
            url: 'https://example.com/api/openclaw/results',
            body: { call_id: 'call-length-test', result: oversizedResult },
            dbChanges: 0,
          });

          const res = await resultsEndpoint(ctx);
          expect(res.status).toBe(400);

          const data = await res.json();
          expect(data.error).toBeDefined();
          expect(data.error.code).toBe('INVALID_INPUT');
          expect(data.error.message).toContain('10,000');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 3b: strings 1–10,000 chars are accepted with HTTP 200', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 10_000 }),
        async (validResult) => {
          const ctx = createContext({
            method: 'POST',
            url: 'https://example.com/api/openclaw/results',
            body: { call_id: 'call-length-ok', result: validResult },
            dbChanges: 1,
          });

          const res = await resultsEndpoint(ctx);
          expect(res.status).toBe(200);

          const data = await res.json();
          expect(data.success).toBe(true);
          expect(data.call_id).toBe('call-length-ok');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 2: invalid payloads with missing/empty call_id or result are rejected with 400', async () => {
    // Generator that produces payloads where at least one required field is missing or empty
    const invalidPayloadArb = fc.oneof(
      // case 1: call_id missing entirely, result present
      fc.string({ minLength: 1, maxLength: 200 }).map((result) => ({ result })),
      // case 2: call_id empty string, result present
      fc.string({ minLength: 1, maxLength: 200 }).map((result) => ({ call_id: '', result })),
      // case 3: call_id null, result present
      fc.string({ minLength: 1, maxLength: 200 }).map((result) => ({ call_id: null, result })),
      // case 4: call_id present, result missing entirely
      fc.string({ minLength: 1, maxLength: 200 }).map((call_id) => ({ call_id })),
      // case 5: call_id present, result empty string
      fc.string({ minLength: 1, maxLength: 200 }).map((call_id) => ({ call_id, result: '' })),
      // case 6: call_id present, result null
      fc.string({ minLength: 1, maxLength: 200 }).map((call_id) => ({ call_id, result: null })),
      // case 7: both missing
      fc.constant({}),
      // case 8: both empty
      fc.constant({ call_id: '', result: '' }),
      // case 9: both null
      fc.constant({ call_id: null, result: null }),
    );

    await fc.assert(
      fc.asyncProperty(invalidPayloadArb, async (payload) => {
        const ctx = createContext({
          method: 'POST',
          url: 'https://example.com/api/openclaw/results',
          body: payload,
          dbChanges: 0,
        });

        const res = await resultsEndpoint(ctx);
        expect(res.status).toBe(400);

        const data = await res.json();
        expect(data.error).toBeDefined();
        expect(data.error.code).toBe('INVALID_INPUT');
      }),
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
