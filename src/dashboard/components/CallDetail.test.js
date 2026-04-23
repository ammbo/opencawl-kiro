import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { formatTranscript } from './CallDetail.jsx';

describe('formatTranscript', () => {
  /**
   * Property 5: Transcript formatting preserves all speaker labels and messages
   * **Validates: Requirements 5.3**
   *
   * For any transcript array of {role, message} objects, the formatted output
   * contains each message's text and a speaker label derived from the role
   * for every entry in the array.
   */
  it('Property 5: preserves all speaker labels and messages for any transcript array', () => {
    const roleArb = fc.oneof(
      fc.constant('agent'),
      fc.constant('user'),
      fc.string({ minLength: 1, maxLength: 30 }),
    );

    const entryArb = fc.record({
      role: roleArb,
      message: fc.string({ minLength: 0, maxLength: 500 }),
    });

    const transcriptArb = fc.array(entryArb, { minLength: 0, maxLength: 50 });

    fc.assert(
      fc.property(transcriptArb, (transcript) => {
        const result = formatTranscript(transcript);

        // Output length matches input length
        expect(result.length).toBe(transcript.length);

        for (let i = 0; i < transcript.length; i++) {
          const input = transcript[i];
          const output = result[i];

          // Each entry has a label and message
          expect(output).toHaveProperty('label');
          expect(output).toHaveProperty('message');

          // Message is preserved (empty string when missing)
          expect(output.message).toBe(input.message || '');

          // Label is derived correctly from role
          const role = (input.role || '').toLowerCase();
          if (role === 'agent') {
            expect(output.label).toBe('Agent');
          } else if (role === 'user') {
            expect(output.label).toBe('Caller');
          } else if (role) {
            expect(output.label).toBe(role);
          } else {
            expect(output.label).toBe('Unknown');
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('Property 5b: preserves all speaker labels and messages when input is a JSON string', () => {
    const roleArb = fc.oneof(
      fc.constant('agent'),
      fc.constant('user'),
      fc.string({ minLength: 1, maxLength: 30 }),
    );

    const entryArb = fc.record({
      role: roleArb,
      message: fc.string({ minLength: 0, maxLength: 500 }),
    });

    const transcriptArb = fc.array(entryArb, { minLength: 1, maxLength: 50 });

    fc.assert(
      fc.property(transcriptArb, (transcript) => {
        const jsonStr = JSON.stringify(transcript);
        const result = formatTranscript(jsonStr);

        expect(result.length).toBe(transcript.length);

        for (let i = 0; i < transcript.length; i++) {
          const input = transcript[i];
          const output = result[i];

          expect(output.message).toBe(input.message || '');

          const role = (input.role || '').toLowerCase();
          if (role === 'agent') {
            expect(output.label).toBe('Agent');
          } else if (role === 'user') {
            expect(output.label).toBe('Caller');
          } else if (role) {
            expect(output.label).toBe(role);
          } else {
            expect(output.label).toBe('Unknown');
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
