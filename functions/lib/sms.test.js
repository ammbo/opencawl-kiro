import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendSms } from './sms.js';

describe('sendSms', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const env = {
    TWILIO_ACCOUNT_SID: 'AC_TEST_SID',
    TWILIO_AUTH_TOKEN: 'test_auth_token',
  };

  it('returns { success: true } on successful send', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const result = await sendSms(env, '+15550001111', '+15550002222', 'Hello');

    expect(result).toEqual({ success: true });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(globalThis.fetch.mock.calls[0][0]).toContain('AC_TEST_SID');
  });

  it('returns { success: false } when fetch returns non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    });

    const result = await sendSms(env, '+15550001111', '+15550002222', 'Hello');

    expect(result).toEqual({ success: false });
  });

  it('returns { success: false } when fetch throws an error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    const result = await sendSms(env, '+15550001111', '+15550002222', 'Hello');

    expect(result).toEqual({ success: false });
  });

  it('returns { success: false } when TWILIO_ACCOUNT_SID is missing', async () => {
    globalThis.fetch = vi.fn();

    const result = await sendSms(
      { TWILIO_AUTH_TOKEN: 'token' },
      '+15550001111',
      '+15550002222',
      'Hello'
    );

    expect(result).toEqual({ success: false });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
