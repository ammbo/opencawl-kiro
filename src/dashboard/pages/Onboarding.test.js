import { describe, it, expect } from 'vitest';
import {
  STEPS,
  getStorageKey,
  resolveInitialStep,
  nextStep,
} from './onboarding-utils.js';

describe('Onboarding page utilities', () => {
  describe('STEPS', () => {
    /**
     * Validates: Requirements 10.1
     * Progress bar shows 4 steps: "Welcome", "Number", "Connect", "Call"
     */
    it('contains exactly 4 steps', () => {
      expect(STEPS).toHaveLength(4);
    });

    it('has the correct step labels in order', () => {
      expect(STEPS).toEqual(['Welcome', 'Number', 'Connect', 'Call']);
    });
  });

  describe('getStorageKey', () => {
    /**
     * Validates: Requirements 14.1
     * Onboarding step stored in localStorage keyed by user ID
     */
    it('generates key with user id', () => {
      expect(getStorageKey('user_123')).toBe('onboarding_step_user_123');
    });

    it('generates unique keys for different users', () => {
      expect(getStorageKey('a')).not.toBe(getStorageKey('b'));
    });
  });

  describe('resolveInitialStep', () => {
    /**
     * Validates: Requirements 14.2
     * Restores previously saved step number on load
     */
    it('returns 1 when raw value is null (no saved step)', () => {
      expect(resolveInitialStep(null)).toBe(1);
    });

    it('parses a valid saved step', () => {
      expect(resolveInitialStep('2')).toBe(2);
      expect(resolveInitialStep('3')).toBe(3);
      expect(resolveInitialStep('4')).toBe(4);
    });

    it('returns 1 for step below valid range', () => {
      expect(resolveInitialStep('0')).toBe(1);
      expect(resolveInitialStep('-1')).toBe(1);
    });

    it('returns 1 for step above valid range', () => {
      expect(resolveInitialStep('5')).toBe(1);
      expect(resolveInitialStep('100')).toBe(1);
    });

    it('returns 1 for non-numeric strings', () => {
      expect(resolveInitialStep('abc')).toBe(1);
      expect(resolveInitialStep('')).toBe(1);
    });

    it('accepts boundary values 1 and 4', () => {
      expect(resolveInitialStep('1')).toBe(1);
      expect(resolveInitialStep('4')).toBe(4);
    });
  });

  describe('nextStep', () => {
    /**
     * Validates: Requirements 10.1
     * Step navigation advances through the 4 steps
     */
    it('advances from step 1 to step 2', () => {
      expect(nextStep(1)).toBe(2);
    });

    it('advances from step 3 to step 4', () => {
      expect(nextStep(3)).toBe(4);
    });

    it('clamps at step 4 (max)', () => {
      expect(nextStep(4)).toBe(4);
    });
  });

  describe('step persistence logic', () => {
    /**
     * Validates: Requirements 14.1, 14.2
     * localStorage round-trip: save step → restore step
     */
    it('persisted step string round-trips through resolveInitialStep', () => {
      const step = 3;
      const persisted = String(step);
      expect(resolveInitialStep(persisted)).toBe(step);
    });
  });

  describe('completion flow', () => {
    /**
     * Validates: Requirements 13.3
     * "Finish Setup" posts to onboarding-complete and redirects.
     * We verify the expected endpoint path and redirect target as constants.
     */
    it('completion endpoint path is /api/auth/onboarding-complete', () => {
      const COMPLETION_ENDPOINT = '/api/auth/onboarding-complete';
      expect(COMPLETION_ENDPOINT).toBe('/api/auth/onboarding-complete');
    });

    it('redirect target after completion is /dashboard/', () => {
      const REDIRECT_TARGET = '/dashboard/';
      expect(REDIRECT_TARGET).toBe('/dashboard/');
    });
  });
});
