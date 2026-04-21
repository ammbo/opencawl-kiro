/**
 * Pure utility functions extracted from InboundConfig for testability.
 */

/**
 * Determine whether a user is on a paid plan.
 * @param {{ plan?: string } | null | undefined} user
 * @returns {boolean}
 */
export function isPaidUser(user) {
  return !!(user?.plan && user.plan !== 'free');
}

/**
 * Build the request body for saving agent configuration.
 * Omits voice_id when empty so the backend keeps the existing value.
 */
export function buildSaveConfigBody(systemPrompt, firstMessage, voiceId) {
  return {
    system_prompt: systemPrompt,
    first_message: firstMessage,
    voice_id: voiceId || undefined,
  };
}

/**
 * Build the request body for adding an accepted number.
 * Omits label when empty.
 */
export function buildAddNumberBody(phone, label) {
  return {
    numbers: [{ phone_number: phone, label: label || undefined }],
  };
}

/**
 * Build the request body for removing an accepted number.
 */
export function buildRemoveNumberBody(phoneNumber) {
  return { phone_numbers: [phoneNumber] };
}

/**
 * Populate form state from an agent-config API response.
 * Returns safe defaults for missing fields.
 */
export function parseAgentConfig(data) {
  return {
    systemPrompt: data?.system_prompt || '',
    firstMessage: data?.first_message || '',
    voiceId: data?.voice_id || '',
  };
}
