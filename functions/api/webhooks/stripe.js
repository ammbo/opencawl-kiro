/**
 * POST /api/webhooks/stripe
 * Handles Stripe webhook events for subscription billing.
 * Verifies signature via crypto.subtle HMAC-SHA256, processes events idempotently,
 * and always returns 200 to Stripe to prevent retry storms.
 */

import { verifyStripeSignature } from '../../lib/webhooks.js';

/**
 * Builds the price-to-plan map from env vars.
 * Supports both the base subscription prices and metered overage price.
 */
function buildPriceToPlan(env) {
  const map = {};
  if (env.STRIPE_PRICE_STARTER) {
    map[env.STRIPE_PRICE_STARTER] = { plan: 'starter', includedMinutes: 100 };
  }
  if (env.STRIPE_PRICE_PRO) {
    map[env.STRIPE_PRICE_PRO] = { plan: 'pro', includedMinutes: 350 };
  }
  return map;
}

/**
 * Looks up a user by their Stripe customer ID.
 */
async function getUserByStripeCustomerId(db, stripeCustomerId) {
  return db
    .prepare('SELECT * FROM users WHERE stripe_customer_id = ?')
    .bind(stripeCustomerId)
    .first();
}

/**
 * Determines the plan info from a checkout session's line items.
 */
function resolvePlanFromSession(session, priceToPlan) {
  // Try line_items first
  if (session.line_items?.data?.length > 0) {
    for (const item of session.line_items.data) {
      const priceId = item.price?.id;
      if (priceId && priceToPlan[priceId]) {
        return priceToPlan[priceId];
      }
    }
  }

  // Try subscription items
  if (session.display_items?.length > 0) {
    const priceId = session.display_items[0].price?.id;
    if (priceId && priceToPlan[priceId]) {
      return priceToPlan[priceId];
    }
  }

  return null;
}

/**
 * Handles checkout.session.completed — upgrades user plan and stores subscription ID.
 */
async function handleCheckoutCompleted(db, session, priceToPlan) {
  const customerId = session.customer;
  if (!customerId) return;

  const user = await getUserByStripeCustomerId(db, customerId);
  if (!user) {
    console.error(`[stripe-webhook] No user for customer: ${customerId}`);
    return;
  }

  const planInfo = resolvePlanFromSession(session, priceToPlan);
  if (!planInfo) {
    console.error('[stripe-webhook] Could not determine plan from checkout session');
    return;
  }

  const now = new Date().toISOString();
  await db
    .prepare('UPDATE users SET plan = ?, stripe_subscription_id = ?, updated_at = ? WHERE stripe_customer_id = ?')
    .bind(planInfo.plan, session.subscription || null, now, customerId)
    .run();
}

/**
 * Handles customer.subscription.updated — syncs plan status.
 */
async function handleSubscriptionUpdated(db, subscription, priceToPlan) {
  const customerId = subscription.customer;
  if (!customerId) return;

  const user = await getUserByStripeCustomerId(db, customerId);
  if (!user) return;

  let newPlan = user.plan;
  if (subscription.items?.data?.length > 0) {
    for (const item of subscription.items.data) {
      const priceId = item.price?.id;
      if (priceId && priceToPlan[priceId]) {
        newPlan = priceToPlan[priceId].plan;
        break;
      }
    }
  }

  if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
    newPlan = 'free';
  }

  const now = new Date().toISOString();
  await db
    .prepare('UPDATE users SET plan = ?, updated_at = ? WHERE stripe_customer_id = ?')
    .bind(newPlan, now, customerId)
    .run();
}

/**
 * Handles customer.subscription.deleted — downgrades to free tier.
 */
async function handleSubscriptionDeleted(db, subscription) {
  const customerId = subscription.customer;
  if (!customerId) return;

  const now = new Date().toISOString();
  await db
    .prepare("UPDATE users SET plan = 'free', stripe_subscription_id = NULL, updated_at = ? WHERE stripe_customer_id = ?")
    .bind(now, customerId)
    .run();
}

/**
 * Handles invoice.payment_succeeded — resets monthly included minutes.
 * This fires each billing cycle, so we reset the user's monthly usage counter.
 */
async function handleInvoicePaymentSucceeded(db, invoice) {
  const customerId = invoice.customer;
  if (!customerId) return;

  // Only reset on subscription invoices (not one-time)
  if (!invoice.subscription) return;

  const now = new Date().toISOString();
  await db
    .prepare('UPDATE users SET period_minutes_used = 0, current_period_start = ?, updated_at = ? WHERE stripe_customer_id = ?')
    .bind(now, now, customerId)
    .run();
}

export async function onRequestPost(context) {
  const { env } = context;
  const db = env.DB;
  const priceToPlan = buildPriceToPlan(env);

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    const body = await context.request.text();
    const signatureHeader = context.request.headers.get('Stripe-Signature');
    if (!signatureHeader) {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Missing Stripe-Signature header' } }, 401);
    }

    const { valid, event } = await verifyStripeSignature(body, signatureHeader, env.STRIPE_WEBHOOK_SECRET);
    if (!valid || !event) {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Invalid webhook signature' } }, 401);
    }

    const eventType = event.type;
    const dataObject = event.data?.object;

    if (!eventType || !dataObject) {
      return json({ received: true });
    }

    switch (eventType) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(db, dataObject, priceToPlan);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(db, dataObject, priceToPlan);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(db, dataObject);
        break;
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(db, dataObject);
        break;
      default:
        break;
    }

    return json({ received: true });
  } catch (err) {
    console.error('[stripe-webhook] Internal error:', err.message || err);
    return json({ received: true });
  }
}
