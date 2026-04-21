/**
 * OpenCawl Skill File — Drop-in integration for OpenClaw instances.
 *
 * Configuration:
 *   Set OPENCAWL_API_KEY and OPENCAWL_BASE_URL before using.
 *
 * Usage:
 *   import { make_call, check_call_status, get_credits } from './opencawl.js';
 */

// Configuration — set these before using
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
