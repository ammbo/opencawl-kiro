import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestPost as postCallHandler, generateCallSummary } from './post-call.js';
import { onRequestPost as toolsHandler } from './tools.js';

const POST_CALL_SECRET = 'test-post-call-secret';
const TOOLS_SECRET = 'test-tools-secret';

/**
 * Compute a valid ElevenLabs xi-signature header.
 * Format: t=<timestamp>,v0=<hex_hmac_sha256>
 * Message: "${timestamp}.${rawBody}"
 */
async function signPayload(rawBody, secret) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const bytes = new Uint8Array(sig);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return `t=${timestamp},v0=${hex}`;
}

function createMockDB(options = {}) {
  const queries = [];
  const { user = null, callRecord = null } = options;

  return {
    _queries: queries,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              queries.push({ sql, args });
              return { success: true, meta: { changes: 1 } };
            },
            async first() {
              queries.push({ sql, args });
              if (sql.includes('SELECT * FROM users') && user) return user;
              if (sql.includes('SELECT credits_balance')) return { credits_balance: user?.credits_balance || 500 };
              if (sql.includes('SELECT direction')) return callRecord || { direction: 'outbound', destination_phone: '+15551234567', goal: null };
              return null;
            },
            async all() {
              queries.push({ sql, args });
              return { results: [] };
            },
          };
        },
      };
    },
    batch(stmts) {
      return Promise.all(stmts.map(async (stmt) => await stmt.run()));
    },
  };
}

async function createPostCallContext(body, envOverrides = {}) {
  const rawBody = JSON.stringify(body);
  const sig = await signPayload(rawBody, POST_CALL_SECRET);

  const request = new Request('https://example.com/api/webhooks/elevenlabs/post-call', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-signature': sig,
    },
    body: rawBody,
  });

  return {
    request,
    env: {
      ELEVENLABS_WEBHOOK_SECRET_POST_CALL: POST_CALL_SECRET,
      DB: createMockDB({ user: { id: 'user-abc', plan: 'free', credits_balance: 500 } }),
      ...envOverrides,
    },
    data: {},
  };
}

describe('POST /api/webhooks/elevenlabs/post-call', () => {
  const validBody = {
    type: 'post_call_transcription',
    event_timestamp: Math.floor(Date.now() / 1000),
    data: {
      conversation_id: 'conv-123',
      transcript: [
        { role: 'agent', message: 'Hello, how can I help?' },
        { role: 'user', message: 'I need assistance.' },
      ],
      metadata: {
        call_duration_secs: 125,
      },
      conversation_initiation_client_data: {
        dynamic_variables: {
          user_id: 'user-abc',
          call_id: 'call-xyz',
        },
      },
    },
  };

  it('returns 401 when signature is missing', async () => {
    const request = new Request('https://example.com/api/webhooks/elevenlabs/post-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    const ctx = {
      request,
      env: { ELEVENLABS_WEBHOOK_SECRET_POST_CALL: POST_CALL_SECRET, DB: createMockDB() },
      data: {},
    };
    const res = await postCallHandler(ctx);
    expect(res.status).toBe(401);
  });

  it('returns 401 when signature is invalid', async () => {
    const request = new Request('https://example.com/api/webhooks/elevenlabs/post-call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-signature': 't=123,v0=invalidsig',
      },
      body: JSON.stringify(validBody),
    });
    const ctx = {
      request,
      env: { ELEVENLABS_WEBHOOK_SECRET_POST_CALL: POST_CALL_SECRET, DB: createMockDB() },
      data: {},
    };
    const res = await postCallHandler(ctx);
    expect(res.status).toBe(401);
  });

  it('updates call record with transcript and summary for valid post-call webhook', async () => {
    const callRecord = { direction: 'outbound', destination_phone: '+15551234567', goal: 'Reschedule appointment' };
    const db = createMockDB({ user: { id: 'user-abc', plan: 'free', credits_balance: 500 }, callRecord });
    const ctx = await createPostCallContext(validBody, { DB: db });
    const res = await postCallHandler(ctx);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.received).toBe(true);

    const updateQuery = db._queries.find((q) => q.sql.includes('UPDATE calls'));
    expect(updateQuery).toBeTruthy();
    expect(updateQuery.args[0]).toBe('completed');
    // summary should be in the args (index 3)
    expect(typeof updateQuery.args[3]).toBe('string');
    expect(updateQuery.args[3].length).toBeGreaterThan(0);
  });

  it('returns 200 even on internal errors to avoid retry storms', async () => {
    const brokenDb = {
      prepare() {
        return {
          bind() {
            return {
              async run() { throw new Error('DB failure'); },
              async first() { throw new Error('DB failure'); },
            };
          },
        };
      },
    };
    const ctx = await createPostCallContext(validBody, { DB: brokenDb });
    const res = await postCallHandler(ctx);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/webhooks/elevenlabs/tools', () => {
  const mockUser = {
    id: 'user-abc',
    plan: 'starter',
    credits_balance: 500,
    twilio_phone_number: '+15550001111',
    voice_id: 'voice-1',
  };

  async function createToolsContext(body, { user = mockUser, envOverrides = {} } = {}) {
    const rawBody = JSON.stringify(body);
    const sig = await signPayload(rawBody, TOOLS_SECRET);

    const request = new Request('https://example.com/api/webhooks/elevenlabs/tools', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-signature': sig,
      },
      body: rawBody,
    });

    return {
      request,
      env: {
        ELEVENLABS_WEBHOOK_SECRET_TOOLS: TOOLS_SECRET,
        ELEVENLABS_AGENT_ID: 'agent-123',
        ELEVENLABS_API_KEY: 'el-key-456',
        TWILIO_DEFAULT_NUMBER: '+15559990000',
        DB: createMockDB({ user }),
        ...envOverrides,
      },
      data: {},
    };
  }

  function validToolsBody(overrides = {}) {
    return {
      tool_call_id: 'tc-100',
      tool_name: 'dispatch_call',
      parameters: {
        destination_phone: '+15551234567',
        goal: 'Reschedule my Thursday appointment',
        ...overrides.parameters,
      },
      conversation_initiation_client_data: {
        dynamic_variables: {
          user_id: 'user-abc',
          ...overrides.dynamic_variables,
        },
      },
      ...overrides,
    };
  }

  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns 401 when signature is invalid', async () => {
    const request = new Request('https://example.com/api/webhooks/elevenlabs/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_call_id: 'tc-1', tool_name: 'dispatch_call' }),
    });
    const ctx = {
      request,
      env: { ELEVENLABS_WEBHOOK_SECRET_TOOLS: TOOLS_SECRET, DB: createMockDB() },
      data: {},
    };
    const res = await toolsHandler(ctx);
    expect(res.status).toBe(401);
  });

  it('creates call record, initiates outbound call, and returns success for valid dispatch_call', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const body = validToolsBody();
    const db = createMockDB({ user: mockUser });
    const ctx = await createToolsContext(body, { envOverrides: { DB: db } });

    const res = await toolsHandler(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.tool_call_id).toBe('tc-100');
    expect(data.result).toContain('+15551234567');
    expect(data.result).toContain('dispatched successfully');

    // Verify call record was inserted
    const insertQuery = db._queries.find((q) => q.sql.includes('INSERT INTO calls'));
    expect(insertQuery).toBeTruthy();
    expect(insertQuery.args).toContain('voice_dispatch');
    expect(insertQuery.args).toContain('+15551234567');
    expect(insertQuery.args).toContain('Reschedule my Thursday appointment');

    // Verify ElevenLabs outbound call was initiated
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://api.elevenlabs.io/v1/convai/twilio/outbound-call');
    expect(opts.method).toBe('POST');
    expect(opts.headers['xi-api-key']).toBe('el-key-456');
  });

  it('returns error tool result when destination_phone is missing', async () => {
    globalThis.fetch = vi.fn();

    const body = validToolsBody();
    delete body.parameters.destination_phone;

    const ctx = await createToolsContext(body);
    const res = await toolsHandler(ctx);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tool_call_id).toBe('tc-100');
    expect(data.result).toContain('destination_phone is required');

    // Should NOT have called ElevenLabs API
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns error tool result when destination_phone is invalid E.164', async () => {
    globalThis.fetch = vi.fn();

    const body = validToolsBody({ parameters: { destination_phone: '5551234567', goal: 'Test' } });

    const ctx = await createToolsContext(body);
    const res = await toolsHandler(ctx);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tool_call_id).toBe('tc-100');
    expect(data.result).toContain('valid E.164');

    // Should NOT have called ElevenLabs API
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});


describe('generateCallSummary', () => {
  it('returns summary with outcome from last agent message', () => {
    const transcript = [
      { role: 'agent', message: 'Hello, how can I help?' },
      { role: 'user', message: 'Reschedule my appointment.' },
      { role: 'agent', message: 'Your appointment has been rescheduled to Friday.' },
    ];
    const result = generateCallSummary('outbound', '+15551234567', transcript, null);
    expect(result).toContain('rescheduled to Friday');
  });

  it('includes goal in summary when provided', () => {
    const transcript = [
      { role: 'agent', message: 'Done, your appointment is moved.' },
    ];
    const result = generateCallSummary('outbound', '+15551234567', transcript, 'Reschedule dentist');
    expect(result).toContain('Goal: Reschedule dentist');
    expect(result).toContain('Outcome:');
  });

  it('returns fallback message when transcript is empty', () => {
    const result = generateCallSummary('outbound', '+15551234567', [], null);
    expect(result).toContain('+15551234567');
    expect(result).toContain('No transcript available');
  });

  it('returns fallback message when transcript is null', () => {
    const result = generateCallSummary('inbound', '+15551234567', null, null);
    expect(result).toContain('from');
    expect(result).toContain('No transcript available');
  });

  it('handles inbound direction correctly', () => {
    const result = generateCallSummary('inbound', '+15551234567', [], null);
    expect(result).toContain('from +15551234567');
  });

  it('handles outbound direction correctly', () => {
    const result = generateCallSummary('outbound', '+15551234567', [], null);
    expect(result).toContain('to +15551234567');
  });
});
