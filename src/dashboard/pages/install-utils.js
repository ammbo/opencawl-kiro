/**
 * Pure utility functions extracted from Install page for testability.
 */

/**
 * Format a key's status label.
 * @param {{ is_active: boolean | number }} key
 * @returns {string}
 */
export function formatKeyStatus(key) {
  return key?.is_active ? 'Active' : 'Revoked';
}

/**
 * Format a key's display text using its prefix.
 * @param {{ key_prefix: string }} key
 * @returns {string}
 */
export function formatKeyPrefix(key) {
  return key?.key_prefix ? `${key.key_prefix}…` : '';
}

/**
 * Build the copy-to-clipboard success/failure toast arguments.
 * @param {boolean} success — whether the clipboard write succeeded
 * @param {string} label — human-readable label for the copied item
 * @returns {{ message: string, type: 'success' | 'error' }}
 */
export function buildCopyToast(success, label) {
  return success
    ? { message: `${label} copied`, type: 'success' }
    : { message: 'Copy failed', type: 'error' };
}

/**
 * Determine the fallback content when the skill file fails to load.
 * @returns {string}
 */
export function skillFileFallback() {
  return '// Could not load skill file';
}

/**
 * Determine whether the "Generate Setup Key" button should be disabled.
 * @param {boolean} generating — whether a key generation request is in flight
 * @returns {boolean}
 */
export function isGenerateDisabled(generating) {
  return !!generating;
}

/**
 * Get the label for the generate button based on current state.
 * @param {boolean} generating
 * @returns {string}
 */
export function generateButtonLabel(generating) {
  return generating ? 'Generating…' : 'Generate Setup Key';
}
