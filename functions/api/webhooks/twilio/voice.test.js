import { describe, it, expect } from 'vitest';
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

function encodeForm(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

async function createContext(params, signature) {
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
    },
    data: {},
  };
}

const defaultParams = {
  Called: '+15551234567',
  From: '+15559876543',
  CallSid: 'CA_test_sid_123',
};

describe('POST /api/webhooks/twilio/voice', () => {
  it('returns 403 TwiML when signature is invalid', async () => {
    const ctx = await createContext(defaultParams, 'invalidsignature');
    const res = await onRequestPost(ctx);

    expect(res.status).toBe(403);
    expect(res.headers.get('Content-Type')).toBe('text/xml');
    const body = await res.text();
    expect(body).toContain('Request validation failed');
  });

  it('returns Connect/Stream TwiML with agent_id on valid signature', async () => {
    const ctx = await createContext(defaultParams);
    const res = await onRequestPost(ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/xml');
    const body = await res.text();
    expect(body).toContain('<Connect>');
    expect(body).toContain('<Stream');
    expect(body).toContain(`agent_id=${AGENT_ID}`);
  });

  it('returns text/xml content type for all responses', async () => {
    const ctx = await createContext(defaultParams);
    const res = await onRequestPost(ctx);
    expect(res.headers.get('Content-Type')).toBe('text/xml');
  });

  it('does not include any Parameter elements — routing is handled by conversation-init webhook', async () => {
    const ctx = await createContext(defaultParams);
    const res = await onRequestPost(ctx);
    const body = await res.text();
    expect(body).not.toContain('<Parameter');
  });
});
