#!/usr/bin/env node

/**
 * OpenCawl CLI — used by the OpenClaw skill to interact with the OpenCawl API.
 *
 * Usage:
 *   node opencawl.mjs transcripts [--since ISO8601] [--limit N]
 *   node opencawl.mjs call --to +15551234567 --message "goal"
 *   node opencawl.mjs status --call-id UUID
 *   node opencawl.mjs credits
 *   node opencawl.mjs results --call-id UUID --result "outcome"
 *
 * Environment:
 *   OPENCAWL_API_KEY  — required
 *   OPENCAWL_BASE_URL — optional, defaults to https://opencawl.ai
 */

const API_KEY = process.env.OPENCAWL_API_KEY;
const BASE_URL = (process.env.OPENCAWL_BASE_URL || 'https://opencawl.ai').replace(/\/$/, '');

if (!API_KEY) {
  console.error('Error: OPENCAWL_API_KEY environment variable is not set.');
  console.error('Get your API key from the OpenCawl dashboard: https://opencawl.ai');
  process.exit(1);
}

async function request(method, path, body) {
  const url = `${BASE_URL}${path}`;
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) {
    console.error(`Error: ${data?.error?.message || `Request failed (${res.status})`}`);
    process.exit(1);
  }
  return data;
}

function parseArgs(args) {
  const parsed = { _: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        parsed[key] = next;
        i++;
      } else {
        parsed[key] = true;
      }
    } else {
      parsed._.push(args[i]);
    }
  }
  return parsed;
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];

switch (command) {
  case 'transcripts': {
    const params = new URLSearchParams();
    if (args.since) params.set('since', args.since);
    if (args.limit) params.set('limit', args.limit);
    const qs = params.toString();
    const data = await request('GET', `/api/openclaw/transcripts${qs ? `?${qs}` : ''}`);

    if (!data.calls || data.calls.length === 0) {
      console.log('No new transcripts.');
      break;
    }

    for (const call of data.calls) {
      console.log(`\n--- Call ${call.call_id} ---`);
      console.log(`Direction: ${call.direction}`);
      console.log(`Phone: ${call.phone}`);
      console.log(`Status: ${call.status}`);
      console.log(`Duration: ${call.duration_seconds}s`);
      if (call.goal) console.log(`Goal: ${call.goal}`);
      if (call.source) console.log(`Source: ${call.source}`);
      if (call.summary) console.log(`\nSummary: ${call.summary}`);
      if (call.transcript) console.log(`\nTranscript:\n${call.transcript}`);
      console.log(`\nCompleted: ${call.completed_at}`);
    }
    break;
  }

  case 'call': {
    const to = args.to;
    const message = args.message;
    if (!to) {
      console.error('Error: --to is required (E.164 phone number, e.g. +15551234567)');
      process.exit(1);
    }
    if (!message) {
      console.error('Error: --message is required (the goal for the call)');
      process.exit(1);
    }
    const data = await request('POST', '/api/openclaw/call', {
      destination_phone: to,
      message,
    });
    console.log(`Call dispatched.`);
    console.log(`Call ID: ${data.call_id}`);
    console.log(`Status: ${data.status}`);
    break;
  }

  case 'status': {
    const callId = args['call-id'];
    if (!callId) {
      console.error('Error: --call-id is required');
      process.exit(1);
    }
    const data = await request('GET', `/api/openclaw/status?call_id=${encodeURIComponent(callId)}`);
    console.log(`Call ID: ${data.call_id}`);
    console.log(`Status: ${data.status}`);
    if (data.duration_seconds != null) console.log(`Duration: ${data.duration_seconds}s`);
    if (data.transcript) {
      console.log(`\nTranscript:\n${data.transcript}`);
    }
    break;
  }

  case 'credits': {
    const data = await request('GET', '/api/openclaw/credits');
    console.log(`Credits: ${data.credits_balance}`);
    break;
  }

  case 'results': {
    const callId = args['call-id'];
    const result = args['result'];
    if (!callId) {
      console.error('Error: --call-id is required');
      process.exit(1);
    }
    if (!result) {
      console.error('Error: --result is required');
      process.exit(1);
    }
    const data = await request('POST', '/api/openclaw/results', {
      call_id: callId,
      result,
    });
    console.log(`Result posted for call ${data.call_id}.`);
    break;
  }

  default:
    console.error(`Usage: opencawl.mjs <command> [options]`);
    console.error('');
    console.error('Commands:');
    console.error('  transcripts  Poll for completed call transcripts');
    console.error('  call         Make an outbound phone call');
    console.error('  status       Check status of a call');
    console.error('  credits      Check credit balance');
    console.error('  results      Post a result back for a call');
    console.error('');
    console.error('Examples:');
    console.error('  node opencawl.mjs transcripts --since "2026-04-22T00:00:00Z"');
    console.error('  node opencawl.mjs call --to "+15551234567" --message "Reschedule my appointment"');
    console.error('  node opencawl.mjs status --call-id "abc-123"');
    console.error('  node opencawl.mjs credits');
    console.error('  node opencawl.mjs results --call-id "abc-123" --result "Appointment rescheduled"');
    process.exit(1);
}
