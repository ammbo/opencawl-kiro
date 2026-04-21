/**
 * Input validation library for OpenClaw Phone Platform.
 * Pure JS — no external dependencies.
 */

// E.164 format: + followed by 1-15 digits
const E164_REGEX = /^\+[1-9]\d{0,14}$/;

/**
 * Validates that a phone number string conforms to E.164 format.
 * @param {string} phone
 * @returns {boolean}
 */
export function isValidE164(phone) {
  if (typeof phone !== 'string') return false;
  return E164_REGEX.test(phone);
}

// SQL injection patterns (case-insensitive)
const SQL_PATTERNS = [
  /'\s*;\s*drop\b/i,
  /'\s*;\s*delete\b/i,
  /'\s*;\s*update\b/i,
  /'\s*;\s*insert\b/i,
  /'\s*;\s*alter\b/i,
  /'\s*;\s*create\b/i,
  /'\s*;\s*truncate\b/i,
  /\bor\s+1\s*=\s*1\b/i,
  /\band\s+1\s*=\s*1\b/i,
  /\bunion\s+select\b/i,
  /\bunion\s+all\s+select\b/i,
  /--/,
  /\/\*[\s\S]*?\*\//,
  /;\s*exec\b/i,
  /;\s*execute\b/i,
  /\bxp_cmdshell\b/i,
  /\bwaitfor\s+delay\b/i,
  /\bbenchmark\s*\(/i,
  /\bsleep\s*\(/i,
];

// XSS patterns (case-insensitive)
const XSS_PATTERNS = [
  /<script[\s>]/i,
  /<\/script>/i,
  /javascript\s*:/i,
  /\bon\w+\s*=/i,       // onerror=, onload=, onclick=, etc.
  /<iframe[\s>]/i,
  /<\/iframe>/i,
  /<object[\s>]/i,
  /<embed[\s>]/i,
  /<svg[\s>]/i,
  /\bexpression\s*\(/i,
  /\beval\s*\(/i,
  /data\s*:\s*text\/html/i,
  /vbscript\s*:/i,
];

/**
 * Checks if a string contains dangerous SQL injection patterns.
 * @param {string} str
 * @returns {boolean} true if dangerous pattern found
 */
function hasSqlInjection(str) {
  return SQL_PATTERNS.some((pattern) => pattern.test(str));
}

/**
 * Checks if a string contains dangerous XSS patterns.
 * @param {string} str
 * @returns {boolean} true if dangerous pattern found
 */
function hasXss(str) {
  return XSS_PATTERNS.some((pattern) => pattern.test(str));
}

/**
 * Sanitizes a string by stripping/neutralizing SQL injection and XSS patterns.
 * Returns the cleaned string.
 * @param {string} str
 * @returns {string}
 */
export function sanitizeInput(str) {
  if (typeof str !== 'string') return '';

  let cleaned = str;

  // Neutralize SQL comment sequences
  cleaned = cleaned.replace(/--/g, '');
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

  // Strip HTML tags that are dangerous
  cleaned = cleaned.replace(/<\/?script[^>]*>/gi, '');
  cleaned = cleaned.replace(/<\/?iframe[^>]*>/gi, '');
  cleaned = cleaned.replace(/<\/?object[^>]*>/gi, '');
  cleaned = cleaned.replace(/<\/?embed[^>]*>/gi, '');
  cleaned = cleaned.replace(/<\/?svg[^>]*>/gi, '');

  // Neutralize javascript: and vbscript: protocol handlers
  cleaned = cleaned.replace(/javascript\s*:/gi, '');
  cleaned = cleaned.replace(/vbscript\s*:/gi, '');

  // Neutralize inline event handlers (onerror=, onload=, etc.)
  cleaned = cleaned.replace(/\bon(\w+)\s*=/gi, 'data-disabled-$1=');

  // Neutralize expression() CSS
  cleaned = cleaned.replace(/expression\s*\(/gi, '');

  // Neutralize data:text/html
  cleaned = cleaned.replace(/data\s*:\s*text\/html/gi, '');

  // Encode remaining angle brackets to prevent tag injection
  cleaned = cleaned.replace(/</g, '&lt;');
  cleaned = cleaned.replace(/>/g, '&gt;');

  return cleaned;
}

/**
 * Detects whether a string contains SQL injection or XSS patterns.
 * Useful for rejecting input outright rather than sanitizing.
 * @param {string} str
 * @returns {{ safe: boolean, reason?: string }}
 */
export function detectInjection(str) {
  if (typeof str !== 'string') return { safe: true };
  if (hasSqlInjection(str)) return { safe: false, reason: 'Input contains SQL injection pattern' };
  if (hasXss(str)) return { safe: false, reason: 'Input contains XSS pattern' };
  return { safe: true };
}

/**
 * Parses a JSON request body and validates that all required fields are present.
 * @param {Request} request - The incoming Request object
 * @param {string[]} requiredFields - Array of field names that must be present
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
export async function parseBody(request, requiredFields = []) {
  let body;

  try {
    const text = await request.text();
    if (!text || text.trim() === '') {
      return { success: false, error: 'Request body is empty' };
    }
    body = JSON.parse(text);
  } catch {
    return { success: false, error: 'Invalid JSON in request body' };
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { success: false, error: 'Request body must be a JSON object' };
  }

  const missing = requiredFields.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    return {
      success: false,
      error: `Missing required fields: ${missing.join(', ')}`,
    };
  }

  return { success: true, data: body };
}
