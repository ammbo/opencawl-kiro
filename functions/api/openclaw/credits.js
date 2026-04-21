/**
 * GET /api/openclaw/credits
 * Returns the current credit balance for the authenticated user.
 *
 * Auth: Bearer token (handled by middleware — user in context.data.user).
 */

export async function onRequestGet(context) {
  const user = context.data.user;

  return new Response(
    JSON.stringify({ credits_balance: user.credits_balance }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
