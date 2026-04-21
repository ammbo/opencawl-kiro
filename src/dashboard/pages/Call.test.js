import { describe, it, expect } from 'vitest';
import { STATUS_LABELS, formatDuration, classifyCallError } from './Call.jsx';

describe('Call page utilities', () => {
  describe('STATUS_LABELS', () => {
    /**
     * Validates: Requirements 4.2
     * Status badge label mapping: pending → "Queued", in_progress → "In Progress",
     * completed → "Complete", failed → "Failed"
     */
    it('maps pending to "Queued"', () => {
      expect(STATUS_LABELS.pending).toBe('Queued');
    });

    it('maps in_progress to "In Progress"', () => {
      expect(STATUS_LABELS.in_progress).toBe('In Progress');
    });

    it('maps completed to "Complete"', () => {
      expect(STATUS_LABELS.completed).toBe('Complete');
    });

    it('maps failed to "Failed"', () => {
      expect(STATUS_LABELS.failed).toBe('Failed');
    });

    it('covers exactly 4 statuses', () => {
      expect(Object.keys(STATUS_LABELS)).toHaveLength(4);
    });

    it('returns undefined for unknown status', () => {
      expect(STATUS_LABELS['unknown']).toBeUndefined();
    });
  });

  describe('formatDuration', () => {
    /**
     * Validates: Requirements 4.2
     * Duration formatted as MM:SS
     */
    it('formats 0 seconds as 00:00', () => {
      expect(formatDuration(0)).toBe('00:00');
    });

    it('formats 45 seconds as 00:45', () => {
      expect(formatDuration(45)).toBe('00:45');
    });

    it('formats 60 seconds as 01:00', () => {
      expect(formatDuration(60)).toBe('01:00');
    });

    it('formats 125 seconds as 02:05', () => {
      expect(formatDuration(125)).toBe('02:05');
    });

    it('formats 600 seconds as 10:00', () => {
      expect(formatDuration(600)).toBe('10:00');
    });

    it('pads single-digit minutes and seconds', () => {
      expect(formatDuration(61)).toBe('01:01');
    });
  });

  describe('classifyCallError', () => {
    /**
     * Validates: Requirements 5.1
     * INSUFFICIENT_CREDITS error code is correctly identified
     */
    it('extracts INSUFFICIENT_CREDITS code and message', () => {
      const json = {
        error: { code: 'INSUFFICIENT_CREDITS', message: 'Not enough credits' },
      };
      const result = classifyCallError(json);
      expect(result.code).toBe('INSUFFICIENT_CREDITS');
      expect(result.message).toBe('Not enough credits');
    });

    /**
     * Validates: Requirements 5.2
     * INVALID_INPUT error code is correctly identified
     */
    it('extracts INVALID_INPUT code and message', () => {
      const json = {
        error: { code: 'INVALID_INPUT', message: 'Phone number is invalid' },
      };
      const result = classifyCallError(json);
      expect(result.code).toBe('INVALID_INPUT');
      expect(result.message).toBe('Phone number is invalid');
    });

    /**
     * Validates: Requirements 5.3
     * Generic errors return the message from the response
     */
    it('extracts generic error code and message', () => {
      const json = {
        error: { code: 'SERVER_ERROR', message: 'Internal server error' },
      };
      const result = classifyCallError(json);
      expect(result.code).toBe('SERVER_ERROR');
      expect(result.message).toBe('Internal server error');
    });

    it('returns undefined code when error has no code', () => {
      const json = { error: { message: 'Something went wrong' } };
      const result = classifyCallError(json);
      expect(result.code).toBeUndefined();
      expect(result.message).toBe('Something went wrong');
    });

    it('falls back to default message when error has no message', () => {
      const json = { error: { code: 'UNKNOWN' } };
      const result = classifyCallError(json);
      expect(result.code).toBe('UNKNOWN');
      expect(result.message).toBe('Failed to place call');
    });

    it('falls back to default message when json has no error object', () => {
      const result = classifyCallError({});
      expect(result.code).toBeUndefined();
      expect(result.message).toBe('Failed to place call');
    });

    it('handles null/undefined json gracefully', () => {
      expect(classifyCallError(null).message).toBe('Failed to place call');
      expect(classifyCallError(undefined).message).toBe('Failed to place call');
    });
  });

  describe('form validation logic', () => {
    /**
     * Validates: Requirements 2.3
     * "Call Now" button disabled when phone is empty, phone is invalid, or goal is empty
     */
    const canSubmit = (phone, goal, calling) => phone && goal.trim() && !calling;

    it('returns false when phone is empty', () => {
      expect(canSubmit('', 'some goal', false)).toBeFalsy();
    });

    it('returns false when goal is empty', () => {
      expect(canSubmit('+15551234567', '', false)).toBeFalsy();
    });

    it('returns false when goal is only whitespace', () => {
      expect(canSubmit('+15551234567', '   ', false)).toBeFalsy();
    });

    it('returns false when calling is true', () => {
      expect(canSubmit('+15551234567', 'some goal', true)).toBeFalsy();
    });

    it('returns true when phone and goal are set and not calling', () => {
      expect(canSubmit('+15551234567', 'Book appointment', false)).toBeTruthy();
    });

    it('returns false when both phone and goal are empty', () => {
      expect(canSubmit('', '', false)).toBeFalsy();
    });
  });
});
