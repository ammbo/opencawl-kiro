import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { onRequestPost } from './conversation-init.js';

const WEBHOOK_SECRET = 'test_conversation_init_secret';

/**
 * Create a mock D1 database.
 */
function createMockDB({
  users = {},
  sharedNumbers = [],
  acceptedNumbers = {},
  callHistory = {},
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
              if (sql.includes('FROM shared_phone_numbers WHERE phone_number')) {
                const number = args[0];
                return sharedNumbers.includes(number) ? { phone_number: number } : null;
              }
              if (sql.includes('WHERE twilio_phone_number')) {
                const number = args[0];
                return users[number] || null;
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

function createContext(body, db, secret = WEBHOOK_SECRET) {
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
    },
    data: {},
  };
}

const e164Phone = () =>
  fc.integer({ min: 1, max: 9 }).chain((first) =>
    fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
      minLength: 4,
      maxLength: 14,
    }).map((rest) => `+${first}${rest}`),
  );


describe('POST /api/webhooks/elevenlabs/conversation-init', () => {
  const defaultBody = {
    caller_id: '+15559876543',
    agent_id: 'agent_test_123',
    called_number: '+15551234567',
    call_sid: 'CA_test_sid',
  };

  it('returns 401 when webhook secret is wrong', async () => {
    const ctx = createContext(defaultBody, createMockDB(), 'wrong_secret');
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

  it('returns promo agent when no owner found for called number', async () => {
    const db = createMockDB({});
    const ctx = createContext(defaultBody, db);
    const res = await onRequestPost(ctx);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.type).toBe('conversation_initiation_client_data');
    expect(data.conversation_config_override.agent.prompt.prompt.toLowerCase()).toContain('openclaw');
    expect(data.conversation_config_override.agent.first_message).toBeTruthy();
  });

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
    expect(data.type).toBe('conversation_initiation_client_data');
    expect(data.dynamic_variables.user_id).toBe('user-abc');
    expect(data.dynamic_variables.owner_mode).toBe('dispatch');
    expect(data.dynamic_variables.call_id).toBeTruthy();
    expect(data.conversation_config_override.agent.prompt.prompt).toContain('dispatch_call');
    expect(data.conversation_config_override.tts.voice_id).toBe('voice-123');
    expect(data.conversation_config_override.agent.first_message).toBe('Hey boss');

    // Should have created a call record
    const callInsert = db._inserts.find((i) => i.sql.includes('INSERT INTO calls'));
    expect(callInsert).toBeTruthy();
    expect(callInsert.args[1]).toBe('user-abc');
    expect(callInsert.args[2]).toBe('inbound');
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

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.conversation_config_override.agent.prompt.prompt.toLowerCase()).toContain('openclaw');

    // No call record for unknown on shared
    const callInsert = db._inserts.find((i) => i.sql.includes('INSERT INTO calls'));
    expect(callInsert).toBeUndefined();
  });

  it('returns owner agent config for accepted caller on dedicated number (open access)', async () => {
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
      sharedNumbers: [],
      acceptedNumbers: { 'user-ded': [] },
      callHistory: {},
    });
    const ctx = createContext(defaultBody, db);
    const res = await onRequestPost(ctx);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.dynamic_variables.user_id).toBe('user-ded');
    expect(data.dynamic_variables.call_id).toBeTruthy();
    expect(data.dynamic_variables.previous_call_count).toBe('0');
    expect(data.conversation_config_override.agent.prompt.prompt).toBe('You are a helpful assistant.');
    expect(data.conversation_config_override.tts.voice_id).toBe('voice-456');
    expect(data.conversation_config_override.agent.first_message).toBe('Hello, how can I help?');

    const callInsert = db._inserts.find((i) => i.sql.includes('INSERT INTO calls'));
    expect(callInsert).toBeTruthy();
  });

  it('returns rejection for caller not in accepted list on dedicated number', async () => {
    const user = {
      id: 'user-restricted',
      phone: '+15550003333',
      plan: 'pro',
      twilio_phone_number: '+15551234567',
    };
    const db = createMockDB({
      users: { '+15551234567': user },
      sharedNumbers: [],
      acceptedNumbers: { 'user-restricted': ['+15550009999'] }, // caller not in list
    });
    const ctx = createContext(defaultBody, db);
    const res = await onRequestPost(ctx);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.conversation_config_override.agent.first_message.toLowerCase()).toContain('not currently accepting');

    // No call record for rejected callers
    const callInsert = db._inserts.find((i) => i.sql.includes('INSERT INTO calls'));
    expect(callInsert).toBeUndefined();
  });

  it('accepts caller who IS in the accepted list on dedicated number', async () => {
    const user = {
      id: 'user-accept',
      phone: '+15550004444',
      plan: 'pro',
      twilio_phone_number: '+15551234567',
      system_prompt: 'Be friendly.',
    };
    const db = createMockDB({
      users: { '+15551234567': user },
      sharedNumbers: [],
      acceptedNumbers: { 'user-accept': ['+15559876543'] }, // caller IS in list
      callHistory: { 'user-accept:+15559876543': ['prev-call-1', 'prev-call-2'] },
    });
    const ctx = createContext(defaultBody, db);
    const res = await onRequestPost(ctx);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.dynamic_variables.user_id).toBe('user-accept');
    expect(data.dynamic_variables.previous_call_count).toBe('2');
    expect(data.conversation_config_override.agent.prompt.prompt).toBe('Be friendly.');
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
    expect(data.type).toBe('conversation_initiation_client_data');
    expect(data.conversation_config_override.agent.first_message).toContain('technical');
  });

  it('skips auth check when no secret is configured', async () => {
    const db = createMockDB({});
    const request = new Request('https://example.com/api/webhooks/elevenlabs/conversation-init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(defaultBody),
    });
    const ctx = {
      request,
      env: { DB: db },
      data: {},
    };
    const res = await onRequestPost(ctx);
    // Should not 401 — just proceed with no auth
    expect(res.status).toBe(200);
  });
});

