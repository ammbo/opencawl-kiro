/**
 * POST /api/billing/checkout
 * Creates a Stripe Checkout session for plan upgrade.
 * Includes both the base subscription price and a metered overage price.
 * Uses raw fetch with form-encoded body — no Stripe SDK.
 */

export async function onRequestPost(context) {
  const user = context.data.user;
  const db = context.env.DB;
  const stripeKey = context.env.STRIPE_SECRET_KEY;

  const PLAN_PRICES = {
    starter: context.env.STRIPE_PRICE_STARTER,
    pro: context.env.STRIPE_PRICE_PRO,
  };

  const overagePrice = context.env.STRIPE_PRICE_OVERAGE;

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json(
      { error: { code: 'INVALID_INPUT', message: 'Invalid JSON body' } },
      400,
    );
  }

  const { plan } = body;

  if (!plan || !PLAN_PRICES[plan]) {
    return json(
      { error: { code: 'INVALID_INPUT', message: 'Plan must be "starter" or "pro"' } },
      400,
    );
  }

  try {
    let customerId = user.stripe_customer_id;

    // Create Stripe customer if user doesn't have one
    if (!customerId) {
      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          'metadata[phone]': user.phone,
          'metadata[user_id]': user.id,
        }).toString(),
      });

      if (!customerRes.ok) {
        return json(
          { error: { code: 'INTERNAL_ERROR', message: 'Failed to create Stripe customer' } },
          500,
        );
      }

      const customer = await customerRes.json();
      customerId = customer.id;

      const now = new Date().toISOString();
      await db
        .prepare('UPDATE users SET stripe_customer_id = ?, updated_at = ? WHERE id = ?')
        .bind(customerId, now, user.id)
        .run();
    }

    // Build line items: base plan + metered overage
    const origin = new URL(context.request.url).origin;
    const params = new URLSearchParams({
      'line_items[0][price]': PLAN_PRICES[plan],
      'line_items[0][quantity]': '1',
      'mode': 'subscription',
      'customer': customerId,
      'success_url': `${origin}/dashboard?checkout=success`,
      'cancel_url': `${origin}/dashboard?checkout=cancel`,
    });

    // Add metered overage price if configured
    if (overagePrice) {
      params.append('line_items[1][price]', overagePrice);
    }

    const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!sessionRes.ok) {
      return json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to create checkout session' } },
        500,
      );
    }

    const session = await sessionRes.json();
    return json({ checkout_url: session.url });
  } catch (err) {
    return json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to create checkout session' } },
      500,
    );
  }
}
