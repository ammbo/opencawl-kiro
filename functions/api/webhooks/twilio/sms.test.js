import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestPost } from './sms.js';

const AUTH_TOKEN = 'test_twilio_auth_token';
const AGENT_ID = 'agent_test_123';
const ELEVENLABS_API_KEY = 'el_test_key';

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
 * Create a mock D1 database for SMS webhook tests.
 */
function createMockDB({ users = {} } = {}) {
  const inserts = [];
  const updates = [];

  return {
    _inserts: inserts,
    _updates: updates,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              if (sql.includes('INSERT INTO')) {
                inserts.push({ sql, args });
              } else if (sql.includes('UPDATE')) {
                updates.push({ sql, args });
              }
              return { success: true, meta: { changes: 1 } };
            },
            async first() {
              if (sql.includes('WHERE twilio_phone_number')) {
                const number = args[0];
                return users[number] || null;
              }
              return null;
            },
          };
        },
      };
    },
  };
}

/**
 * Create a request context for the SMS webhook handler.
 */
async function createContext(params, db, signature) {
  const url = 'https://example.com/api/webhooks/twilio/sms';
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
      ELEVENLABS_API_KEY: ELEVENLABS_API_KEY,
      DB: db || createMockDB(),
    },
    data: {},
  };
}

const ownerPhone = '+15559876543';
const twilioNumber = '+15551234567';
const defaultUser = {
  id: 'user-abc-123',
  phone: ownerPhone,
  plan: 'starter',
  credits_balance: 500,
  twilio_phone_number: twilioNumber,
};

describe('POST /api/webhooks/twilio/sms', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // Default mock: ElevenLabs outbound call succeeds
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // --- Req 3.5: Valid SMS with phone number dispatches call, returns confirmation TwiML ---
  it('dispatches call and returns confirmation TwiML when owner sends valid phone + goal', async () => {
    const db = createMockDB({ users: { [twilioNumber]: defaultUser } });
    const params = {
      From: ownerPhone,
      To: twilioNumber,
      Body: 'Call +15550001111 and reschedule my appointment',
    };
    const ctx = await createContext(params, db);
    const res = await onRequestPost(ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/xml');

    const body = await res.text();
    expect(body).toContain('<Message>');
    expect(body).toContain('+15550001111');
    expect(body).toContain('dispatched');

    // Should have created a call record
    const callInsert = db._inserts.find((i) => i.sql.includes('INSERT INTO calls'));
    expect(callInsert).toBeTruthy();
    expect(callInsert.args).toContain('sms_dispatch');
    expect(callInsert.args).toContain('+15550001111');
    expect(callInsert.args).toContain('outbound');

    // Should have called ElevenLabs outbound API
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const fetchCall = globalThis.fetch.mock.calls[0];
    expect(fetchCall[0]).toContain('elevenlabs.io');
    expect(fetchCall[1].method).toBe('POST');
  });

  it('dispatches call with phone number only (no goal text)', async () => {
    const db = createMockDB({ users: { [twilioNumber]: defaultUser } });
    const params = {
      From: ownerPhone,
      To: twilioNumber,
      Body: '+15550001111',
    };
    const ctx = await createContext(params, db);
    const res = await onRequestPost(ctx);

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('+15550001111');
    expect(body).toContain('dispatched');

    const callInsert = db._inserts.find((i) => i.sql.includes('INSERT INTO calls'));
    expect(callInsert).toBeTruthy();
  });

  // --- Req 3.6: SMS without phone number returns clarification TwiML ---
  it('returns clarification TwiML when SMS body has no phone number', async () => {
    const db = createMockDB({ users: { [twilioNumber]: defaultUser } });
    const params = {
      From: ownerPhone,
      To: twilioNumber,
      Body: 'Please reschedule my appointment',
    };
    const ctx = await createContext(params, db);
    const res = await onRequestPost(ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/xml');

    const body = await res.text();
    expect(body).toContain('<Message>');
    expect(body).toContain('E.164');

    // Should NOT have created a call record or called ElevenLabs
    expect(db._inserts).toHaveLength(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // --- Req 3.5: Invalid Twilio signature returns 403 ---
  it('returns 403 when Twilio signature is invalid', async () => {
    const db = createMockDB({ users: { [twilioNumber]: defaultUser } });
    const params = {
      From: ownerPhone,
      To: twilioNumber,
      Body: 'Call +15550001111',
    };
    const ctx = await createContext(params, db, 'invalidsignature');
    const res = await onRequestPost(ctx);

    expect(res.status).toBe(403);
    expect(res.headers.get('Content-Type')).toBe('text/xml');
    const body = await res.text();
    expect(body).toContain('validation failed');
  });

  // --- Req 3.7: Non-owner sender is rejected ---
  it('rejects SMS from non-owner sender', async () => {
    const db = createMockDB({ users: { [twilioNumber]: defaultUser } });
    const params = {
      From: '+15550009999', // not the owner
      To: twilioNumber,
      Body: 'Call +15550001111',
    };
    const ctx = await createContext(params, db);
    const res = await onRequestPost(ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/xml');
    const body = await res.text();
    expect(body).toContain('<Message>');
    expect(body).toContain('does not accept');

    // Should NOT have created a call record
    expect(db._inserts).toHaveLength(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // --- Additional edge cases ---
  it('returns error TwiML when To number has no configured user', async () => {
    const db = createMockDB({ users: {} });
    const params = {
      From: ownerPhone,
      To: twilioNumber,
      Body: 'Call +15550001111',
    };
    const ctx = await createContext(params, db);
    const res = await onRequestPost(ctx);

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('not configured');
  });

  it('returns failure TwiML when ElevenLabs outbound call fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('Internal Server Error', { status: 500 }),
    );

    const db = createMockDB({ users: { [twilioNumber]: defaultUser } });
    const params = {
      From: ownerPhone,
      To: twilioNumber,
      Body: 'Call +15550001111 and ask about hours',
    };
    const ctx = await createContext(params, db);
    const res = await onRequestPost(ctx);

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('Failed to dispatch');

    // Should have created the call record initially
    const callInsert = db._inserts.find((i) => i.sql.includes('INSERT INTO calls'));
    expect(callInsert).toBeTruthy();

    // Should have updated call status to failed
    const statusUpdate = db._updates.find((i) => i.sql.includes('UPDATE calls'));
    expect(statusUpdate).toBeTruthy();
    expect(statusUpdate.args).toContain('failed');
  });

  it('all responses have text/xml content type', async () => {
    const db = createMockDB({ users: { [twilioNumber]: defaultUser } });
    const params = { From: ownerPhone, To: twilioNumber, Body: '+15550001111' };
    const ctx = await createContext(params, db);
    const res = await onRequestPost(ctx);
    expect(res.headers.get('Content-Type')).toBe('text/xml');
  });
});
