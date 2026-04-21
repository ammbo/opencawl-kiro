/**
 * POST /api/billing/portal
 * Creates a Stripe Customer Portal session for subscription management.
 * Uses raw fetch — no Stripe SDK.
 */
export async function onRequestPost(context) {
  const user = context.data.user;
  const stripeKey = context.env.STRIPE_SECRET_KEY;

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  if (!user.stripe_customer_id) {
    return json(
      { error: { code: 'INVALID_INPUT', message: 'No billing account found. Please subscribe to a plan first.' } },
      400,
    );
  }

  try {
    const origin = new URL(context.request.url).origin;
    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'customer': user.stripe_customer_id,
        'return_url': `${origin}/dashboard`,
      }).toString(),
    });

    if (!portalRes.ok) {
      return json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to create portal session' } },
        500,
      );
    }

    const session = await portalRes.json();
    return json({ portal_url: session.url });
  } catch (err) {
    return json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to create portal session' } },
      500,
    );
  }
}
