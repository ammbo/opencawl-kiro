/**
 * GET /api/auth/me
 * Returns the authenticated user's profile.
 * User is already set by middleware via context.data.user.
 */
export async function onRequestGet(context) {
  const user = context.data.user;

  // Check admin status from env
  const adminPhones = (context.env.ADMIN_PHONE_NUMBERS || '').split(',').map((p) => p.trim());
  const isAdmin = user.is_admin === 1 || adminPhones.includes(user.phone);

  const profile = {
    id: user.id,
    phone: user.phone,
    plan: user.plan,
    credits_balance: user.credits_balance,
    voice_id: user.voice_id,
    voice_name: user.voice_name || null,
    twilio_phone_number: user.twilio_phone_number || null,
    stripe_customer_id: user.stripe_customer_id || null,
    is_admin: isAdmin ? 1 : 0,
    created_at: user.created_at,
    onboarding_completed: user.onboarding_completed === 1,
  };

  return new Response(JSON.stringify({ user: profile }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
