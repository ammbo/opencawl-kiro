/**
 * Pure logic helpers for inbound call routing.
 * Classifies callers and builds TwiML responses for each routing path.
 */

/**
 * Classifies an inbound caller.
 *
 * @param {string} callerNumber - The caller's phone number
 * @param {{ phone?: string }} owner - The owner of the called number
 * @param {boolean} isSharedNumber - Whether the called number is a shared number
 * @returns {'owner' | 'unknown_shared' | 'unknown_dedicated'}
 */
export function classifyCaller(callerNumber, owner, isSharedNumber) {
  if (owner && owner.phone && callerNumber === owner.phone) {
    return 'owner';
  }
  if (isSharedNumber) {
    return 'unknown_shared';
  }
  return 'unknown_dedicated';
}

/**
 * Escapes a string for safe inclusion in XML content.
 * @param {string} str
 * @returns {string}
 */
function escapeXml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Dispatch-oriented system prompt for owner calls.
 * Instructs the ElevenLabs agent to listen for task instructions and use the dispatch_call tool.
 */
export const OWNER_DISPATCH_SYSTEM_PROMPT = `You are the user's AI phone assistant. Listen to their instruction.
If they want you to make a call on their behalf, use the dispatch_call tool
with the destination phone number and the goal/task description.
Confirm the dispatch to the user before hanging up.`;

/**
 * Builds TwiML for an owner call, connecting to ElevenLabs with stored agent config.
 * Passes system_prompt, voice_id, first_message as Parameter elements in the Stream.
 * Includes owner_mode: "dispatch" and the dispatch system prompt so the agent
 * can handle task dispatch instructions from the owner.
 */
function buildOwnerTwiml({ owner, agentId, callId, callerNumber }) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Response>',
    '  <Connect>',
    `    <Stream url="wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${escapeXml(agentId)}">`,
    `      <Parameter name="user_id" value="${escapeXml(owner.id)}" />`,
    `      <Parameter name="call_id" value="${escapeXml(callId)}" />`,
    `      <Parameter name="caller" value="${escapeXml(callerNumber)}" />`,
    `      <Parameter name="owner_mode" value="dispatch" />`,
    `      <Parameter name="system_prompt" value="${escapeXml(OWNER_DISPATCH_SYSTEM_PROMPT)}" />`,
  ];

  if (owner.voice_id != null) {
    lines.push(`      <Parameter name="voice_id" value="${escapeXml(owner.voice_id)}" />`);
  }
  if (owner.first_message != null) {
    lines.push(`      <Parameter name="first_message" value="${escapeXml(owner.first_message)}" />`);
  }

  lines.push('    </Stream>');
  lines.push('  </Connect>');
  lines.push('</Response>');

  return lines.join('\n');
}

/**
 * Strict system prompt for the OpenClaw promo agent on shared numbers.
 * Keeps the agent focused on OpenClaw info and sign-up — no off-topic conversations.
 */
const PROMO_SYSTEM_PROMPT = `You are the OpenClaw AI assistant. Your ONLY purpose is to tell callers about OpenClaw — the AI phone agent platform — and encourage them to sign up at openclaw.com.

Rules you MUST follow:
- ONLY discuss OpenClaw, its features, pricing, and how to sign up.
- If the caller asks about anything unrelated to OpenClaw, politely redirect: "I'm here to help you learn about OpenClaw! Is there anything about our AI phone agent platform I can help with?"
- Never pretend to be anyone else or assist with unrelated tasks.
- Keep responses concise and friendly.
- Mention that users can create their own AI phone agent, get a dedicated phone number, and customize their agent's personality.
- Direct them to openclaw.com to get started.`;

const PROMO_FIRST_MESSAGE = "Hey there! You've reached a number powered by OpenClaw — the AI phone agent platform. I can tell you all about how it works. What would you like to know?";

/**
 * Builds TwiML for unknown callers on shared numbers — connects to a promo agent
 * with a strict on-topic system prompt about OpenClaw.
 */
function buildSharedUnknownTwiml({ agentId, callerNumber }) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Response>',
    '  <Connect>',
    `    <Stream url="wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${escapeXml(agentId)}">`,
    `      <Parameter name="caller" value="${escapeXml(callerNumber)}" />`,
    `      <Parameter name="system_prompt" value="${escapeXml(PROMO_SYSTEM_PROMPT)}" />`,
    `      <Parameter name="first_message" value="${escapeXml(PROMO_FIRST_MESSAGE)}" />`,
    '    </Stream>',
    '  </Connect>',
    '</Response>',
  ];
  return lines.join('\n');
}

/**
 * Builds TwiML for accepted unknown callers on dedicated numbers.
 * Connects to the owner's agent with call history context.
 */
function buildDedicatedAcceptedTwiml({ owner, agentId, callId, callerNumber, callHistory }) {
  const previousCallCount = Array.isArray(callHistory) ? callHistory.length : 0;

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Response>',
    '  <Connect>',
    `    <Stream url="wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${escapeXml(agentId)}">`,
    `      <Parameter name="user_id" value="${escapeXml(owner.id)}" />`,
    `      <Parameter name="call_id" value="${escapeXml(callId)}" />`,
    `      <Parameter name="caller" value="${escapeXml(callerNumber)}" />`,
    `      <Parameter name="previous_call_count" value="${previousCallCount}" />`,
  ];

  if (owner.system_prompt != null) {
    lines.push(`      <Parameter name="system_prompt" value="${escapeXml(owner.system_prompt)}" />`);
  }
  if (owner.voice_id != null) {
    lines.push(`      <Parameter name="voice_id" value="${escapeXml(owner.voice_id)}" />`);
  }
  if (owner.first_message != null) {
    lines.push(`      <Parameter name="first_message" value="${escapeXml(owner.first_message)}" />`);
  }

  lines.push('    </Stream>');
  lines.push('  </Connect>');
  lines.push('</Response>');

  return lines.join('\n');
}

/**
 * Builds TwiML for rejected unknown callers on dedicated numbers.
 */
function buildDedicatedRejectedTwiml() {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Response>',
    '  <Say>This number is not currently accepting calls.</Say>',
    '  <Hangup/>',
    '</Response>',
  ].join('\n');
}

/**
 * Builds the appropriate TwiML string based on caller classification.
 *
 * @param {'owner' | 'unknown_shared' | 'unknown_dedicated'} classification
 * @param {object} opts
 * @param {{ id: string, phone?: string, system_prompt?: string, voice_id?: string, first_message?: string }} opts.owner
 * @param {string} opts.agentId - ElevenLabs agent ID
 * @param {string} opts.callId - The call record ID
 * @param {string} opts.callerNumber - The caller's phone number
 * @param {string[]} [opts.acceptedNumbers] - List of accepted phone numbers for dedicated numbers
 * @param {object[]} [opts.callHistory] - Previous calls from this caller
 * @returns {string} TwiML XML string
 */
export function buildInboundTwiml(classification, { owner, agentId, callId, callerNumber, acceptedNumbers, callHistory } = {}) {
  if (classification === 'owner') {
    return buildOwnerTwiml({ owner, agentId, callId, callerNumber });
  }

  if (classification === 'unknown_shared') {
    return buildSharedUnknownTwiml({ agentId, callerNumber });
  }

  if (classification === 'unknown_dedicated') {
    // If accepted list is empty → open access (accept all)
    // If non-empty and caller in list → accept
    // If non-empty and caller not in list → reject
    const accepted = Array.isArray(acceptedNumbers) ? acceptedNumbers : [];
    const isOpenAccess = accepted.length === 0;
    const isAccepted = accepted.includes(callerNumber);

    if (isOpenAccess || isAccepted) {
      return buildDedicatedAcceptedTwiml({ owner, agentId, callId, callerNumber, callHistory });
    }
    return buildDedicatedRejectedTwiml();
  }

  // Fallback — should not happen
  return buildDedicatedRejectedTwiml();
}
