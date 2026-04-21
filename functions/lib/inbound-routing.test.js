import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { classifyCaller, buildInboundTwiml } from './inbound-routing.js';

/** Generator for E.164-like phone numbers */
const e164Phone = () =>
  fc.integer({ min: 1, max: 9 }).chain((first) =>
    fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
      minLength: 4,
      maxLength: 14,
    }).map((rest) => `+${first}${rest}`)
  );

/**
 * Property 3: Inbound caller classification
 * **Validates: Requirements 2.1**
 *
 * When caller matches owner.phone → 'owner'.
 * When caller does not match → 'unknown_shared' or 'unknown_dedicated' based on isSharedNumber.
 */
describe('Property 3: Inbound caller classification', () => {
  it('classifies caller as owner when callerNumber matches owner.phone', () => {
    fc.assert(
      fc.property(
        e164Phone(),
        fc.boolean(),
        (phone, isShared) => {
          const owner = { phone, id: 'user-1' };
          const result = classifyCaller(phone, owner, isShared);
          expect(result).toBe('owner');
        },
      ),
      { numRuns: 200 },
    );
  });

  it('classifies caller as unknown_shared when not owner and shared number', () => {
    fc.assert(
      fc.property(
        e164Phone(),
        e164Phone(),
        (callerPhone, ownerPhone) => {
          fc.pre(callerPhone !== ownerPhone);
          const owner = { phone: ownerPhone, id: 'user-1' };
          const result = classifyCaller(callerPhone, owner, true);
          expect(result).toBe('unknown_shared');
        },
      ),
      { numRuns: 200 },
    );
  });

  it('classifies caller as unknown_dedicated when not owner and dedicated number', () => {
    fc.assert(
      fc.property(
        e164Phone(),
        e164Phone(),
        (callerPhone, ownerPhone) => {
          fc.pre(callerPhone !== ownerPhone);
          const owner = { phone: ownerPhone, id: 'user-1' };
          const result = classifyCaller(callerPhone, owner, false);
          expect(result).toBe('unknown_dedicated');
        },
      ),
      { numRuns: 200 },
    );
  });
});

/**
 * Property 4: Owner call uses stored agent config
 * **Validates: Requirements 2.2**
 *
 * For owner calls with stored config, TwiML Stream includes those config values as Parameters.
 */
describe('Property 4: Owner call uses stored agent config', () => {
  it('includes stored system_prompt, voice_id, first_message in TwiML Stream Parameters', () => {
    fc.assert(
      fc.property(
        fc.record({
          system_prompt: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
          voice_id: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
          first_message: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
        }),
        e164Phone(),
        (config, callerPhone) => {
          const owner = {
            id: 'user-owner',
            phone: callerPhone,
            system_prompt: config.system_prompt,
            voice_id: config.voice_id,
            first_message: config.first_message,
          };

          const twiml = buildInboundTwiml('owner', {
            owner,
            agentId: 'agent-123',
            callId: 'call-abc',
            callerNumber: callerPhone,
          });

          // TwiML should always contain Connect and Stream
          expect(twiml).toContain('<Connect>');
          expect(twiml).toContain('<Stream');

          // Check each config field
          if (config.system_prompt != null) {
            expect(twiml).toContain('name="system_prompt"');
            // The value is XML-escaped, so check the parameter exists
            expect(twiml).toContain('<Parameter name="system_prompt"');
          } else {
            expect(twiml).not.toContain('name="system_prompt"');
          }

          if (config.voice_id != null) {
            expect(twiml).toContain('name="voice_id"');
            expect(twiml).toContain('<Parameter name="voice_id"');
          } else {
            expect(twiml).not.toContain('name="voice_id"');
          }

          if (config.first_message != null) {
            expect(twiml).toContain('name="first_message"');
            expect(twiml).toContain('<Parameter name="first_message"');
          } else {
            expect(twiml).not.toContain('name="first_message"');
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

/**
 * Property 6: Unknown caller on shared number gets promo agent
 * **Validates: Requirements 3.1, 3.3**
 *
 * TwiML connects to a promo agent with a strict OpenClaw system prompt.
 * Contains Connect + Stream with system_prompt and first_message parameters.
 */
describe('Property 6: Unknown caller on shared number gets promo agent', () => {
  it('returns TwiML with Connect + Stream containing OpenClaw promo system_prompt', () => {
    fc.assert(
      fc.property(
        e164Phone(),
        e164Phone(),
        (callerPhone, ownerPhone) => {
          fc.pre(callerPhone !== ownerPhone);

          const owner = { id: 'user-1', phone: ownerPhone };
          const twiml = buildInboundTwiml('unknown_shared', {
            owner,
            agentId: 'agent-123',
            callId: 'call-abc',
            callerNumber: callerPhone,
          });

          expect(twiml).toContain('<Connect>');
          expect(twiml).toContain('<Stream');
          expect(twiml).toContain('name="system_prompt"');
          expect(twiml).toContain('name="first_message"');
          expect(twiml.toLowerCase()).toContain('openclaw');
          expect(twiml).not.toContain('<Hangup/>');
        },
      ),
      { numRuns: 200 },
    );
  });
});

/**
 * Property 7: Accepted numbers gate on dedicated numbers
 * **Validates: Requirements 4.1, 4.2**
 *
 * Non-empty accepted list: caller in list → connected (Connect+Stream), caller not in list → hangup.
 * Empty accepted list → open access (connected).
 */
describe('Property 7: Accepted numbers gate on dedicated numbers', () => {
  it('accepts caller when their number is in the accepted list', () => {
    fc.assert(
      fc.property(
        e164Phone(),
        fc.array(e164Phone(), { minLength: 1, maxLength: 10 }),
        (callerPhone, otherNumbers) => {
          // Ensure caller is in the list
          const acceptedNumbers = [...otherNumbers, callerPhone];
          const owner = { id: 'user-1', phone: '+10000000000' };

          const twiml = buildInboundTwiml('unknown_dedicated', {
            owner,
            agentId: 'agent-123',
            callId: 'call-abc',
            callerNumber: callerPhone,
            acceptedNumbers,
            callHistory: [],
          });

          expect(twiml).toContain('<Connect>');
          expect(twiml).toContain('<Stream');
          expect(twiml).not.toContain('<Hangup/>');
        },
      ),
      { numRuns: 200 },
    );
  });

  it('rejects caller when their number is NOT in a non-empty accepted list', () => {
    fc.assert(
      fc.property(
        e164Phone(),
        fc.array(e164Phone(), { minLength: 1, maxLength: 10 }),
        (callerPhone, acceptedNumbers) => {
          // Ensure caller is NOT in the list
          const filtered = acceptedNumbers.filter((n) => n !== callerPhone);
          fc.pre(filtered.length > 0); // list must be non-empty
          const owner = { id: 'user-1', phone: '+10000000000' };

          const twiml = buildInboundTwiml('unknown_dedicated', {
            owner,
            agentId: 'agent-123',
            callId: 'call-abc',
            callerNumber: callerPhone,
            acceptedNumbers: filtered,
            callHistory: [],
          });

          expect(twiml).toContain('<Say>');
          expect(twiml).toContain('<Hangup/>');
          expect(twiml).not.toContain('<Connect>');
          expect(twiml).not.toContain('<Stream');
        },
      ),
      { numRuns: 200 },
    );
  });

  it('accepts all callers when accepted list is empty (open access)', () => {
    fc.assert(
      fc.property(
        e164Phone(),
        (callerPhone) => {
          const owner = { id: 'user-1', phone: '+10000000000' };

          const twiml = buildInboundTwiml('unknown_dedicated', {
            owner,
            agentId: 'agent-123',
            callId: 'call-abc',
            callerNumber: callerPhone,
            acceptedNumbers: [],
            callHistory: [],
          });

          expect(twiml).toContain('<Connect>');
          expect(twiml).toContain('<Stream');
          expect(twiml).not.toContain('<Hangup/>');
        },
      ),
      { numRuns: 100 },
    );
  });
});
