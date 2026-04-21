/**
 * API key utilities for OpenClaw Phone Platform.
 * Uses only Web Crypto API — no external dependencies.
 *
 * Key generation: crypto.getRandomValues(new Uint8Array(32)) → hex string
 * Hashing: crypto.subtle.digest('SHA-256', ...) → hex string
 * Prefix: first 8 characters of the plaintext key
 */

/**
 * Generates a cryptographically random 32-byte API key as a 64-character hex string.
 * @returns {string}
 */
export function generateApiKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Computes the SHA-256 hash of an API key string, returned as a hex string.
 * @param {string} key - The plaintext API key
 * @returns {Promise<string>}
 */
export async function hashApiKey(key) {
  const encoded = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Returns the first 8 characters of the plaintext API key (the display prefix).
 * @param {string} key - The plaintext API key
 * @returns {string}
 */
export function getKeyPrefix(key) {
  return key.slice(0, 8);
}
