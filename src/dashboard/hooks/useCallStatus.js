import { useState, useEffect, useCallback, useRef } from 'preact/hooks';

export const TERMINAL_STATES = ['completed', 'failed'];
export const POLL_INTERVAL = 2000;

/**
 * Fetches call status from the API. Exported for testing.
 * @param {string} callId
 * @returns {Promise<{ data: object|null, error: string|null, terminal: boolean }>}
 */
export async function fetchCallStatus(callId) {
  try {
    const res = await fetch(
      `/api/openclaw/status?call_id=${encodeURIComponent(callId)}`,
      { credentials: 'same-origin' },
    );

    if (res.status === 401) {
      return { data: null, error: 'unauthorized', terminal: true, redirect: true };
    }

    const json = await res.json();

    if (!res.ok) {
      const msg = json?.error?.message || `Request failed (${res.status})`;
      return { data: null, error: msg, terminal: true };
    }

    return {
      data: {
        status: json.status,
        transcript: json.transcript ?? null,
        duration: json.duration_seconds ?? null,
      },
      error: null,
      terminal: TERMINAL_STATES.includes(json.status),
    };
  } catch (err) {
    return { data: null, error: err.message || 'Network error', terminal: true };
  }
}

/**
 * Polls GET /api/openclaw/status?call_id={callId} every 2 seconds.
 * Stops on terminal states (completed, failed) or when callId is null.
 * @param {string|null} callId
 * @returns {{ status: string|null, transcript: string|null, duration: number|null, error: string|null, reset: () => void }}
 */
export function useCallStatus(callId) {
  const [status, setStatus] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [duration, setDuration] = useState(null);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    setStatus(null);
    setTranscript(null);
    setDuration(null);
    setError(null);
  }, [stopPolling]);

  useEffect(() => {
    if (!callId) {
      stopPolling();
      return;
    }

    const poll = async () => {
      const result = await fetchCallStatus(callId);

      if (result.redirect) {
        window.location.href = '/login/';
        stopPolling();
        return;
      }

      if (result.error) {
        setError(result.error);
        stopPolling();
        return;
      }

      setStatus(result.data.status);
      setTranscript(result.data.transcript);
      setDuration(result.data.duration);
      setError(null);

      if (result.terminal) {
        stopPolling();
      }
    };

    // Poll immediately, then every POLL_INTERVAL ms
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL);

    return () => stopPolling();
  }, [callId, stopPolling]);

  return { status, transcript, duration, error, reset };
}
