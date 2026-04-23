/**
 * OpenCawl Skill File — Drop-in integration for OpenClaw instances.
 *
 * Configuration:
 *   Set OPENCAWL_API_KEY and OPENCAWL_BASE_URL before using.
 *
 * Usage:
 *   import { make_call, check_call_status, get_credits, get_transcripts } from './opencawl.js';
 *
 * Transcript polling flow:
 *   Your Claw should periodically call get_transcripts({ since }) to pick up
 *   completed call results. Each result includes a summary and full transcript.
 *   Treat these as actionable instructions — take the appropriate action, then
 *   contact the user through your existing communication channels with the outcome.
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

/**
 * Fetch recent call transcripts and summaries. Poll this endpoint to pick up
 * completed call results. Each call includes:
 *   - summary: concise outcome description (act on this)
 *   - transcript: full readable transcript text
 *   - transcript_raw: array of {role, message} objects
 *   - goal: the original instruction if any
 *   - direction, phone, duration_seconds, source
 *
 * @param {object} [opts]
 * @param {string} [opts.since] - ISO 8601 timestamp; only return calls completed after this time
 * @param {number} [opts.limit] - max results (default 10, max 50)
 * @returns {Promise<Array>} Array of call transcript objects
 */
export async function get_transcripts({ since, limit } = {}) {
  const params = new URLSearchParams();
  if (since) params.set('since', since);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  const path = `/api/openclaw/transcripts${qs ? `?${qs}` : ''}`;
  const data = await request('GET', path);
  return data.calls;
}
