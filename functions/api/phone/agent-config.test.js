import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { onRequestPost, onRequestGet } from './agent-config.js';

/**
 * Helper: creates a mock context for agent-config endpoints.
 * The in-memory store simulates the DB row for the user.
 */
function createContext({ user, method = 'POST', body = null } = {}) {
  const store = {
    system_prompt: user.system_prompt ?? null,
    voice_id: user.voice_id ?? null,
    first_message: user.first_message ?? null,
  };

  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== null) {
    init.body = JSON.stringify(body);
  }

  const request = new Request('https://example.com/api/phone/agent-config', init);

  const context = {
    request,
    data: { user },
    env: {
      DB: {
        prepare(sql) {
          return {
            bind(...args) {
              return {
                async run() {
                  // Parse SET clauses from the SQL to update the store
                  const setMatch = sql.match(/SET\s+(.+)\s+WHERE/i);
                  if (setMatch) {
                    const clauses = setMatch[1].split(',').map((c) => c.trim());
                    clauses.forEach((clause, i) => {
                      const col = clause.split('=')[0].trim();
                      store[col] = args[i];
                    });
                  }
                  return { success: true, meta: { changes: 1 } };
                },
                async first() {
                  return { ...store };
                },
              };
            },
          };
        },
      },
    },
    _store: store,
  };

  return context;
}

/** Helper to make a POST request context with a given body */
function postCtx(user, body) {
  return createContext({ user, method: 'POST', body });
}

/** Helper to make a GET request context */
function getCtx(user) {
  return createContext({ user, method: 'GET' });
}

const BASE_USER = { id: 'user-1', system_prompt: null, voice_id: null, first_message: null };

// ─── Property 10: Agent config round-trip with partial updates ───

/**
 * Property 10: Agent config round-trip with partial updates
 * **Validates: Requirements 6.1, 6.2, 6.5**
 *
 * For any valid agent configuration saved via POST, the GET endpoint returns the same values.
 * For any subsequent partial update (a subset of fields), only the provided fields are
 * overwritten and omitted fields retain their previous values.
 */
describe('Property 10: Agent config round-trip with partial updates', () => {
  // Arbitrary for valid config values (within length limits)
  const arbSystemPrompt = fc.string({ minLength: 1, maxLength: 500 });
  const arbVoiceId = fc.string({ minLength: 1, maxLength: 100 });
  const arbFirstMessage = fc.string({ minLength: 1, maxLength: 500 });

  it('full config saved via POST is returned identically by GET', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSystemPrompt,
        arbVoiceId,
        arbFirstMessage,
        async (sp, vid, fm) => {
          const user = { ...BASE_USER };
          const ctx = createContext({ user, method: 'POST', body: { system_prompt: sp, voice_id: vid, first_message: fm } });

          const postRes = await onRequestPost(ctx);
          expect(postRes.status).toBe(200);

          // GET uses the same store
          const getReq = new Request('https://example.com/api/phone/agent-config', { method: 'GET' });
          const getRes = await onRequestGet({ ...ctx, request: getReq });
          const data = await getRes.json();

          expect(data.system_prompt).toBe(sp);
          expect(data.voice_id).toBe(vid);
          expect(data.first_message).toBe(fm);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('partial update overwrites only provided fields, retaining omitted ones', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Initial full config
        arbSystemPrompt,
        arbVoiceId,
        arbFirstMessage,
        // Partial update: each field is optionally present
        fc.record({
          system_prompt: fc.option(arbSystemPrompt, { nil: undefined }),
          voice_id: fc.option(arbVoiceId, { nil: undefined }),
          first_message: fc.option(arbFirstMessage, { nil: undefined }),
        }).filter((r) => r.system_prompt !== undefined || r.voice_id !== undefined || r.first_message !== undefined),
        async (sp, vid, fm, partial) => {
          const user = { ...BASE_USER };
          const ctx = createContext({ user, method: 'POST', body: { system_prompt: sp, voice_id: vid, first_message: fm } });

          // Save initial full config
          await onRequestPost(ctx);

          // Apply partial update using the same store
          const partialBody = {};
          if (partial.system_prompt !== undefined) partialBody.system_prompt = partial.system_prompt;
          if (partial.voice_id !== undefined) partialBody.voice_id = partial.voice_id;
          if (partial.first_message !== undefined) partialBody.first_message = partial.first_message;

          ctx.request = new Request('https://example.com/api/phone/agent-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(partialBody),
          });
          const partialRes = await onRequestPost(ctx);
          expect(partialRes.status).toBe(200);

          // GET and verify
          ctx.request = new Request('https://example.com/api/phone/agent-config', { method: 'GET' });
          const getRes = await onRequestGet(ctx);
          const data = await getRes.json();

          // Provided fields should be updated
          if (partial.system_prompt !== undefined) {
            expect(data.system_prompt).toBe(partial.system_prompt);
          } else {
            expect(data.system_prompt).toBe(sp);
          }

          if (partial.voice_id !== undefined) {
            expect(data.voice_id).toBe(partial.voice_id);
          } else {
            expect(data.voice_id).toBe(vid);
          }

          if (partial.first_message !== undefined) {
            expect(data.first_message).toBe(partial.first_message);
          } else {
            expect(data.first_message).toBe(fm);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Unit tests for agent config endpoints ───

describe('POST /api/phone/agent-config', () => {
  it('returns 400 with INVALID_INPUT for system_prompt exceeding 10,000 chars', async () => {
    const longPrompt = 'x'.repeat(10_001);
    const ctx = postCtx(BASE_USER, { system_prompt: longPrompt });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
    expect(data.error.message).toContain('system_prompt');
  });

  it('returns 400 with INVALID_INPUT for first_message exceeding 2,000 chars', async () => {
    const longMsg = 'y'.repeat(2_001);
    const ctx = postCtx(BASE_USER, { first_message: longMsg });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
    expect(data.error.message).toContain('first_message');
  });

  it('returns 400 when no fields are provided', async () => {
    const ctx = postCtx(BASE_USER, {});
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
  });

  it('returns 400 for invalid JSON body', async () => {
    const ctx = createContext({ user: BASE_USER, method: 'POST' });
    ctx.request = new Request('https://example.com/api/phone/agent-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
  });

  it('partial update preserves omitted fields', async () => {
    const user = { ...BASE_USER };
    const ctx = createContext({
      user,
      method: 'POST',
      body: { system_prompt: 'original prompt', voice_id: 'voice-1', first_message: 'hello' },
    });

    // Save initial config
    const res1 = await onRequestPost(ctx);
    expect(res1.status).toBe(200);

    // Partial update: only voice_id
    ctx.request = new Request('https://example.com/api/phone/agent-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice_id: 'voice-2' }),
    });
    const res2 = await onRequestPost(ctx);
    expect(res2.status).toBe(200);

    // GET and verify omitted fields retained
    ctx.request = new Request('https://example.com/api/phone/agent-config', { method: 'GET' });
    const getRes = await onRequestGet(ctx);
    const data = await getRes.json();

    expect(data.system_prompt).toBe('original prompt');
    expect(data.voice_id).toBe('voice-2');
    expect(data.first_message).toBe('hello');
  });

  it('accepts valid system_prompt at exactly 10,000 chars', async () => {
    const ctx = postCtx(BASE_USER, { system_prompt: 'a'.repeat(10_000) });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);
  });

  it('accepts valid first_message at exactly 2,000 chars', async () => {
    const ctx = postCtx(BASE_USER, { first_message: 'b'.repeat(2_000) });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/phone/agent-config', () => {
  it('returns stored config values', async () => {
    const user = { ...BASE_USER, system_prompt: 'my prompt', voice_id: 'v1', first_message: 'hi' };
    const ctx = getCtx(user);
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.system_prompt).toBe('my prompt');
    expect(data.voice_id).toBe('v1');
    expect(data.first_message).toBe('hi');
  });

  it('returns null for unset fields', async () => {
    const ctx = getCtx(BASE_USER);
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.system_prompt).toBeNull();
    expect(data.voice_id).toBeNull();
    expect(data.first_message).toBeNull();
  });
});
