/**
 * POST /api/auth/onboarding-complete
 * Marks the authenticated user's onboarding as completed.
 */
export async function onRequestPost(context) {
  const user = context.data.user;
  await context.env.DB
    .prepare('UPDATE users SET onboarding_completed = 1 WHERE id = ?')
    .bind(user.id)
    .run();
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
