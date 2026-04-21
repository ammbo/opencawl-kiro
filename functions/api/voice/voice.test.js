import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestGet as library } from './library.js';
import { onRequestGet as preview } from './preview.js';
import { onRequestPost as select } from './select.js';
import { onRequestPost as clone } from './clone.js';

const FREE_USER = {
  id: 'user-free-1',
  phone: '+15559876543',
  plan: 'free',
  credits_balance: 250,
  voice_id: null,
};

const STARTER_USER = {
  id: 'user-starter-1',
  phone: '+15551234567',
  plan: 'starter',
  credits_balance: 1000,
  voice_id: null,
};

const PRO_USER = {
  id: 'user-pro-1',
  phone: '+15551112222',
  plan: 'pro',
  credits_balance: 4000,
  voice_id: null,
};

const ENV = {
  ELEVENLABS_API_KEY: 'xi-test-key',
};

const MOCK_VOICES = [
  {
    voice_id: 'EXAVITQu4vr4xnSDxMaL',
    name: 'Sarah',
    description: 'Warm female voice',
    labels: { gender: 'female', accent: 'american' },
    preview_url: 'https://example.com/sarah.mp3',
  },
  {
    voice_id: 'IKne3meq5aSn9XLyUdCD',
    name: 'Charlie',
    description: 'Friendly male voice',
    labels: { gender: 'male', accent: 'british' },
    preview_url: 'https://example.com/charlie.mp3',
  },
];

function createGetContext({ user = FREE_USER, url = 'https://example.com/api/voice/library' } = {}) {
  return {
    request: new Request(url, { method: 'GET' }),
    env: { ...ENV, DB: createMockDB() },
    data: { user },
  };
}

function createPostContext({ user = FREE_USER, body = null } = {}) {
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== null) {
    init.body = JSON.stringify(body);
  }

  const dbOps = [];
  const ctx = {
    request: new Request('https://example.com/api/voice/select', init),
    env: { ...ENV, DB: createMockDB(dbOps) },
    data: { user },
    _dbOps: dbOps,
  };
  return ctx;
}

function createMockDB(dbOps = []) {
  const stmtMethods = (sql, args = []) => ({
    async run() {
      dbOps.push({ sql, args, op: 'run' });
      return { success: true, meta: { changes: 1 } };
    },
  });

  return {
    prepare(sql) {
      return {
        ...stmtMethods(sql),
        bind(...args) {
          return stmtMethods(sql, args);
        },
      };
    },
  };
}

let originalFetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});


// ─── GET /api/voice/library ───

describe('GET /api/voice/library', () => {
  it('returns curated voices from ElevenLabs API', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ voices: MOCK_VOICES }),
    });

    const ctx = createGetContext();
    const res = await library(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.voices).toHaveLength(2);
    expect(data.voices[0]).toEqual({
      voice_id: 'EXAVITQu4vr4xnSDxMaL',
      name: 'Sarah',
      description: 'Warm female voice',
      gender: 'female',
      accent: 'american',
      preview_url: 'https://example.com/sarah.mp3',
    });
  });

  it('falls back to first 20 voices when no curated IDs match', async () => {
    const unknownVoices = Array.from({ length: 25 }, (_, i) => ({
      voice_id: `unknown-${i}`,
      name: `Voice ${i}`,
      description: null,
      labels: {},
      preview_url: null,
    }));

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ voices: unknownVoices }),
    });

    const ctx = createGetContext();
    const res = await library(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.voices).toHaveLength(20);
  });

  it('returns 500 when ElevenLabs API fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });

    const ctx = createGetContext();
    const res = await library(ctx);
    expect(res.status).toBe(500);

    const data = await res.json();
    expect(data.error.code).toBe('ELEVENLABS_ERROR');
  });

  it('returns 500 when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const ctx = createGetContext();
    const res = await library(ctx);
    expect(res.status).toBe(500);

    const data = await res.json();
    expect(data.error.code).toBe('INTERNAL_ERROR');
  });

  it('handles voices with missing labels gracefully', async () => {
    const voicesNoLabels = [{
      voice_id: 'EXAVITQu4vr4xnSDxMaL',
      name: 'Sarah',
      description: null,
      preview_url: null,
    }];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ voices: voicesNoLabels }),
    });

    const ctx = createGetContext();
    const res = await library(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.voices[0].gender).toBeNull();
    expect(data.voices[0].accent).toBeNull();
  });
});

// ─── GET /api/voice/preview ───

describe('GET /api/voice/preview', () => {
  it('returns preview URL for a valid voice ID', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ preview_url: 'https://example.com/preview.mp3' }),
    });

    const ctx = createGetContext({
      url: 'https://example.com/api/voice/preview?voice_id=abc123',
    });
    const res = await preview(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.preview_url).toBe('https://example.com/preview.mp3');
  });

  it('returns 400 when voice_id query param is missing', async () => {
    const ctx = createGetContext({
      url: 'https://example.com/api/voice/preview',
    });
    const res = await preview(ctx);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
  });

  it('returns 404 when voice is not found', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    const ctx = createGetContext({
      url: 'https://example.com/api/voice/preview?voice_id=nonexistent',
    });
    const res = await preview(ctx);
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error.code).toBe('NOT_FOUND');
  });

  it('returns 500 when ElevenLabs API fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    const ctx = createGetContext({
      url: 'https://example.com/api/voice/preview?voice_id=abc123',
    });
    const res = await preview(ctx);
    expect(res.status).toBe(500);

    const data = await res.json();
    expect(data.error.code).toBe('ELEVENLABS_ERROR');
  });

  it('returns 500 when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const ctx = createGetContext({
      url: 'https://example.com/api/voice/preview?voice_id=abc123',
    });
    const res = await preview(ctx);
    expect(res.status).toBe(500);

    const data = await res.json();
    expect(data.error.code).toBe('INTERNAL_ERROR');
  });
});

// ─── POST /api/voice/select ───

describe('POST /api/voice/select', () => {
  it('updates user voice_id and returns success', async () => {
    const ctx = createPostContext({
      user: STARTER_USER,
      body: { voice_id: 'voice-abc' },
    });
    const res = await select(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.voice_id).toBe('voice-abc');

    const updateOp = ctx._dbOps.find((op) => op.sql.includes('UPDATE users'));
    expect(updateOp).toBeDefined();
    expect(updateOp.args[0]).toBe('voice-abc');
    expect(updateOp.args[3]).toBe(STARTER_USER.id);
  });

  it('returns 400 for invalid JSON body', async () => {
    const ctx = createPostContext({ user: STARTER_USER });
    ctx.request = new Request('https://example.com/api/voice/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });

    const res = await select(ctx);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
  });

  it('returns 400 when voice_id is missing', async () => {
    const ctx = createPostContext({ user: STARTER_USER, body: {} });
    const res = await select(ctx);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
  });

  it('returns 400 when voice_id is not a string', async () => {
    const ctx = createPostContext({ user: STARTER_USER, body: { voice_id: 123 } });
    const res = await select(ctx);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
  });
});

// ─── POST /api/voice/clone ───

describe('POST /api/voice/clone', () => {
  it('returns 403 for free-tier user', async () => {
    const ctx = createPostContext({
      user: FREE_USER,
      body: { name: 'My Voice', audio_url: 'https://example.com/audio.mp3' },
    });
    const res = await clone(ctx);
    expect(res.status).toBe(403);

    const data = await res.json();
    expect(data.error.code).toBe('FORBIDDEN');
  });

  it('returns 403 for starter-plan user', async () => {
    const ctx = createPostContext({
      user: STARTER_USER,
      body: { name: 'My Voice', audio_url: 'https://example.com/audio.mp3' },
    });
    const res = await clone(ctx);
    expect(res.status).toBe(403);

    const data = await res.json();
    expect(data.error.code).toBe('FORBIDDEN');
  });

  it('clones voice for pro-plan user', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === 'https://example.com/audio.mp3') {
        return Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(new Blob(['audio-data'], { type: 'audio/mpeg' })),
        });
      }
      if (url.includes('elevenlabs.io/v1/voices/add')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ voice_id: 'new-cloned-voice-id' }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const ctx = createPostContext({
      user: PRO_USER,
      body: { name: 'My Voice', audio_url: 'https://example.com/audio.mp3' },
    });
    const res = await clone(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.voice_id).toBe('new-cloned-voice-id');
  });

  it('returns 400 for invalid JSON body', async () => {
    const ctx = createPostContext({ user: PRO_USER });
    ctx.request = new Request('https://example.com/api/voice/clone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });

    const res = await clone(ctx);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
  });

  it('returns 400 when name is missing', async () => {
    const ctx = createPostContext({
      user: PRO_USER,
      body: { audio_url: 'https://example.com/audio.mp3' },
    });
    const res = await clone(ctx);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
  });

  it('returns 400 when audio_url is missing', async () => {
    const ctx = createPostContext({
      user: PRO_USER,
      body: { name: 'My Voice' },
    });
    const res = await clone(ctx);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
  });

  it('returns 500 when ElevenLabs clone API fails', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === 'https://example.com/audio.mp3') {
        return Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(new Blob(['audio-data'])),
        });
      }
      if (url.includes('elevenlabs.io')) {
        return Promise.resolve({ ok: false });
      }
      return Promise.resolve({ ok: false });
    });

    const ctx = createPostContext({
      user: PRO_USER,
      body: { name: 'My Voice', audio_url: 'https://example.com/audio.mp3' },
    });
    const res = await clone(ctx);
    expect(res.status).toBe(500);

    const data = await res.json();
    expect(data.error.code).toBe('ELEVENLABS_ERROR');
  });

  it('returns 400 when audio URL fetch fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });

    const ctx = createPostContext({
      user: PRO_USER,
      body: { name: 'My Voice', audio_url: 'https://example.com/bad-audio.mp3' },
    });
    const res = await clone(ctx);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
  });
});
