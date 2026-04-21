import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchCallStatus, TERMINAL_STATES, POLL_INTERVAL } from './useCallStatus.js';

describe('useCallStatus', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('constants', () => {
    it('TERMINAL_STATES includes completed and failed', () => {
      expect(TERMINAL_STATES).toContain('completed');
      expect(TERMINAL_STATES).toContain('failed');
      expect(TERMINAL_STATES).toHaveLength(2);
    });

    it('POLL_INTERVAL is 2000ms', () => {
      expect(POLL_INTERVAL).toBe(2000);
    });
  });

  describe('fetchCallStatus', () => {
    it('returns data on successful response with pending status', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'pending',
          transcript: null,
          duration_seconds: null,
        }),
      });

      const result = await fetchCallStatus('call-123');

      expect(result.data).toEqual({
        status: 'pending',
        transcript: null,
        duration: null,
      });
      expect(result.error).toBeNull();
      expect(result.terminal).toBe(false);
    });

    it('marks completed status as terminal', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'completed',
          transcript: 'Hello world',
          duration_seconds: 45,
        }),
      });

      const result = await fetchCallStatus('call-done');

      expect(result.data).toEqual({
        status: 'completed',
        transcript: 'Hello world',
        duration: 45,
      });
      expect(result.error).toBeNull();
      expect(result.terminal).toBe(true);
    });

    it('marks failed status as terminal', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'failed',
          transcript: null,
          duration_seconds: null,
        }),
      });

      const result = await fetchCallStatus('call-fail');

      expect(result.terminal).toBe(true);
      expect(result.data.status).toBe('failed');
    });

    it('does not mark in_progress as terminal', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'in_progress',
          transcript: null,
          duration_seconds: null,
        }),
      });

      const result = await fetchCallStatus('call-active');

      expect(result.terminal).toBe(false);
      expect(result.data.status).toBe('in_progress');
    });

    it('calls the correct URL with encoded callId', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'pending', transcript: null, duration_seconds: null }),
      });

      await fetchCallStatus('call with spaces');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/openclaw/status?call_id=call%20with%20spaces',
        { credentials: 'same-origin' },
      );
    });

    it('passes credentials: same-origin', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'pending', transcript: null, duration_seconds: null }),
      });

      await fetchCallStatus('call-abc');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ credentials: 'same-origin' }),
      );
    });

    it('returns redirect flag on 401', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Unauthorized' } }),
      });

      const result = await fetchCallStatus('call-unauth');

      expect(result.redirect).toBe(true);
      expect(result.terminal).toBe(true);
      expect(result.data).toBeNull();
    });

    it('returns error on non-ok response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: { message: 'Call not found' } }),
      });

      const result = await fetchCallStatus('call-404');

      expect(result.error).toBe('Call not found');
      expect(result.terminal).toBe(true);
      expect(result.data).toBeNull();
    });

    it('returns fallback error message when error response has no message', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      const result = await fetchCallStatus('call-500');

      expect(result.error).toBe('Request failed (500)');
    });

    it('handles network errors', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await fetchCallStatus('call-net-err');

      expect(result.error).toBe('Network error');
      expect(result.terminal).toBe(true);
      expect(result.data).toBeNull();
    });

    it('handles fetch throwing without message', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue({});

      const result = await fetchCallStatus('call-unknown-err');

      expect(result.error).toBe('Network error');
      expect(result.terminal).toBe(true);
    });

    it('maps duration_seconds to duration in returned data', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'completed',
          transcript: 'test',
          duration_seconds: 120,
        }),
      });

      const result = await fetchCallStatus('call-dur');

      expect(result.data.duration).toBe(120);
      expect(result.data).not.toHaveProperty('duration_seconds');
    });
  });
});
