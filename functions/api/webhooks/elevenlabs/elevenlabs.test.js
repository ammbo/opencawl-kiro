import { describe, it, expect, vi } from 'vitest';
import { onRequestPost as postCallHandler } from './post-call.js';
import { onRequestPost as toolsHandler } from './tools.js';

const POST_CALL_SECRET = 'test-post-call-secret';

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
  const { user = null } = options;

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

  it('updates call record for valid post-call webhook', async () => {
    const db = createMockDB({ user: { id: 'user-abc', plan: 'free', credits_balance: 500 } });
    const ctx = await createPostCallContext(validBody, { DB: db });
    const res = await postCallHandler(ctx);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.received).toBe(true);

    const updateQuery = db._queries.find((q) => q.sql.includes('UPDATE calls'));
    expect(updateQuery).toBeTruthy();
    expect(updateQuery.args[0]).toBe('completed');
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
  it('returns 501 Not Implemented (stub)', async () => {
    const res = await toolsHandler();
    expect(res.status).toBe(501);
    const data = await res.json();
    expect(data.error.code).toBe('NOT_IMPLEMENTED');
  });
});
