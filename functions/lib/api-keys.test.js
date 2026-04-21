import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey, getKeyPrefix } from './api-keys.js';

// --- generateApiKey ---

describe('generateApiKey', () => {
  it('returns a 64-character hex string', () => {
    const key = generateApiKey();
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates unique keys on successive calls', () => {
    const keys = new Set(Array.from({ length: 10 }, () => generateApiKey()));
    expect(keys.size).toBe(10);
  });

  it('contains only lowercase hex characters', () => {
    const key = generateApiKey();
    expect(key).toMatch(/^[0-9a-f]+$/);
  });
});

// --- hashApiKey ---

describe('hashApiKey', () => {
  it('returns a 64-character hex string', async () => {
    const hash = await hashApiKey('test-key');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces the same hash for the same input', async () => {
    const key = 'my-api-key-123';
    const hash1 = await hashApiKey(key);
    const hash2 = await hashApiKey(key);
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different inputs', async () => {
    const hash1 = await hashApiKey('key-a');
    const hash2 = await hashApiKey('key-b');
    expect(hash1).not.toBe(hash2);
  });

  it('hashes a generated key correctly', async () => {
    const key = generateApiKey();
    const hash = await hashApiKey(key);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // Hash should differ from the key itself
    expect(hash).not.toBe(key);
  });

  it('handles empty string input', async () => {
    const hash = await hashApiKey('');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// --- getKeyPrefix ---

describe('getKeyPrefix', () => {
  it('returns the first 8 characters of a key', () => {
    const key = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    expect(getKeyPrefix(key)).toBe('abcdef12');
  });

  it('returns the correct prefix for a generated key', () => {
    const key = generateApiKey();
    const prefix = getKeyPrefix(key);
    expect(prefix).toHaveLength(8);
    expect(key.startsWith(prefix)).toBe(true);
  });

  it('returns the full string if shorter than 8 chars', () => {
    expect(getKeyPrefix('abc')).toBe('abc');
  });

  it('returns empty string for empty input', () => {
    expect(getKeyPrefix('')).toBe('');
  });
});

// --- round-trip integration ---

describe('API key round-trip', () => {
  it('hash lookup matches the same plaintext key', async () => {
    const key = generateApiKey();
    const storedHash = await hashApiKey(key);

    // Simulate lookup: hash the same key again and compare
    const lookupHash = await hashApiKey(key);
    expect(lookupHash).toBe(storedHash);
  });

  it('hash lookup does not match a different key', async () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();
    const hash1 = await hashApiKey(key1);
    const hash2 = await hashApiKey(key2);
    expect(hash1).not.toBe(hash2);
  });

  it('prefix is consistent with the generated key', () => {
    const key = generateApiKey();
    const prefix = getKeyPrefix(key);
    expect(key.substring(0, 8)).toBe(prefix);
  });
});
