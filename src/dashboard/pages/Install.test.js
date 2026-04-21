import { describe, it, expect } from 'vitest';
import {
  formatKeyStatus,
  formatKeyPrefix,
  buildCopyToast,
  skillFileFallback,
  isGenerateDisabled,
  generateButtonLabel,
} from './install-utils.js';

describe('Install page utilities', () => {
  describe('formatKeyStatus', () => {
    /**
     * Validates: Requirements 16.2
     * Existing keys display their active/revoked status
     */
    it('returns "Active" for an active key', () => {
      expect(formatKeyStatus({ is_active: true })).toBe('Active');
    });

    it('returns "Active" for is_active = 1 (truthy integer)', () => {
      expect(formatKeyStatus({ is_active: 1 })).toBe('Active');
    });

    it('returns "Revoked" for an inactive key', () => {
      expect(formatKeyStatus({ is_active: false })).toBe('Revoked');
    });

    it('returns "Revoked" for is_active = 0', () => {
      expect(formatKeyStatus({ is_active: 0 })).toBe('Revoked');
    });

    it('returns "Revoked" for null key', () => {
      expect(formatKeyStatus(null)).toBe('Revoked');
    });

    it('returns "Revoked" for undefined key', () => {
      expect(formatKeyStatus(undefined)).toBe('Revoked');
    });
  });

  describe('formatKeyPrefix', () => {
    /**
     * Validates: Requirements 16.2
     * Existing keys display with their prefix and ellipsis
     */
    it('formats key prefix with ellipsis', () => {
      expect(formatKeyPrefix({ key_prefix: 'oc_abc123' })).toBe('oc_abc123…');
    });

    it('returns empty string for null key', () => {
      expect(formatKeyPrefix(null)).toBe('');
    });

    it('returns empty string for undefined key', () => {
      expect(formatKeyPrefix(undefined)).toBe('');
    });

    it('returns empty string when key_prefix is empty', () => {
      expect(formatKeyPrefix({ key_prefix: '' })).toBe('');
    });
  });

  describe('buildCopyToast', () => {
    /**
     * Validates: Requirements 16.3, 17.3
     * Copy button shows success/failure toast
     */
    it('returns success toast with label when copy succeeds', () => {
      const result = buildCopyToast(true, 'API key');
      expect(result.message).toBe('API key copied');
      expect(result.type).toBe('success');
    });

    it('returns success toast for skill file copy', () => {
      const result = buildCopyToast(true, 'Skill file');
      expect(result.message).toBe('Skill file copied');
      expect(result.type).toBe('success');
    });

    it('returns error toast when copy fails', () => {
      const result = buildCopyToast(false, 'API key');
      expect(result.message).toBe('Copy failed');
      expect(result.type).toBe('error');
    });

    it('returns error toast regardless of label when copy fails', () => {
      const result = buildCopyToast(false, 'Skill file');
      expect(result.message).toBe('Copy failed');
      expect(result.type).toBe('error');
    });
  });

  describe('skillFileFallback', () => {
    /**
     * Validates: Requirements 17.2
     * Skill file displays fallback content on load failure
     */
    it('returns the fallback comment string', () => {
      expect(skillFileFallback()).toBe('// Could not load skill file');
    });
  });

  describe('generateButtonLabel', () => {
    /**
     * Validates: Requirements 16.2
     * Generate button shows appropriate label based on state
     */
    it('returns "Generate Setup Key" when not generating', () => {
      expect(generateButtonLabel(false)).toBe('Generate Setup Key');
    });

    it('returns "Generating…" when generating', () => {
      expect(generateButtonLabel(true)).toBe('Generating…');
    });
  });

  describe('isGenerateDisabled', () => {
    /**
     * Validates: Requirements 16.2
     * Generate button is disabled while a key generation request is in flight
     */
    it('returns true when generating', () => {
      expect(isGenerateDisabled(true)).toBe(true);
    });

    it('returns false when not generating', () => {
      expect(isGenerateDisabled(false)).toBe(false);
    });

    it('returns false for falsy values', () => {
      expect(isGenerateDisabled(null)).toBe(false);
      expect(isGenerateDisabled(undefined)).toBe(false);
      expect(isGenerateDisabled(0)).toBe(false);
    });
  });
});
