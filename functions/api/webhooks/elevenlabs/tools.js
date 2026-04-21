/**
 * POST /api/webhooks/elevenlabs/tools
 *
 * STUB — Not yet implemented.
 *
 * This endpoint will handle ElevenLabs tool-call webhooks once we register
 * tools in the ElevenLabs agent configuration.
 *
 * TODO (next iteration):
 *   - Register tools in ElevenLabs agent settings (Agent → Tools → Server URL)
 *   - Design per-user tool dispatch: each customer's agent may need to call
 *     *their own* external systems, not a single central gateway. Consider
 *     storing a per-user webhook/callback URL in the users table.
 *   - Create a second webhook in ElevenLabs dashboard for tools, get its
 *     HMAC secret, and store it as ELEVENLABS_WEBHOOK_SECRET_TOOLS.
 *   - Implement signature verification using verifyElevenLabsSignature().
 *   - Define the tool schemas (e.g. dispatch-task, lookup-contact, etc.)
 */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost() {
  return json({ error: { code: 'NOT_IMPLEMENTED', message: 'Tool webhooks are not yet configured' } }, 501);
}
