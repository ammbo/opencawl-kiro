import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { onRequestPost } from './voice.js';

const AUTH_TOKEN = 'test_twilio_auth_token';
const AGENT_ID = 'agent_test_123';

/**
 * Compute a valid Twilio HMAC-SHA1 signature for a given URL + params.
 */
async function signTwilio(url, params, authToken = AUTH_TOKEN) {
  let data = url;
  if (params && typeof params === 'object') {
    const sortedKeys = Object.keys(params).sort();
    for (const key of sortedKeys) {
      data += key + params[key];
    }
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const bytes = new Uint8Array(sig);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Encode params as application/x-www-form-urlencoded.
 */
function encodeForm(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/**
 * Create a mock D1 database that supports:
 * - users lookup by twilio_phone_number
 * - shared_phone_numbers lookup
 * - accepted_numbers lookup by user_id
 * - calls history query
 * - INSERT INTO calls
 */
function createMockDB({
  users = {},
  sharedNumbers = [],
  acceptedNumbers = {},
  callHistory = {},
} = {}) {
  const inserts = [];

  return {
    _inserts: inserts,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              inserts.push({ sql, args });
              return { success: true, meta: { changes: 1 } };
            },
            async first() {
              if (sql.includes('FROM shared_phone_numbers WHERE phone_number')) {
                const number = args[0];
                return sharedNumbers.includes(number) ? { phone_number: number } : null;
              }
              if (sql.includes('WHERE twilio_phone_number')) {
                const number = args[0];
                return users[number] || null;
              }
              return null;
            },
            async all() {
              if (sql.includes('FROM accepted_numbers WHERE user_id')) {
                const userId = args[0];
                const numbers = acceptedNumbers[userId] || [];
                return { results: numbers.map((n) => ({ phone_number: n })) };
              }
              if (sql.includes('FROM calls WHERE user_id') && sql.includes('direction')) {
                const userId = args[0];
                const callerPhone = args[1];
                const key = `${userId}:${callerPhone}`;
                const history = callHistory[key] || [];
                return { results: history.map((id) => ({ id })) };
              }
              return { results: [] };
            },
          };
        },
      };
    },
  };
}

/**
 * Create a request context for the voice webhook handler.
 */
async function createContext(params, db, signature) {
  const url = 'https://example.com/api/webhooks/twilio/voice';
  const body = encodeForm(params);

  if (!signature) {
    signature = await signTwilio(url, params);
  }

  const request = new Request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Twilio-Signature': signature,
    },
    body,
  });

  return {
    request,
    env: {
      TWILIO_AUTH_TOKEN: AUTH_TOKEN,
      ELEVENLABS_AGENT_ID: AGENT_ID,
      DB: db || createMockDB(),
    },
    data: {},
  };
}

/** Generator for E.164-like phone numbers */
const e164Phone = () =>
  fc.integer({ min: 1, max: 9 }).chain((first) =>
    fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
      minLength: 4,
      maxLength: 14,
    }).map((rest) => `+${first}${rest}`)
  );

describe('POST /api/webhooks/twilio/voice', () => {
  const defaultParams = {
    Called: '+15551234567',
    From: '+15559876543',
    CallSid: 'CA_test_sid_123',
  };

  it('returns 403 TwiML when signature is invalid', async () => {
    const db = createMockDB();
    const ctx = await createContext(defaultParams, db, 'invalidsignature');
    const res = await onRequestPost(ctx);

    expect(res.status).toBe(403);
    expect(res.headers.get('Content-Type')).toBe('text/xml');
    const body = await res.text();
    expect(body).toContain('Request validation failed');
  });

  it('returns sorry TwiML when no user found for the called number', async () => {
    const db = createMockDB({});
    const ctx = await createContext(defaultParams, db);
    const res = await onRequestPost(ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/xml');
    const body = await res.text();
    expect(body).toContain('Sorry');
    expect(body).toContain('not configured');
  });

  it('creates call record and returns Connect TwiML for owner call', async () => {
    const user = {
      id: 'user-abc-123',
      phone: '+15559876543', // matches From — this is an owner call
      plan: 'starter',
      credits_balance: 500,
      twilio_phone_number: '+15551234567',
    };
    const db = createMockDB({ users: { '+15551234567': user } });
    const ctx = await createContext(defaultParams, db);
    const res = await onRequestPost(ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/xml');

    const body = await res.text();
    expect(body).toContain('<Connect>');
    expect(body).toContain('<Stream');
    expect(body).toContain(`agent_id=${AGENT_ID}`);
    expect(body).toContain('user-abc-123');
    expect(body).toContain('+15559876543');

    // Should have inserted a call record
    const callInsert = db._inserts.find((i) => i.sql.includes('INSERT INTO calls'));
    expect(callInsert).toBeTruthy();
    expect(callInsert.args[1]).toBe('user-abc-123'); // user_id
    expect(callInsert.args[2]).toBe('inbound'); // direction
    expect(callInsert.args[3]).toBe('+15559876543'); // destination_phone (caller)
    expect(callInsert.args[4]).toBe('in_progress'); // status
  });

  it('returns text/xml content type for all responses', async () => {
    const db = createMockDB({});
    const ctx = await createContext(defaultParams, db);
    const res = await onRequestPost(ctx);
    expect(res.headers.get('Content-Type')).toBe('text/xml');
  });

  it('returns 500 TwiML on unexpected errors', async () => {
    const db = {
      prepare() {
        return {
          bind() {
            return {
              async first() {
                throw new Error('DB connection failed');
              },
            };
          },
        };
      },
    };

    const ctx = await createContext(defaultParams, db);
    const res = await onRequestPost(ctx);

    expect(res.status).toBe(500);
    expect(res.headers.get('Content-Type')).toBe('text/xml');
    const body = await res.text();
    expect(body).toContain('error occurred');
  });

  // --- Task 5.4: Unit tests for inbound routing ---

  it('owner call fallback when no agent config stored — still connects with global agent ID (Req 2.3)', async () => {
    const user = {
      id: 'user-no-config',
      phone: '+15559876543', // matches From
      plan: 'pro',
      credits_balance: 1000,
      twilio_phone_number: '+15551234567',
      // No system_prompt, voice_id, or first_message
    };
    const db = createMockDB({ users: { '+15551234567': user } });
    const ctx = await createContext(defaultParams, db);
    const res = await onRequestPost(ctx);

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('<Connect>');
    expect(body).toContain('<Stream');
    expect(body).toContain(`agent_id=${AGENT_ID}`);
    // Should NOT contain config parameters since none are stored
    expect(body).not.toContain('name="system_prompt"');
    expect(body).not.toContain('name="first_message"');
  });

  it('promo agent connects with OpenClaw system prompt for unknown caller on shared number (Req 3.2)', async () => {
    const user = {
      id: 'user-shared',
      phone: '+15550000000', // different from caller
      plan: 'free',
      twilio_phone_number: '+15551234567',
    };
    const db = createMockDB({
      users: { '+15551234567': user },
      sharedNumbers: ['+15551234567'],
    });
    const ctx = await createContext(defaultParams, db);
    const res = await onRequestPost(ctx);

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('<Connect>');
    expect(body).toContain('<Stream');
    expect(body).toContain('name="system_prompt"');
    expect(body).toContain('name="first_message"');
    expect(body.toLowerCase()).toContain('openclaw');
  });

  it('identifies shared number via shared_phone_numbers table — routes to promo agent (Req 3.4)', async () => {
    const user = {
      id: 'user-shared-2',
      phone: '+15550001111', // not the caller
      plan: 'free',
      twilio_phone_number: '+15551234567',
    };
    const db = createMockDB({
      users: { '+15551234567': user },
      sharedNumbers: ['+15551234567'],
    });
    const ctx = await createContext(defaultParams, db);
    const res = await onRequestPost(ctx);

    const body = await res.text();
    // Should connect to promo agent, not hang up
    expect(body).toContain('<Connect>');
    expect(body).toContain('<Stream');
    expect(body).toContain('name="system_prompt"');

    // No call record should be created for unknown on shared
    const callInsert = db._inserts.find((i) => i.sql.includes('INSERT INTO calls'));
    expect(callInsert).toBeUndefined();
  });

  it('open-access mode when accepted list is empty — accepts unknown caller on dedicated (Req 4.3)', async () => {
    const user = {
      id: 'user-dedicated',
      phone: '+15550002222', // not the caller
      plan: 'pro',
      twilio_phone_number: '+15551234567',
    };
    const db = createMockDB({
      users: { '+15551234567': user },
      sharedNumbers: [], // NOT shared → dedicated
      acceptedNumbers: { 'user-dedicated': [] }, // empty list → open access
      callHistory: {},
    });
    const ctx = await createContext(defaultParams, db);
    const res = await onRequestPost(ctx);

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('<Connect>');
    expect(body).toContain('<Stream');
    expect(body).not.toContain('<Hangup/>');

    // Should have created a call record
    const callInsert = db._inserts.find((i) => i.sql.includes('INSERT INTO calls'));
    expect(callInsert).toBeTruthy();
    expect(callInsert.args[2]).toBe('inbound');
  });
});

/**
 * Property 5: Inbound call record creation
 * **Validates: Requirements 2.4, 4.5**
 *
 * For any accepted inbound call (owner calls, accepted unknown callers on dedicated numbers),
 * verify a call record is created with direction='inbound' and destination_phone=caller's number.
 */
describe('Property 5: Inbound call record creation', () => {
  it('creates call record with direction=inbound for owner calls', async () => {
    await fc.assert(
      fc.asyncProperty(
        e164Phone(),
        e164Phone(),
        async (callerPhone, calledPhone) => {
          const user = {
            id: 'user-owner-prop',
            phone: callerPhone, // matches caller → owner call
            plan: 'pro',
            twilio_phone_number: calledPhone,
          };
          const db = createMockDB({ users: { [calledPhone]: user } });
          const params = { Called: calledPhone, From: callerPhone, CallSid: 'CA_prop_test' };
          const ctx = await createContext(params, db);
          const res = await onRequestPost(ctx);

          expect(res.status).toBe(200);
          const body = await res.text();
          expect(body).toContain('<Connect>');

          const callInsert = db._inserts.find((i) => i.sql.includes('INSERT INTO calls'));
          expect(callInsert).toBeTruthy();
          expect(callInsert.args[2]).toBe('inbound');
          expect(callInsert.args[3]).toBe(callerPhone);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('creates call record with direction=inbound for accepted unknown callers on dedicated numbers', async () => {
    await fc.assert(
      fc.asyncProperty(
        e164Phone(),
        e164Phone(),
        e164Phone(),
        async (callerPhone, calledPhone, ownerPhone) => {
          fc.pre(callerPhone !== ownerPhone);
          const user = {
            id: 'user-ded-prop',
            phone: ownerPhone,
            plan: 'pro',
            twilio_phone_number: calledPhone,
          };
          const db = createMockDB({
            users: { [calledPhone]: user },
            sharedNumbers: [],
            acceptedNumbers: { 'user-ded-prop': [callerPhone] },
            callHistory: {},
          });
          const params = { Called: calledPhone, From: callerPhone, CallSid: 'CA_prop_ded' };
          const ctx = await createContext(params, db);
          const res = await onRequestPost(ctx);

          expect(res.status).toBe(200);
          const body = await res.text();
          expect(body).toContain('<Connect>');

          const callInsert = db._inserts.find((i) => i.sql.includes('INSERT INTO calls'));
          expect(callInsert).toBeTruthy();
          expect(callInsert.args[2]).toBe('inbound');
          expect(callInsert.args[3]).toBe(callerPhone);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('does NOT create call record for unknown callers on shared numbers', async () => {
    await fc.assert(
      fc.asyncProperty(
        e164Phone(),
        e164Phone(),
        e164Phone(),
        async (callerPhone, calledPhone, ownerPhone) => {
          fc.pre(callerPhone !== ownerPhone);
          const user = {
            id: 'user-shared-prop',
            phone: ownerPhone,
            plan: 'free',
            twilio_phone_number: calledPhone,
          };
          const db = createMockDB({
            users: { [calledPhone]: user },
            sharedNumbers: [calledPhone],
          });
          const params = { Called: calledPhone, From: callerPhone, CallSid: 'CA_prop_shared' };
          const ctx = await createContext(params, db);
          const res = await onRequestPost(ctx);

          expect(res.status).toBe(200);
          const callInsert = db._inserts.find((i) => i.sql.includes('INSERT INTO calls'));
          expect(callInsert).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 12: Call history context for accepted callers
 * **Validates: Requirements 4.4**
 *
 * For accepted unknown callers on dedicated numbers, verify the call history is queried
 * and the previous_call_count is passed in the TwiML.
 */
describe('Property 12: Call history context for accepted callers', () => {
  it('passes previous_call_count in TwiML for accepted unknown callers on dedicated numbers', async () => {
    await fc.assert(
      fc.asyncProperty(
        e164Phone(),
        e164Phone(),
        e164Phone(),
        fc.array(fc.uuid(), { minLength: 0, maxLength: 10 }),
        async (callerPhone, calledPhone, ownerPhone, historyIds) => {
          fc.pre(callerPhone !== ownerPhone);
          const userId = 'user-hist-prop';
          const user = {
            id: userId,
            phone: ownerPhone,
            plan: 'pro',
            twilio_phone_number: calledPhone,
          };
          const historyKey = `${userId}:${callerPhone}`;
          const db = createMockDB({
            users: { [calledPhone]: user },
            sharedNumbers: [],
            acceptedNumbers: { [userId]: [] }, // open access
            callHistory: { [historyKey]: historyIds },
          });
          const params = { Called: calledPhone, From: callerPhone, CallSid: 'CA_hist_test' };
          const ctx = await createContext(params, db);
          const res = await onRequestPost(ctx);

          expect(res.status).toBe(200);
          const body = await res.text();
          expect(body).toContain('<Connect>');
          expect(body).toContain(`name="previous_call_count" value="${historyIds.length}"`);
        },
      ),
      { numRuns: 100 },
    );
  });
});
