import { describe, it, expect } from 'vitest';
import { onRequestPost } from './conversation-init.js';

const WEBHOOK_SECRET = 'test_conversation_init_secret';

/**
 * Create a mock D1 database.
 * users: keyed by twilio_phone_number
 * usersByPhone: keyed by user.phone
 * pendingOutboundCalls: keyed by destination_phone — the most recent pending outbound call record
 */
function createMockDB({
  users = {},
  usersByPhone = {},
  sharedNumbers = [],
  acceptedNumbers = {},
  callHistory = {},
  pendingOutboundCalls = {},
} = {}) {
  const inserts = [];

  return {
    _inserts: inserts,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              inserts.push({ sql, args });
              return { success: true, meta: { changes: 1 } };
            },
            async first() {
              // Outbound detection: SELECT id FROM users WHERE twilio_phone_number = ?
              if (sql.includes('SELECT id FROM users WHERE twilio_phone_number')) {
                const number = args[0];
                return users[number] ? { id: users[number].id } : null;
              }
              // Shared pool check for outbound detection
              if (sql.includes('SELECT 1') && sql.includes('shared_phone_numbers')) {
                const number = args[0];
                return sharedNumbers.includes(number) ? { 1: 1 } : null;
              }
              // Outbound call record lookup (JOIN query)
              if (sql.includes('FROM calls c JOIN users u') && sql.includes('outbound')) {
                const dest = args[0];
                return pendingOutboundCalls[dest] || null;
              }
              // Shared number lookup
              if (sql.includes('FROM shared_phone_numbers WHERE phone_number')) {
                const number = args[0];
                return sharedNumbers.includes(number) ? { phone_number: number } : null;
              }
              // User lookup by twilio_phone_number
              if (sql.includes('WHERE twilio_phone_number')) {
                const number = args[0];
                return users[number] || null;
              }
              // User lookup by phone
              if (sql.includes('WHERE phone =')) {
                const phone = args[0];
                return usersByPhone[phone] || null;
              }
              return null;
            },
            async all() {
              if (sql.includes('FROM accepted_numbers WHERE user_id')) {
                const userId = args[0];
                const numbers = acceptedNumbers[userId] || [];
                return { results: numbers.map((n) => ({ phone_number: n })) };
              }
              if (sql.includes('FROM calls WHERE user_id') && sql.includes('direction')) {
                const userId = args[0];
                const callerPhone = args[1];
                const key = `${userId}:${callerPhone}`;
                const history = callHistory[key] || [];
                return { results: history.map((id) => ({ id })) };
              }
              return { results: [] };
            },
          };
        },
      };
    },
  };
}

function createContext(body, db, { secret = WEBHOOK_SECRET, env = {} } = {}) {
  const request = new Request('https://example.com/api/webhooks/elevenlabs/conversation-init', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': secret,
    },
    body: JSON.stringify(body),
  });

  return {
    request,
    env: {
      DB: db || createMockDB(),
      ELEVENLABS_WEBHOOK_SECRET_CONVERSATION_INIT: WEBHOOK_SECRET,
      ...env,
    },
    data: {},
  };
}

const defaultBody = {
  caller_id: '+15559876543',
  agent_id: 'agent_test_123',
  called_number: '+15551234567',
  call_sid: 'CA_test_sid',
};


describe('POST /api/webhooks/elevenlabs/conversation-init', () => {
  it('returns 401 when webhook secret is wrong', async () => {
    const ctx = createContext(defaultBody, createMockDB(), { secret: 'wrong_secret' });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(401);
  });

  it('returns 400 when caller_id is missing', async () => {
    const ctx = createContext({ called_number: '+15551234567' }, createMockDB());
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(400);
  });

  it('returns 400 when called_number is missing', async () => {
    const ctx = createContext({ caller_id: '+15559876543' }, createMockDB());
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(400);
  });

  // --- Outbound call detection ---

  it('returns full call data for outbound call with pending record', async () => {
    const user = {
      id: 'user-outbound',
      phone: '+15550001111',
      twilio_phone_number: '+15559876543',
    };
    const callRecord = {
      id: 'call-123',
      user_id: 'user-outbound',
      goal: 'Congratulate them',
      override_system_prompt: 'Be a clown',
      override_voice_id: 'voice-clown',
      override_first_message: null,
      user_voice_id: null,
      user_system_prompt: null,
      user_first_message: null,
    };
    const db = createMockDB({
      users: { '+15559876543': user },
      pendingOutboundCalls: { '+15551234567': callRecord },
    });
    const ctx = createContext(defaultBody, db);
    const res = await onRequestPost(ctx);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.type).toBe('conversation_initiation_client_data');
    expect(data.dynamic_variables.user_id).toBe('user-outbound');
    expect(data.dynamic_variables.call_id).toBe('call-123');
    expect(data.dynamic_variables.message).toBe('Congratulate them');
    expect(data.conversation_config_override.agent.prompt.prompt).toBe('Be a clown');
    expect(data.conversation_config_override.tts.voice_id).toBe('voice-clown');
  });

  it('falls back to user defaults when no per-call overrides on outbound', async () => {
    const user = {
      id: 'user-outbound2',
      phone: '+15550001111',
      twilio_phone_number: '+15559876543',
    };
    const callRecord = {
      id: 'call-456',
      user_id: 'user-outbound2',
      goal: null,
      override_system_prompt: null,
      override_voice_id: null,
      override_first_message: null,
      user_voice_id: 'voice-default',
      user_system_prompt: 'Be helpful',
      user_first_message: 'Hello!',
    };
    const db = createMockDB({
      users: { '+15559876543': user },
      pendingOutboundCalls: { '+15551234567': callRecord },
    });
    const ctx = createContext(defaultBody, db);
    const res = await onRequestPost(ctx);

    const data = await res.json();
    expect(data.dynamic_variables.user_id).toBe('user-outbound2');
    expect(data.conversation_config_override.agent.prompt.prompt).toBe('Be helpful');
    expect(data.conversation_config_override.tts.voice_id).toBe('voice-default');
    expect(data.conversation_config_override.agent.first_message).toBe('Hello!');
  });

  it('returns empty passthrough for outbound when no pending call found', async () => {
    const db = createMockDB({});
    const ctx = createContext(defaultBody, db, {
      env: { TWILIO_DEFAULT_NUMBER: '+15559876543' },
    });
    const res = await onRequestPost(ctx);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.dynamic_variables).toEqual({});
  });

  it('detects outbound when caller_id is a shared pool number', async () => {
    const callRecord = {
      id: 'call-shared-out',
      user_id: 'user-shared-out',
      goal: 'Test',
      override_system_prompt: null,
      override_voice_id: null,
      override_first_message: null,
      user_voice_id: null,
      user_system_prompt: null,
      user_first_message: null,
    };
    const db = createMockDB({
      sharedNumbers: ['+15559876543'],
      pendingOutboundCalls: { '+15551234567': callRecord },
    });
    const ctx = createContext(defaultBody, db);
    const res = await onRequestPost(ctx);

    const data = await res.json();
    expect(data.dynamic_variables.user_id).toBe('user-shared-out');
    expect(data.dynamic_variables.call_id).toBe('call-shared-out');
  });

  // --- Inbound call routing ---

  it('returns dispatch mode for owner calling their own number', async () => {
    const user = {
      id: 'user-abc',
      phone: '+15559876543',
      plan: 'starter',
      twilio_phone_number: '+15551234567',
      voice_id: 'voice-123',
      first_message: 'Hey boss',
    };
    const db = createMockDB({ users: { '+15551234567': user } });
    const ctx = createContext(defaultBody, db);
    const res = await onRequestPost(ctx);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.dynamic_variables.user_id).toBe('user-abc');
    expect(data.dynamic_variables.owner_mode).toBe('dispatch');
    expect(data.conversation_config_override.agent.prompt.prompt).toContain('dispatch_call');
    expect(data.conversation_config_override.tts.voice_id).toBe('voice-123');
  });

  it('identifies owner by caller phone when called_number is the default number', async () => {
    const user = {
      id: 'user-free',
      phone: '+15559876543',
      plan: 'free',
    };
    const db = createMockDB({ usersByPhone: { '+15559876543': user } });
    const ctx = createContext(defaultBody, db, {
      env: { TWILIO_DEFAULT_NUMBER: '+15551234567' },
    });
    const res = await onRequestPost(ctx);

    const data = await res.json();
    expect(data.dynamic_variables.user_id).toBe('user-free');
    expect(data.dynamic_variables.owner_mode).toBe('dispatch');
  });

  it('returns promo agent for unknown caller on shared number', async () => {
    const user = {
      id: 'user-shared',
      phone: '+15550000000',
      plan: 'free',
      twilio_phone_number: '+15551234567',
    };
    const db = createMockDB({
      users: { '+15551234567': user },
      sharedNumbers: ['+15551234567'],
    });
    const ctx = createContext(defaultBody, db);
    const res = await onRequestPost(ctx);

    const data = await res.json();
    expect(data.conversation_config_override.agent.prompt.prompt.toLowerCase()).toContain('openclaw');
  });

  it('returns owner agent config for open-access dedicated number', async () => {
    const user = {
      id: 'user-ded',
      phone: '+15550002222',
      plan: 'pro',
      twilio_phone_number: '+15551234567',
      system_prompt: 'You are a helpful assistant.',
      voice_id: 'voice-456',
      first_message: 'Hello, how can I help?',
    };
    const db = createMockDB({
      users: { '+15551234567': user },
      acceptedNumbers: { 'user-ded': [] },
      callHistory: {},
    });
    const ctx = createContext(defaultBody, db);
    const res = await onRequestPost(ctx);

    const data = await res.json();
    expect(data.dynamic_variables.user_id).toBe('user-ded');
    expect(data.conversation_config_override.agent.prompt.prompt).toBe('You are a helpful assistant.');
    expect(data.conversation_config_override.tts.voice_id).toBe('voice-456');
  });

  it('returns rejection for caller not in accepted list', async () => {
    const user = {
      id: 'user-restricted',
      phone: '+15550003333',
      plan: 'pro',
      twilio_phone_number: '+15551234567',
    };
    const db = createMockDB({
      users: { '+15551234567': user },
      acceptedNumbers: { 'user-restricted': ['+15550009999'] },
    });
    const ctx = createContext(defaultBody, db);
    const res = await onRequestPost(ctx);

    const data = await res.json();
    expect(data.conversation_config_override.agent.first_message.toLowerCase()).toContain('not currently accepting');
  });

  it('returns graceful fallback on unexpected error', async () => {
    const db = {
      prepare() {
        return {
          bind() {
            return {
              async first() { throw new Error('DB exploded'); },
            };
          },
        };
      },
    };
    const ctx = createContext(defaultBody, db);
    const res = await onRequestPost(ctx);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.conversation_config_override.agent.first_message).toContain('technical');
  });

  it('skips auth check when no secret is configured', async () => {
    const db = createMockDB({});
    const request = new Request('https://example.com/api/webhooks/elevenlabs/conversation-init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(defaultBody),
    });
    const ctx = { request, env: { DB: db }, data: {} };
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);
  });
});
