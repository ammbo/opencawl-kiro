import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildElevenLabsPayload, validateOverrideFields } from './agent-overrides.js';

/**
 * Property 1: Outbound override payload construction
 * **Validates: Requirements 1.1, 1.2, 1.3**
 *
 * For any combination of optional override fields (system_prompt, voice_id, first_message),
 * the constructed payload maps each provided field to its correct nested path and omits absent fields.
 */
describe('Property 1: Outbound override payload construction', () => {
  const agentId = 'agent-test-123';
  const fromNumber = '+15551234567';
  const destPhone = '+15559876543';
  const baseUser = { id: 'user-1' };

  it('maps provided override fields to correct nested paths and omits absent fields', () => {
    fc.assert(
      fc.property(
        fc.record({
          system_prompt: fc.option(fc.string({ minLength: 1, maxLength: 500 }), { nil: undefined }),
          voice_id: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
          first_message: fc.option(fc.string({ minLength: 1, maxLength: 500 }), { nil: undefined }),
        }),
        fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
        (overrides, userVoiceId) => {
          const user = { ...baseUser, voice_id: userVoiceId };
          const payload = buildElevenLabsPayload(agentId, fromNumber, destPhone, user, overrides);

          // Top-level fields always present
          expect(payload.agent_id).toBe(agentId);
          expect(payload.agent_phone_number_id).toBe(fromNumber);
          expect(payload.to_phone_number).toBe(destPhone);
          expect(payload.conversation_initiation_client_data).toBeDefined();
          expect(payload.conversation_initiation_client_data.dynamic_variables.user_id).toBe(user.id);

          const configOverride = payload.conversation_initiation_client_data.conversation_config_override;

          // system_prompt mapping
          if (overrides.system_prompt != null) {
            expect(configOverride).toBeDefined();
            expect(configOverride.agent.prompt.prompt).toBe(overrides.system_prompt);
          } else {
            // system_prompt path should not exist
            if (configOverride?.agent?.prompt) {
              throw new Error('system_prompt path should not exist when not provided');
            }
          }

          // first_message mapping
          if (overrides.first_message != null) {
            expect(configOverride).toBeDefined();
            expect(configOverride.agent.first_message).toBe(overrides.first_message);
          } else {
            if (configOverride?.agent?.first_message !== undefined) {
              throw new Error('first_message path should not exist when not provided');
            }
          }

          // voice_id mapping: override takes precedence, then user.voice_id
          const effectiveVoiceId = overrides.voice_id != null ? overrides.voice_id : userVoiceId;
          if (effectiveVoiceId != null) {
            expect(configOverride).toBeDefined();
            expect(configOverride.tts.voice_id).toBe(effectiveVoiceId);
          } else {
            if (configOverride?.tts) {
              throw new Error('tts path should not exist when no voice_id');
            }
          }

          // When no overrides and no user voice_id, conversation_config_override should not exist
          const hasAnyOverride = overrides.system_prompt != null || overrides.first_message != null || effectiveVoiceId != null;
          if (!hasAnyOverride) {
            expect(configOverride).toBeUndefined();
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('includes message in dynamic_variables only when provided', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
        (message) => {
          const payload = buildElevenLabsPayload(agentId, fromNumber, destPhone, baseUser, {}, message);
          const dynVars = payload.conversation_initiation_client_data.dynamic_variables;

          if (message != null && message !== '') {
            expect(dynVars.message).toBe(message);
          } else {
            expect(dynVars.message).toBeUndefined();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 2: Override field length validation
 * **Validates: Requirements 1.5, 1.6, 6.3, 6.4**
 *
 * Strings exceeding max length are rejected; strings within limits are accepted.
 */
describe('Property 2: Override field length validation', () => {
  const SYSTEM_PROMPT_MAX = 10_000;
  const FIRST_MESSAGE_MAX = 2_000;

  it('rejects system_prompt exceeding 10,000 characters', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: SYSTEM_PROMPT_MAX + 1, max: SYSTEM_PROMPT_MAX + 5000 }),
        (len) => {
          const longPrompt = 'a'.repeat(len);
          const result = validateOverrideFields({ system_prompt: longPrompt });
          expect(result.valid).toBe(false);
          expect(result.error).toContain('system_prompt');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('accepts system_prompt within 10,000 characters', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: SYSTEM_PROMPT_MAX }),
        (len) => {
          const prompt = 'a'.repeat(len);
          const result = validateOverrideFields({ system_prompt: prompt });
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects first_message exceeding 2,000 characters', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: FIRST_MESSAGE_MAX + 1, max: FIRST_MESSAGE_MAX + 5000 }),
        (len) => {
          const longMsg = 'b'.repeat(len);
          const result = validateOverrideFields({ first_message: longMsg });
          expect(result.valid).toBe(false);
          expect(result.error).toContain('first_message');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('accepts first_message within 2,000 characters', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: FIRST_MESSAGE_MAX }),
        (len) => {
          const msg = 'b'.repeat(len);
          const result = validateOverrideFields({ first_message: msg });
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('validates both fields together — system_prompt checked first', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: SYSTEM_PROMPT_MAX + 2000 }),
        fc.string({ minLength: 0, maxLength: FIRST_MESSAGE_MAX + 1000 }),
        (sp, fm) => {
          const result = validateOverrideFields({ system_prompt: sp, first_message: fm });
          if (sp.length > SYSTEM_PROMPT_MAX) {
            expect(result.valid).toBe(false);
            expect(result.error).toContain('system_prompt');
          } else if (fm.length > FIRST_MESSAGE_MAX) {
            expect(result.valid).toBe(false);
            expect(result.error).toContain('first_message');
          } else {
            expect(result.valid).toBe(true);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('accepts when no fields are provided', () => {
    const result = validateOverrideFields({});
    expect(result.valid).toBe(true);
  });
});
