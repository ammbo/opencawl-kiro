import { describe, it, expect } from 'vitest';
import {
  verifyStripeSignature,
  verifyTwilioSignature,
  verifyElevenLabsSignature,
  timingSafeEqual,
  bufferToHex,
  bufferToBase64,
} from './webhooks.js';

// --- Helper to compute HMAC-SHA256 hex for Stripe test fixtures ---
async function computeStripeSignature(payload, timestamp, secret) {
  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const bytes = new Uint8Array(sig);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

// --- Helper to compute HMAC-SHA1 base64 for Twilio test fixtures ---
async function computeTwilioSignature(data, authToken) {
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

// --- bufferToHex ---

describe('bufferToHex', () => {
  it('converts an empty buffer', () => {
    expect(bufferToHex(new ArrayBuffer(0))).toBe('');
  });

  it('converts known bytes to hex', () => {
    const buf = new Uint8Array([0, 1, 15, 16, 255]).buffer;
    expect(bufferToHex(buf)).toBe('00010f10ff');
  });
});

// --- bufferToBase64 ---

describe('bufferToBase64', () => {
  it('converts known bytes to base64', () => {
    const buf = new TextEncoder().encode('hello').buffer;
    expect(bufferToBase64(buf)).toBe(btoa('hello'));
  });

  it('converts an empty buffer', () => {
    expect(bufferToBase64(new ArrayBuffer(0))).toBe('');
  });
});


// --- timingSafeEqual ---

describe('timingSafeEqual', () => {
  it('returns true for identical strings', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
  });

  it('returns false for different strings of same length', () => {
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
  });

  it('returns false for different lengths', () => {
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });

  it('returns false for empty vs non-empty', () => {
    expect(timingSafeEqual('', 'a')).toBe(false);
  });

  it('returns true for two empty strings', () => {
    expect(timingSafeEqual('', '')).toBe(true);
  });

  it('returns false for non-string inputs', () => {
    expect(timingSafeEqual(null, 'abc')).toBe(false);
    expect(timingSafeEqual('abc', undefined)).toBe(false);
    expect(timingSafeEqual(123, 'abc')).toBe(false);
  });
});

// --- verifyStripeSignature ---

describe('verifyStripeSignature', () => {
  const secret = 'whsec_test_secret_key';
  const payload = JSON.stringify({ id: 'evt_123', type: 'checkout.session.completed' });
  const timestamp = '1700000000';

  it('verifies a valid Stripe signature', async () => {
    const sig = await computeStripeSignature(payload, timestamp, secret);
    const header = `t=${timestamp},v1=${sig}`;
    const result = await verifyStripeSignature(payload, header, secret);
    expect(result.valid).toBe(true);
    expect(result.event).toEqual(JSON.parse(payload));
  });

  it('rejects a tampered payload', async () => {
    const sig = await computeStripeSignature(payload, timestamp, secret);
    const header = `t=${timestamp},v1=${sig}`;
    const tampered = JSON.stringify({ id: 'evt_hacked', type: 'checkout.session.completed' });
    const result = await verifyStripeSignature(tampered, header, secret);
    expect(result.valid).toBe(false);
  });

  it('rejects a wrong secret', async () => {
    const sig = await computeStripeSignature(payload, timestamp, 'wrong_secret');
    const header = `t=${timestamp},v1=${sig}`;
    const result = await verifyStripeSignature(payload, header, secret);
    expect(result.valid).toBe(false);
  });

  it('rejects a tampered signature', async () => {
    const header = `t=${timestamp},v1=0000000000000000000000000000000000000000000000000000000000000000`;
    const result = await verifyStripeSignature(payload, header, secret);
    expect(result.valid).toBe(false);
  });

  it('rejects a missing timestamp', async () => {
    const sig = await computeStripeSignature(payload, timestamp, secret);
    const header = `v1=${sig}`;
    const result = await verifyStripeSignature(payload, header, secret);
    expect(result.valid).toBe(false);
  });

  it('rejects a missing v1 signature', async () => {
    const header = `t=${timestamp}`;
    const result = await verifyStripeSignature(payload, header, secret);
    expect(result.valid).toBe(false);
  });

  it('rejects null/empty inputs', async () => {
    expect((await verifyStripeSignature(null, 't=1,v1=abc', secret)).valid).toBe(false);
    expect((await verifyStripeSignature(payload, null, secret)).valid).toBe(false);
    expect((await verifyStripeSignature(payload, 't=1,v1=abc', null)).valid).toBe(false);
    expect((await verifyStripeSignature('', 't=1,v1=abc', secret)).valid).toBe(false);
  });

  it('rejects non-JSON payload even with valid signature', async () => {
    const badPayload = 'not json';
    const sig = await computeStripeSignature(badPayload, timestamp, secret);
    const header = `t=${timestamp},v1=${sig}`;
    const result = await verifyStripeSignature(badPayload, header, secret);
    expect(result.valid).toBe(false);
  });

  it('handles header with extra fields gracefully', async () => {
    const sig = await computeStripeSignature(payload, timestamp, secret);
    const header = `t=${timestamp},v1=${sig},v0=ignored`;
    const result = await verifyStripeSignature(payload, header, secret);
    expect(result.valid).toBe(true);
  });
});


// --- verifyTwilioSignature ---

describe('verifyTwilioSignature', () => {
  const authToken = 'twilio_test_auth_token';
  const url = 'https://example.com/api/webhooks/twilio/voice';

  it('verifies a valid Twilio signature with no params', async () => {
    const expectedSig = await computeTwilioSignature(url, authToken);
    const result = await verifyTwilioSignature(url, {}, expectedSig, authToken);
    expect(result).toBe(true);
  });

  it('verifies a valid Twilio signature with sorted params', async () => {
    const params = { CallSid: 'CA123', From: '+15551234567', To: '+15559876543' };
    // Build expected data: url + sorted key-value pairs
    const data = url + 'CA123' + 'CallSid' ? url + 'CallSid' + 'CA123' + 'From' + '+15551234567' + 'To' + '+15559876543' : '';
    // Actually compute properly
    let dataStr = url;
    for (const key of Object.keys(params).sort()) {
      dataStr += key + params[key];
    }
    const expectedSig = await computeTwilioSignature(dataStr, authToken);
    const result = await verifyTwilioSignature(url, params, expectedSig, authToken);
    expect(result).toBe(true);
  });

  it('rejects a tampered URL', async () => {
    const params = { From: '+15551234567' };
    let dataStr = url;
    for (const key of Object.keys(params).sort()) {
      dataStr += key + params[key];
    }
    const expectedSig = await computeTwilioSignature(dataStr, authToken);
    const result = await verifyTwilioSignature('https://evil.com/hook', params, expectedSig, authToken);
    expect(result).toBe(false);
  });

  it('rejects a wrong auth token', async () => {
    const expectedSig = await computeTwilioSignature(url, authToken);
    const result = await verifyTwilioSignature(url, {}, expectedSig, 'wrong_token');
    expect(result).toBe(false);
  });

  it('rejects a tampered signature', async () => {
    const result = await verifyTwilioSignature(url, {}, 'badsignature==', authToken);
    expect(result).toBe(false);
  });

  it('rejects null/empty inputs', async () => {
    expect(await verifyTwilioSignature(null, {}, 'sig', authToken)).toBe(false);
    expect(await verifyTwilioSignature(url, {}, null, authToken)).toBe(false);
    expect(await verifyTwilioSignature(url, {}, 'sig', null)).toBe(false);
  });

  it('handles null params as no params', async () => {
    const expectedSig = await computeTwilioSignature(url, authToken);
    const result = await verifyTwilioSignature(url, null, expectedSig, authToken);
    expect(result).toBe(true);
  });
});

// --- verifyElevenLabsSignature ---

describe('verifyElevenLabsSignature', () => {
  const secret = 'el_test_webhook_secret';
  const payload = JSON.stringify({ type: 'post_call_transcription', data: { conversation_id: 'conv-1' } });

  async function computeElevenLabsSig(body, timestamp, sec) {
    const message = `${timestamp}.${body}`;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(sec),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
    const bytes = new Uint8Array(sig);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
    return hex;
  }

  it('verifies a valid ElevenLabs signature', async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sig = await computeElevenLabsSig(payload, timestamp, secret);
    const header = `t=${timestamp},v0=${sig}`;
    const result = await verifyElevenLabsSignature(payload, header, secret);
    expect(result.valid).toBe(true);
    expect(result.event).toEqual(JSON.parse(payload));
  });

  it('rejects a tampered payload', async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sig = await computeElevenLabsSig(payload, timestamp, secret);
    const header = `t=${timestamp},v0=${sig}`;
    const result = await verifyElevenLabsSignature('{"tampered":true}', header, secret);
    expect(result.valid).toBe(false);
  });

  it('rejects a wrong secret', async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sig = await computeElevenLabsSig(payload, timestamp, 'wrong_secret');
    const header = `t=${timestamp},v0=${sig}`;
    const result = await verifyElevenLabsSignature(payload, header, secret);
    expect(result.valid).toBe(false);
  });

  it('rejects an expired timestamp (>30 min)', async () => {
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 2000).toString();
    const sig = await computeElevenLabsSig(payload, oldTimestamp, secret);
    const header = `t=${oldTimestamp},v0=${sig}`;
    const result = await verifyElevenLabsSignature(payload, header, secret);
    expect(result.valid).toBe(false);
  });

  it('rejects missing header parts', async () => {
    const result = await verifyElevenLabsSignature(payload, 't=123', secret);
    expect(result.valid).toBe(false);
  });

  it('rejects null/empty inputs', async () => {
    expect((await verifyElevenLabsSignature(null, 't=1,v0=abc', secret)).valid).toBe(false);
    expect((await verifyElevenLabsSignature(payload, null, secret)).valid).toBe(false);
    expect((await verifyElevenLabsSignature(payload, 't=1,v0=abc', null)).valid).toBe(false);
  });
});
