/**
 * Pure utility functions extracted from Onboarding for testability.
 */

/** The 4 onboarding steps in order. */
export const STEPS = ['Welcome', 'Number', 'Connect', 'Call'];

/**
 * Build the localStorage key for persisting onboarding step.
 * @param {string} userId
 * @returns {string}
 */
export function getStorageKey(userId) {
  return `onboarding_step_${userId}`;
}

/**
 * Resolve the initial step from a raw localStorage value.
 * Returns a number in [1, 4], defaulting to 1 for missing/invalid values.
 * @param {string|null} raw — the raw string from localStorage.getItem()
 * @returns {number}
 */
export function resolveInitialStep(raw) {
  const parsed = raw ? parseInt(raw, 10) : 1;
  return parsed >= 1 && parsed <= 4 ? parsed : 1;
}

/**
 * Clamp the next step value so it never exceeds the max step.
 * @param {number} current
 * @returns {number}
 */
export function nextStep(current) {
  return Math.min(current + 1, 4);
}
