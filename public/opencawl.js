/**
 * OpenCawl JS Module — programmatic API client for OpenCawl.
 *
 * This is the JavaScript module version. For the OpenClaw skill (SKILL.md + CLI),
 * see the opencawl/ directory.
 *
 * Configuration:
 *   Set OPENCAWL_API_KEY and OPENCAWL_BASE_URL before using.
 *
 * Usage:
 *   import { configure, make_call, check_call_status, get_credits, get_transcripts } from './opencawl.js';
 *   configure({ apiKey: 'your-key' });
 */

let config = {
  apiKey: '',
  baseUrl: 'https://opencawl.ai',
};

export function configure({ apiKey, baseUrl }) {
  if (apiKey) config.apiKey = apiKey;
  if (baseUrl) config.baseUrl = baseUrl;
}

async function request(method, path, body) {
  const url = `${config.baseUrl}${path}`;
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Request failed (${res.status})`);
  return data;
}

export async function make_call(to, message) {
  const data = await request('POST', '/api/openclaw/call', { destination_phone: to, message });
  return data.call_id;
}

export async function check_call_status(call_id) {
  return request('GET', `/api/openclaw/status?call_id=${encodeURIComponent(call_id)}`);
}

export async function get_credits() {
  const data = await request('GET', '/api/openclaw/credits');
  return data.credits_balance;
}

export async function get_transcripts({ since, limit } = {}) {
  const params = new URLSearchParams();
  if (since) params.set('since', since);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  const path = `/api/openclaw/transcripts${qs ? `?${qs}` : ''}`;
  const data = await request('GET', path);
  return data.calls;
}
