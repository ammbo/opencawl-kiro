/**
 * Webhook signature verification for OpenClaw Phone Platform.
 * Uses only Web Crypto API (crypto.subtle) — no external dependencies.
 * Supports Stripe (HMAC-SHA256), Twilio (HMAC-SHA1), and ElevenLabs (shared secret).
 */

/**
 * Converts an ArrayBuffer to a hex string.
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function bufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Converts an ArrayBuffer to a base64 string.
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 * Compares two strings in constant time regardless of where they differ.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}


/**
 * Verifies a Stripe webhook signature using HMAC-SHA256.
 *
 * Stripe sends a `Stripe-Signature` header with format: `t=timestamp,v1=signature`
 * The signed payload is `${timestamp}.${payload}`.
 *
 * @param {string} payload - The raw request body string
 * @param {string} signatureHeader - The Stripe-Signature header value
 * @param {string} secret - The webhook signing secret (whsec_...)
 * @returns {Promise<{ valid: boolean, event?: object }>}
 */
export async function verifyStripeSignature(payload, signatureHeader, secret) {
  if (!payload || !signatureHeader || !secret) {
    return { valid: false };
  }

  // Parse the signature header: t=timestamp,v1=signature
  const parts = signatureHeader.split(',');
  let timestamp = null;
  let signature = null;

  for (const part of parts) {
    const [key, value] = part.split('=', 2);
    if (key === 't') timestamp = value;
    else if (key === 'v1') signature = value;
  }

  if (!timestamp || !signature) {
    return { valid: false };
  }

  // Compute expected signature: HMAC-SHA256(secret, timestamp.payload)
  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signedPayload),
  );

  const expectedSignature = bufferToHex(signatureBuffer);

  if (!timingSafeEqual(expectedSignature, signature)) {
    return { valid: false };
  }

  try {
    const event = JSON.parse(payload);
    return { valid: true, event };
  } catch {
    return { valid: false };
  }
}

/**
 * Verifies a Twilio request signature using HMAC-SHA1.
 *
 * Twilio signs requests by:
 * 1. Taking the full URL
 * 2. Sorting POST params alphabetically by key
 * 3. Concatenating URL + sorted key-value pairs
 * 4. Computing HMAC-SHA1 with the auth token
 * 5. Base64-encoding the result
 *
 * @param {string} url - The full request URL
 * @param {Record<string, string>} params - The POST parameters
 * @param {string} signature - The X-Twilio-Signature header value
 * @param {string} authToken - The Twilio auth token
 * @returns {Promise<boolean>}
 */
export async function verifyTwilioSignature(url, params, signature, authToken) {
  if (!url || !signature || !authToken) {
    return false;
  }

  // Build the data string: URL + sorted key-value pairs
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

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(data),
  );

  const expectedSignature = bufferToBase64(signatureBuffer);

  return timingSafeEqual(expectedSignature, signature);
}

/**
 * Verifies an ElevenLabs webhook HMAC-SHA256 signature.
 * Header format: xi-signature: t=<timestamp>,v0=<hex_signature>
 * Signed message: "${timestamp}.${rawBody}"
 * Tolerance: 30 minutes.
 *
 * @param {string} rawBody - The raw request body string
 * @param {string} signatureHeader - The xi-signature header value
 * @param {string} secret - The webhook signing secret from ElevenLabs dashboard
 * @returns {Promise<{ valid: boolean, event?: object }>}
 */
export async function verifyElevenLabsSignature(rawBody, signatureHeader, secret) {
  if (!rawBody || !signatureHeader || !secret) {
    return { valid: false };
  }

  // Parse header: t=<timestamp>,v0=<signature>
  const parts = signatureHeader.split(',');
  let timestamp = null;
  let signature = null;

  for (const part of parts) {
    const [key, value] = part.split('=', 2);
    if (key === 't') timestamp = value;
    else if (key === 'v0') signature = value;
  }

  if (!timestamp || !signature) {
    return { valid: false };
  }

  // Validate timestamp (30-minute tolerance)
  const now = Math.floor(Date.now() / 1000);
  const reqTimestamp = parseInt(timestamp, 10);
  if (isNaN(reqTimestamp) || now - reqTimestamp > 1800) {
    return { valid: false };
  }

  // Compute HMAC-SHA256 of "${timestamp}.${rawBody}"
  const message = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message),
  );

  const expectedSignature = bufferToHex(signatureBuffer);

  if (!timingSafeEqual(expectedSignature, signature)) {
    return { valid: false };
  }

  try {
    const event = JSON.parse(rawBody);
    return { valid: true, event };
  } catch {
    return { valid: false };
  }
}

// Export for testing
export { timingSafeEqual, bufferToHex, bufferToBase64 };
