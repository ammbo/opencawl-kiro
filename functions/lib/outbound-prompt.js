/**
 * Generates a tailored system prompt and first message for outbound calls
 * using Cloudflare Workers AI.
 *
 * Instead of treating outbound calls as message relays, this generates
 * prompts that make the agent behave as an autonomous conversational agent
 * acting on behalf of the user.
 */

const META_PROMPT = `You are a prompt engineer for an AI phone agent platform called OpenCawl. Users dispatch "Claws" (AI phone agents) to make outbound calls on their behalf.

Given a user's GOAL for an outbound call, generate two things:

1. **system_prompt**: A system prompt for the AI agent making the call. The agent should:
   - Act as an autonomous agent, NOT a message relay
   - Be conversational and natural — like a real person calling
   - Pursue the goal proactively without waiting to be asked
   - Never mention being an AI, OpenCawl, or "your user" to the call recipient
   - Never ask the recipient if they want to "leave a message" or "relay a message"
   - Speak as if it has its own reason for calling (on behalf of the user, but without saying so awkwardly)
   - Be warm, friendly, and human-sounding
   - Wrap up the call naturally once the goal is achieved

2. **first_message**: The opening line the agent says when the recipient picks up. This should:
   - Be a natural greeting that fits the goal
   - If a person's name is mentioned in the goal, greet them by name (e.g. "Hi, is this Tom?")
   - If no name is given, use a generic friendly opener (e.g. "Hi there!")
   - Be brief — just a greeting, not the whole pitch
   - Never mention relaying a message or being an AI

Respond in JSON only, no markdown:
{"system_prompt": "...", "first_message": "..."}`;

/**
 * Generate an outbound call system prompt and first message from a goal.
 *
 * @param {object} ai - Cloudflare Workers AI binding
 * @param {string} goal - The user's goal for the call (e.g. "Wish Tom a happy birthday")
 * @returns {Promise<{ system_prompt: string, first_message: string }>}
 */
export async function generateOutboundPrompt(ai, goal) {
  try {
    const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: META_PROMPT },
        { role: 'user', content: `GOAL: ${goal}` },
      ],
      max_tokens: 512,
      temperature: 0.7,
    });

    const text = (response.response || '').trim();

    // Try to parse JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.system_prompt && parsed.first_message) {
        return {
          system_prompt: parsed.system_prompt,
          first_message: parsed.first_message,
        };
      }
    }
  } catch (err) {
    console.error('[outbound-prompt] LLM generation failed, using fallback:', err.message || err);
  }

  // Fallback: build a reasonable prompt without LLM
  return buildFallbackPrompt(goal);
}

/**
 * Deterministic fallback when the LLM call fails.
 * Extracts a name from the goal if possible and builds a sensible prompt.
 */
export function buildFallbackPrompt(goal) {
  // Try to extract a name from common patterns
  const nameMatch = goal.match(
    /(?:call|tell|ask|remind|wish|contact|reach|speak (?:to|with)|talk (?:to|with))\s+([A-Z][a-z]+)/i,
  );
  const name = nameMatch ? nameMatch[1] : null;

  const first_message = name ? `Hi, is this ${name}?` : 'Hi there!';

  const system_prompt = `You are making a phone call on someone's behalf. Be conversational, warm, and natural — like a real person calling. Do NOT mention being an AI or relaying a message. Do NOT ask if they want to leave a message. You are calling with a specific purpose and should pursue it proactively.

Your goal for this call: ${goal}

Guidelines:
- Act autonomously — you know why you're calling and should drive the conversation
- Be friendly and natural, as if you personally have a reason to call
- Once your goal is achieved, wrap up the call politely
- If the person seems confused about who you are, just say you're calling on behalf of a friend
- Never break character or mention AI, agents, or technology`;

  return { system_prompt, first_message };
}
