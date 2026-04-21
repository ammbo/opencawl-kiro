/**
 * JWT utilities for OpenClaw Phone Platform.
 * Uses only Web Crypto API (crypto.subtle) — no external dependencies.
 * Implements HMAC-SHA256 (HS256) signing and verification.
 */

/**
 * Encodes a string or ArrayBuffer to base64url.
 * @param {string | ArrayBuffer | Uint8Array} data
 * @returns {string}
 */
export function base64urlEncode(data) {
  let bytes;
  if (typeof data === 'string') {
    bytes = new TextEncoder().encode(data);
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else {
    bytes = data;
  }

  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decodes a base64url string to a regular string.
 * @param {string} str
 * @returns {string}
 */
export function base64urlDecode(str) {
  // Restore standard base64
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding
  const pad = base64.length % 4;
  if (pad === 2) base64 += '==';
  else if (pad === 3) base64 += '=';

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Imports a secret string as a CryptoKey for HMAC-SHA256.
 * @param {string} secret
 * @param {string[]} usages - ['sign'] or ['verify']
 * @returns {Promise<CryptoKey>}
 */
async function importKey(secret, usages) {
  const keyData = new TextEncoder().encode(secret);
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages,
  );
}

/**
 * Signs a JWT payload with HMAC-SHA256.
 * @param {{ sub: string, iat: number, exp: number, [key: string]: any }} payload
 * @param {string} secret
 * @returns {Promise<string>} Signed JWT string (header.payload.signature)
 */
export async function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };

  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await importKey(secret, ['sign']);
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signingInput),
  );

  const encodedSignature = base64urlEncode(signatureBuffer);
  return `${signingInput}.${encodedSignature}`;
}

/**
 * Verifies a JWT string and returns the decoded payload if valid.
 * Returns null if the token is invalid, has a bad signature, or is expired.
 * @param {string} token
 * @param {string} secret
 * @returns {Promise<object | null>} Decoded payload or null
 */
export async function verifyJWT(token, secret) {
  if (typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  // Verify signature
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  let signatureBytes;
  try {
    const base64 = encodedSignature.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    const padded = pad === 2 ? base64 + '==' : pad === 3 ? base64 + '=' : base64;
    const binary = atob(padded);
    signatureBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      signatureBytes[i] = binary.charCodeAt(i);
    }
  } catch {
    return null;
  }

  const key = await importKey(secret, ['verify']);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    new TextEncoder().encode(signingInput),
  );

  if (!valid) return null;

  // Decode payload
  let payload;
  try {
    payload = JSON.parse(base64urlDecode(encodedPayload));
  } catch {
    return null;
  }

  // Check expiration
  if (typeof payload.exp === 'number' && payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}
