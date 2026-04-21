import { describe, it, expect } from 'vitest';
import { isValidE164, sanitizeInput, detectInjection, parseBody } from './validation.js';

// --- isValidE164 ---

describe('isValidE164', () => {
  it('accepts valid E.164 numbers', () => {
    expect(isValidE164('+1')).toBe(true);
    expect(isValidE164('+14155551234')).toBe(true);
    expect(isValidE164('+442071234567')).toBe(true);
    expect(isValidE164('+861012345678')).toBe(true);
    expect(isValidE164('+123456789012345')).toBe(true); // 15 digits max
  });

  it('rejects numbers without + prefix', () => {
    expect(isValidE164('14155551234')).toBe(false);
  });

  it('rejects numbers with letters', () => {
    expect(isValidE164('+1415abc1234')).toBe(false);
  });

  it('rejects numbers with too many digits (>15)', () => {
    expect(isValidE164('+1234567890123456')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidE164('')).toBe(false);
  });

  it('rejects just a plus sign', () => {
    expect(isValidE164('+')).toBe(false);
  });

  it('rejects numbers starting with +0', () => {
    expect(isValidE164('+0123456')).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isValidE164(null)).toBe(false);
    expect(isValidE164(undefined)).toBe(false);
    expect(isValidE164(12345)).toBe(false);
    expect(isValidE164({})).toBe(false);
  });

  it('rejects numbers with spaces or dashes', () => {
    expect(isValidE164('+1 415 555 1234')).toBe(false);
    expect(isValidE164('+1-415-555-1234')).toBe(false);
  });
});

// --- sanitizeInput ---

describe('sanitizeInput', () => {
  it('returns empty string for non-string input', () => {
    expect(sanitizeInput(null)).toBe('');
    expect(sanitizeInput(undefined)).toBe('');
    expect(sanitizeInput(123)).toBe('');
  });

  it('passes through safe strings unchanged (except angle brackets)', () => {
    expect(sanitizeInput('hello world')).toBe('hello world');
    expect(sanitizeInput('John Doe')).toBe('John Doe');
  });

  it('strips script tags', () => {
    const result = sanitizeInput('<script>alert("xss")</script>');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('</script>');
  });

  it('neutralizes javascript: protocol', () => {
    const result = sanitizeInput('javascript:alert(1)');
    expect(result.toLowerCase()).not.toContain('javascript:');
  });

  it('neutralizes inline event handlers', () => {
    const result = sanitizeInput('onerror=alert(1)');
    expect(result).not.toMatch(/\bonerror\s*=/i);
  });

  it('strips SQL comment sequences', () => {
    const result = sanitizeInput("admin'--");
    expect(result).not.toContain('--');
  });

  it('strips block comments', () => {
    const result = sanitizeInput('SELECT /* comment */ * FROM users');
    expect(result).not.toContain('/*');
    expect(result).not.toContain('*/');
  });

  it('encodes remaining angle brackets', () => {
    const result = sanitizeInput('<div>hello</div>');
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
  });

  it('strips iframe tags', () => {
    const result = sanitizeInput('<iframe src="evil.com"></iframe>');
    expect(result).not.toContain('<iframe');
  });
});

// --- detectInjection ---

describe('detectInjection', () => {
  it('returns safe for normal strings', () => {
    expect(detectInjection('hello world')).toEqual({ safe: true });
    expect(detectInjection('+14155551234')).toEqual({ safe: true });
  });

  it('detects SQL injection: DROP TABLE', () => {
    const result = detectInjection("'; DROP TABLE users;");
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('SQL injection');
  });

  it('detects SQL injection: OR 1=1', () => {
    const result = detectInjection("' OR 1=1");
    expect(result.safe).toBe(false);
  });

  it('detects SQL injection: UNION SELECT', () => {
    const result = detectInjection('UNION SELECT * FROM passwords');
    expect(result.safe).toBe(false);
  });

  it('detects SQL injection: comment sequences', () => {
    const result = detectInjection('admin--');
    expect(result.safe).toBe(false);
  });

  it('detects XSS: script tags', () => {
    const result = detectInjection('<script>alert(1)</script>');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('XSS');
  });

  it('detects XSS: javascript: protocol', () => {
    const result = detectInjection('javascript:void(0)');
    expect(result.safe).toBe(false);
  });

  it('detects XSS: event handlers', () => {
    expect(detectInjection('onerror=alert(1)').safe).toBe(false);
    expect(detectInjection('onload=fetch("evil")').safe).toBe(false);
  });

  it('returns safe for non-string input', () => {
    expect(detectInjection(null)).toEqual({ safe: true });
    expect(detectInjection(42)).toEqual({ safe: true });
  });
});

// --- parseBody ---

describe('parseBody', () => {
  function makeRequest(body) {
    return new Request('https://example.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  it('parses valid JSON with all required fields', async () => {
    const req = makeRequest({ phone: '+14155551234', code: '123456' });
    const result = await parseBody(req, ['phone', 'code']);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ phone: '+14155551234', code: '123456' });
  });

  it('returns error for missing required fields', async () => {
    const req = makeRequest({ phone: '+14155551234' });
    const result = await parseBody(req, ['phone', 'code']);
    expect(result.success).toBe(false);
    expect(result.error).toContain('code');
  });

  it('returns error for empty body', async () => {
    const req = new Request('https://example.com', { method: 'POST', body: '' });
    const result = await parseBody(req, ['phone']);
    expect(result.success).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('returns error for invalid JSON', async () => {
    const req = makeRequest('not json {{{');
    const result = await parseBody(req, []);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid JSON');
  });

  it('returns error when body is an array', async () => {
    const req = makeRequest('[1,2,3]');
    const result = await parseBody(req, []);
    expect(result.success).toBe(false);
    expect(result.error).toContain('JSON object');
  });

  it('treats null and empty string field values as missing', async () => {
    const req = makeRequest({ phone: null, code: '' });
    const result = await parseBody(req, ['phone', 'code']);
    expect(result.success).toBe(false);
    expect(result.error).toContain('phone');
    expect(result.error).toContain('code');
  });

  it('works with no required fields', async () => {
    const req = makeRequest({ anything: 'goes' });
    const result = await parseBody(req);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ anything: 'goes' });
  });
});
