import { describe, it, expect } from 'vitest';
import {
  isPaidUser,
  buildSaveConfigBody,
  buildAddNumberBody,
  buildRemoveNumberBody,
  parseAgentConfig,
} from './inbound-config-utils.js';

describe('InboundConfig page utilities', () => {
  describe('parseAgentConfig', () => {
    /**
     * Validates: Requirements 7.1
     * Form fields populated from GET /api/phone/agent-config response
     */
    it('extracts system_prompt, first_message, and voice_id from API data', () => {
      const data = {
        system_prompt: 'You are a helpful assistant',
        first_message: 'Hello, how can I help?',
        voice_id: 'voice_abc123',
      };
      const result = parseAgentConfig(data);
      expect(result.systemPrompt).toBe('You are a helpful assistant');
      expect(result.firstMessage).toBe('Hello, how can I help?');
      expect(result.voiceId).toBe('voice_abc123');
    });

    it('defaults to empty strings when fields are missing', () => {
      const result = parseAgentConfig({});
      expect(result.systemPrompt).toBe('');
      expect(result.firstMessage).toBe('');
      expect(result.voiceId).toBe('');
    });

    it('defaults to empty strings when data is null', () => {
      const result = parseAgentConfig(null);
      expect(result.systemPrompt).toBe('');
      expect(result.firstMessage).toBe('');
      expect(result.voiceId).toBe('');
    });

    it('defaults to empty strings when data is undefined', () => {
      const result = parseAgentConfig(undefined);
      expect(result.systemPrompt).toBe('');
      expect(result.firstMessage).toBe('');
      expect(result.voiceId).toBe('');
    });
  });

  describe('buildSaveConfigBody', () => {
    /**
     * Validates: Requirements 7.6, 7.7
     * Save button POSTs system_prompt, first_message, voice_id;
     * success/error toasts depend on the response
     */
    it('includes all three fields when voice_id is set', () => {
      const body = buildSaveConfigBody('Be helpful', 'Hi there', 'voice_123');
      expect(body).toEqual({
        system_prompt: 'Be helpful',
        first_message: 'Hi there',
        voice_id: 'voice_123',
      });
    });

    it('omits voice_id (sets undefined) when voice_id is empty string', () => {
      const body = buildSaveConfigBody('prompt', 'greeting', '');
      expect(body.system_prompt).toBe('prompt');
      expect(body.first_message).toBe('greeting');
      expect(body.voice_id).toBeUndefined();
    });

    it('handles empty strings for all fields', () => {
      const body = buildSaveConfigBody('', '', '');
      expect(body.system_prompt).toBe('');
      expect(body.first_message).toBe('');
      expect(body.voice_id).toBeUndefined();
    });

    it('voice_id undefined is stripped by JSON.stringify', () => {
      const body = buildSaveConfigBody('p', 'm', '');
      const json = JSON.parse(JSON.stringify(body));
      expect('voice_id' in json).toBe(false);
    });
  });

  describe('buildAddNumberBody', () => {
    /**
     * Validates: Requirements 7.6
     * Add number POSTs with phone_number and optional label
     */
    it('builds body with phone and label', () => {
      const body = buildAddNumberBody('+15551234567', 'Office');
      expect(body).toEqual({
        numbers: [{ phone_number: '+15551234567', label: 'Office' }],
      });
    });

    it('omits label when empty string', () => {
      const body = buildAddNumberBody('+15551234567', '');
      expect(body.numbers[0].phone_number).toBe('+15551234567');
      expect(body.numbers[0].label).toBeUndefined();
    });

    it('label undefined is stripped by JSON.stringify', () => {
      const body = buildAddNumberBody('+15551234567', '');
      const json = JSON.parse(JSON.stringify(body));
      expect('label' in json.numbers[0]).toBe(false);
    });
  });

  describe('buildRemoveNumberBody', () => {
    /**
     * Validates: Requirements 7.6
     * Remove number DELETEs with phone_numbers array
     */
    it('wraps phone number in phone_numbers array', () => {
      const body = buildRemoveNumberBody('+15551234567');
      expect(body).toEqual({ phone_numbers: ['+15551234567'] });
    });

    it('always produces a single-element array', () => {
      const body = buildRemoveNumberBody('+449876543210');
      expect(body.phone_numbers).toHaveLength(1);
      expect(body.phone_numbers[0]).toBe('+449876543210');
    });
  });

  describe('isPaidUser', () => {
    /**
     * Validates: Requirements 8.6
     * Free-plan users see "requires paid plan" message instead of accepted numbers
     */
    it('returns false for free plan', () => {
      expect(isPaidUser({ plan: 'free' })).toBe(false);
    });

    it('returns true for pro plan', () => {
      expect(isPaidUser({ plan: 'pro' })).toBe(true);
    });

    it('returns true for paid plan', () => {
      expect(isPaidUser({ plan: 'paid' })).toBe(true);
    });

    it('returns false when plan is null', () => {
      expect(isPaidUser({ plan: null })).toBe(false);
    });

    it('returns false when plan is undefined', () => {
      expect(isPaidUser({ plan: undefined })).toBe(false);
    });

    it('returns false when user is null', () => {
      expect(isPaidUser(null)).toBe(false);
    });

    it('returns false when user is undefined', () => {
      expect(isPaidUser(undefined)).toBe(false);
    });

    it('returns false when user has no plan property', () => {
      expect(isPaidUser({})).toBe(false);
    });

    it('returns true for any non-free string plan', () => {
      expect(isPaidUser({ plan: 'enterprise' })).toBe(true);
    });
  });
});
