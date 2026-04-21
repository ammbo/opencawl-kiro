import { describe, it, expect } from 'vitest';
import { base64urlEncode, base64urlDecode, signJWT, verifyJWT } from './jwt.js';

// --- base64url helpers ---

describe('base64urlEncode', () => {
  it('encodes a simple string', () => {
    const encoded = base64urlEncode('hello');
    expect(encoded).toBe('aGVsbG8');
  });

  it('produces no +, /, or = characters', () => {
    // Use bytes that would produce +, /, = in standard base64
    const data = new Uint8Array([251, 255, 254, 63, 62]);
    const encoded = base64urlEncode(data);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('encodes an ArrayBuffer', () => {
    const buf = new TextEncoder().encode('test').buffer;
    const encoded = base64urlEncode(buf);
    expect(encoded).toBe('dGVzdA');
  });

  it('encodes an empty string', () => {
    expect(base64urlEncode('')).toBe('');
  });
});

describe('base64urlDecode', () => {
  it('decodes a simple string', () => {
    expect(base64urlDecode('aGVsbG8')).toBe('hello');
  });

  it('round-trips with base64urlEncode', () => {
    const original = 'The quick brown fox jumps over the lazy dog!';
    expect(base64urlDecode(base64urlEncode(original))).toBe(original);
  });

  it('handles base64url characters (- and _)', () => {
    // Standard base64 of these bytes would contain + and /
    // base64url should use - and _ instead
    const encoded = base64urlEncode(new Uint8Array([251, 255, 254]));
    expect(encoded).not.toMatch(/[+/=]/);
    expect(encoded).toMatch(/[-_]/);
  });

  it('decodes empty string', () => {
    expect(base64urlDecode('')).toBe('');
  });
});

// --- signJWT ---

describe('signJWT', () => {
  const secret = 'test-secret-key-for-jwt';

  it('returns a string with three dot-separated parts', async () => {
    const payload = { sub: 'user_123', iat: 1700000000, exp: 1700086400 };
    const token = await signJWT(payload, secret);
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
    expect(parts.every((p) => p.length > 0)).toBe(true);
  });

  it('encodes the correct header', async () => {
    const payload = { sub: 'user_1', iat: 1700000000, exp: 1700086400 };
    const token = await signJWT(payload, secret);
    const header = JSON.parse(base64urlDecode(token.split('.')[0]));
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
  });

  it('encodes the payload correctly', async () => {
    const payload = { sub: 'user_42', iat: 1700000000, exp: 1700086400 };
    const token = await signJWT(payload, secret);
    const decoded = JSON.parse(base64urlDecode(token.split('.')[1]));
    expect(decoded).toEqual(payload);
  });

  it('produces different signatures for different secrets', async () => {
    const payload = { sub: 'user_1', iat: 1700000000, exp: 1700086400 };
    const token1 = await signJWT(payload, 'secret-a');
    const token2 = await signJWT(payload, 'secret-b');
    expect(token1.split('.')[2]).not.toBe(token2.split('.')[2]);
  });
});

// --- verifyJWT ---

describe('verifyJWT', () => {
  const secret = 'test-secret-key-for-jwt';

  it('verifies a valid token and returns the payload', async () => {
    const payload = { sub: 'user_123', iat: 1700000000, exp: Math.floor(Date.now() / 1000) + 3600 };
    const token = await signJWT(payload, secret);
    const result = await verifyJWT(token, secret);
    expect(result).toEqual(payload);
  });

  it('returns null for a token signed with a different secret', async () => {
    const payload = { sub: 'user_1', iat: 1700000000, exp: Math.floor(Date.now() / 1000) + 3600 };
    const token = await signJWT(payload, 'wrong-secret');
    const result = await verifyJWT(token, secret);
    expect(result).toBeNull();
  });

  it('returns null for an expired token', async () => {
    const payload = { sub: 'user_1', iat: 1700000000, exp: 1700000001 }; // expired
    const token = await signJWT(payload, secret);
    const result = await verifyJWT(token, secret);
    expect(result).toBeNull();
  });

  it('returns null for a tampered payload', async () => {
    const payload = { sub: 'user_1', iat: 1700000000, exp: Math.floor(Date.now() / 1000) + 3600 };
    const token = await signJWT(payload, secret);
    // Tamper with the payload part
    const parts = token.split('.');
    const tamperedPayload = base64urlEncode(JSON.stringify({ ...payload, sub: 'user_hacker' }));
    const tampered = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    const result = await verifyJWT(tampered, secret);
    expect(result).toBeNull();
  });

  it('returns null for malformed tokens', async () => {
    expect(await verifyJWT('not.a.valid.token', secret)).toBeNull();
    expect(await verifyJWT('onlyonepart', secret)).toBeNull();
    expect(await verifyJWT('two.parts', secret)).toBeNull();
    expect(await verifyJWT('', secret)).toBeNull();
    expect(await verifyJWT(null, secret)).toBeNull();
    expect(await verifyJWT(undefined, secret)).toBeNull();
  });

  it('accepts a token without exp field (no expiration)', async () => {
    const payload = { sub: 'user_1', iat: 1700000000 };
    const token = await signJWT(payload, secret);
    const result = await verifyJWT(token, secret);
    expect(result).toEqual(payload);
  });

  it('preserves extra payload fields', async () => {
    const payload = { sub: 'user_1', iat: 1700000000, exp: Math.floor(Date.now() / 1000) + 3600, role: 'admin' };
    const token = await signJWT(payload, secret);
    const result = await verifyJWT(token, secret);
    expect(result.role).toBe('admin');
  });
});
