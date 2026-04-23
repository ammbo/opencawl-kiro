/**
 * Pure logic helpers for building ElevenLabs outbound call payloads
 * and validating agent override fields.
 */

const MAX_SYSTEM_PROMPT_LENGTH = 10_000;
const MAX_FIRST_MESSAGE_LENGTH = 2_000;

const DEFAULT_OUTBOUND_SYSTEM_PROMPT = `You are making a phone call on someone's behalf. Be conversational, warm, and natural — like a real person calling. Do NOT mention being an AI, an agent, or relaying a message. Do NOT ask if they want to leave a message. You are calling with a specific purpose and should pursue it proactively. Once your goal is achieved, wrap up the call politely.`;

export { DEFAULT_OUTBOUND_SYSTEM_PROMPT };

/**
 * Validates override field lengths.
 * @param {{ system_prompt?: string, first_message?: string }} fields
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateOverrideFields({ system_prompt, first_message } = {}) {
  if (typeof system_prompt === 'string' && system_prompt.length > MAX_SYSTEM_PROMPT_LENGTH) {
    return {
      valid: false,
      error: `system_prompt exceeds maximum length of ${MAX_SYSTEM_PROMPT_LENGTH} characters`,
    };
  }
  if (typeof first_message === 'string' && first_message.length > MAX_FIRST_MESSAGE_LENGTH) {
    return {
      valid: false,
      error: `first_message exceeds maximum length of ${MAX_FIRST_MESSAGE_LENGTH} characters`,
    };
  }
  return { valid: true };
}

/**
 * Builds the ElevenLabs outbound call payload with optional per-call overrides.
 *
 * Maps override fields to the conversation_config_override structure:
 *   system_prompt → conversation_config_override.agent.prompt.prompt
 *   voice_id      → conversation_config_override.tts.voice_id
 *   first_message → conversation_config_override.agent.first_message
 *
 * Omitted override fields are not included in the payload.
 * Falls back to user.voice_id when no voice_id override is provided.
 *
 * @param {string} agentId - ElevenLabs agent ID
 * @param {string} phoneNumberId - The ElevenLabs phone number resource ID (not the E.164 number)
 * @param {string} destinationPhone - The destination phone number (E.164)
 * @param {{ id: string, voice_id?: string }} user - The user record
 * @param {{ system_prompt?: string, voice_id?: string, first_message?: string }} overrides - Per-call overrides
 * @param {string} [message] - Optional legacy message for dynamic variables
 * @returns {object} The ElevenLabs API payload
 */
export function buildElevenLabsPayload(agentId, phoneNumberId, destinationPhone, user, overrides = {}, message) {
  const payload = {
    agent_id: agentId,
    agent_phone_number_id: phoneNumberId,
    to_number: destinationPhone,
  };

  const dynamicVars = {
    user_id: user.id,
  };

  if (message != null && message !== '') {
    dynamicVars.message = message;
  }

  // Build conversation_config_override from provided overrides
  const configOverride = {};
  let hasOverride = false;

  // Always override the system prompt — never let the ElevenLabs default through.
  // Priority: per-call system_prompt override > user's stored prompt > our default
  // If the override already contains a fully generated prompt (from LLM), use it as-is.
  // Only append the goal when falling back to a generic base prompt.
  {
    const hasGeneratedPrompt = overrides.system_prompt != null && overrides.first_message != null;
    const basePrompt = overrides.system_prompt ?? user.system_prompt ?? DEFAULT_OUTBOUND_SYSTEM_PROMPT;
    const prompt = (!hasGeneratedPrompt && message != null && message !== '')
      ? `${basePrompt}\n\nYour goal for this call: ${message}`
      : basePrompt;
    if (!configOverride.agent) configOverride.agent = {};
    configOverride.agent.prompt = { prompt };
    hasOverride = true;
  }

  if (overrides.first_message != null) {
    if (!configOverride.agent) configOverride.agent = {};
    configOverride.agent.first_message = overrides.first_message;
    hasOverride = true;
  }

  // voice_id: prefer override, fall back to user's stored voice_id
  const effectiveVoiceId = overrides.voice_id != null ? overrides.voice_id : user.voice_id;
  if (effectiveVoiceId != null) {
    configOverride.tts = { voice_id: effectiveVoiceId };
    hasOverride = true;
  }

  const clientData = { dynamic_variables: dynamicVars };
  if (hasOverride) {
    clientData.conversation_config_override = configOverride;
  }

  payload.conversation_initiation_client_data = clientData;

  return payload;
}
