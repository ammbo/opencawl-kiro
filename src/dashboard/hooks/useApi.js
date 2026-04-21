import { useState, useCallback } from 'preact/hooks';

export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const request = useCallback(async (url, options = {}) => {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch(url, {
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (res.status === 401) {
        window.location.href = '/login/';
        return null;
      }

      const json = await res.json();

      if (!res.ok) {
        const msg = json?.error?.message || `Request failed (${res.status})`;
        setError(msg);
        setLoading(false);
        return null;
      }

      setData(json);
      setLoading(false);
      return json;
    } catch (err) {
      setError(err.message || 'Network error');
      setLoading(false);
      return null;
    }
  }, []);

  return { request, data, error, loading };
}
