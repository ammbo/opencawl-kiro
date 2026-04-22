/**
 * Credit & Usage Engine for OpenCawl Phone Platform.
 *
 * Pricing model:
 *   Free:    250 one-time credits (12 credits = 1 min)
 *   Starter: 100 included min/mo, $0.12/min overage via Stripe metered billing
 *   Pro:     350 included min/mo, $0.12/min overage via Stripe metered billing
 *
 * Free-tier users consume from credits_balance (legacy credit pool).
 * Paid users track period_minutes_used against their included minutes.
 * Overage is reported to Stripe as usage records on the metered price.
 */

const CREDIT_RATES = {
  call: 12,   // per minute (ceil)
  sms: 2,     // per message
  intent: 1,  // per operation
};

const PLAN_INCLUDED_MINUTES = {
  free: 0,      // free uses credit pool, not minutes
  starter: 100,
  pro: 350,
};

const OVERAGE_RATE_CENTS = 12; // $0.12/min = 12 cents

/**
 * Calculates the credit cost for a given operation type and quantity.
 * @param {'call'|'sms'|'intent'} operationType
 * @param {number} quantity - minutes for calls, count for sms/intent
 * @returns {number} credit cost
 */
export function calculateCreditCost(operationType, quantity) {
  const rate = CREDIT_RATES[operationType];
  if (rate == null) {
    throw new Error(`Unknown operation type: ${operationType}`);
  }
  if (operationType === 'call') {
    return rate * Math.ceil(quantity);
  }
  return rate * quantity;
}

const MINIMUM_CALL_CREDITS = CREDIT_RATES.call; // 12

/**
 * Plan-aware call entitlement check.
 * - Free users: checks credits_balance >= MINIMUM_CALL_CREDITS (12)
 * - Paid users: always allowed (overage billed via Stripe metered billing)
 * @param {D1Database} db
 * @param {object} user - full user row (must include plan and credits_balance)
 * @returns {Promise<{ allowed: boolean, reason?: string }>}
 */
export async function checkEntitlement(db, user) {
  const plan = user?.plan || 'free';

  if (plan === 'starter' || plan === 'pro') {
    return { allowed: true };
  }

  // Free-tier: check credit balance
  const row = await db
    .prepare('SELECT credits_balance FROM users WHERE id = ?')
    .bind(user.id)
    .first();

  if (!row) {
    return { allowed: false, reason: 'User not found' };
  }

  if (row.credits_balance < MINIMUM_CALL_CREDITS) {
    return {
      allowed: false,
      reason: `Insufficient credits: ${row.credits_balance} available, ${MINIMUM_CALL_CREDITS} required`,
    };
  }

  return { allowed: true };
}

/**
 * Checks whether a user has sufficient credits for an operation.
 */
export async function check(db, userId, requiredAmount) {
  const row = await db
    .prepare('SELECT credits_balance FROM users WHERE id = ?')
    .bind(userId)
    .first();

  if (!row) return { sufficient: false, balance: 0 };

  return {
    sufficient: row.credits_balance >= requiredAmount,
    balance: row.credits_balance,
  };
}

/**
 * Atomically deducts credits from a user and logs the transaction.
 * For free-tier users only.
 */
export async function deduct(db, userId, amount, operationType, referenceId) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const results = await db.batch([
    db
      .prepare(
        'UPDATE users SET credits_balance = credits_balance - ?, updated_at = ? WHERE id = ? AND credits_balance >= ?'
      )
      .bind(amount, now, userId, amount),
    db
      .prepare(
        'INSERT INTO credit_transactions (id, user_id, amount, operation_type, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(id, userId, -amount, operationType, referenceId, now),
  ]);

  const updateResult = results[0];
  if (!updateResult.meta.changes || updateResult.meta.changes === 0) {
    return { success: false };
  }

  const row = await db
    .prepare('SELECT credits_balance FROM users WHERE id = ?')
    .bind(userId)
    .first();

  return { success: true, newBalance: row ? row.credits_balance : 0 };
}

/**
 * Atomically adds credits to a user and logs the transaction.
 */
export async function add(db, userId, amount, operationType, referenceId) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.batch([
    db
      .prepare(
        'UPDATE users SET credits_balance = credits_balance + ?, updated_at = ? WHERE id = ?'
      )
      .bind(amount, now, userId),
    db
      .prepare(
        'INSERT INTO credit_transactions (id, user_id, amount, operation_type, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(id, userId, amount, operationType, referenceId, now),
  ]);

  const row = await db
    .prepare('SELECT credits_balance FROM users WHERE id = ?')
    .bind(userId)
    .first();

  return { success: true, newBalance: row ? row.credits_balance : 0 };
}

/**
 * Records call usage for a paid user. Tracks minutes against included allowance
 * and reports overage to Stripe as a metered usage record.
 *
 * @param {D1Database} db
 * @param {object} user - full user row
 * @param {number} durationMinutes - call duration in minutes (fractional ok)
 * @param {string} referenceId - call ID for the transaction log
 * @param {object} env - environment bindings (for Stripe keys)
 * @returns {Promise<{overageMinutes: number, reported: boolean}>}
 */
export async function recordPaidUsage(db, user, durationMinutes, referenceId, env) {
  const roundedMinutes = Math.ceil(durationMinutes);
  const includedMinutes = PLAN_INCLUDED_MINUTES[user.plan] || 0;
  const currentUsed = user.period_minutes_used || 0;
  const newUsed = currentUsed + roundedMinutes;

  // Update usage counter
  const now = new Date().toISOString();
  const txId = crypto.randomUUID();

  await db.batch([
    db
      .prepare('UPDATE users SET period_minutes_used = ?, updated_at = ? WHERE id = ?')
      .bind(newUsed, now, user.id),
    db
      .prepare(
        'INSERT INTO credit_transactions (id, user_id, amount, operation_type, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(txId, user.id, -roundedMinutes, 'call_minutes', referenceId, now),
  ]);

  // Calculate overage: only the portion that exceeds included minutes
  let overageMinutes = 0;
  if (newUsed > includedMinutes) {
    // If they were already over, all new minutes are overage
    if (currentUsed >= includedMinutes) {
      overageMinutes = roundedMinutes;
    } else {
      // Only the portion that crosses the threshold
      overageMinutes = newUsed - includedMinutes;
    }
  }

  // Report overage to Stripe
  let reported = false;
  if (overageMinutes > 0 && user.stripe_subscription_id && env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_OVERAGE) {
    try {
      // Find the metered subscription item
      const subRes = await fetch(
        `https://api.stripe.com/v1/subscriptions/${user.stripe_subscription_id}`,
        {
          headers: { 'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}` },
        }
      );

      if (subRes.ok) {
        const sub = await subRes.json();
        const meteredItem = sub.items?.data?.find(
          (item) => item.price?.id === env.STRIPE_PRICE_OVERAGE
        );

        if (meteredItem) {
          const usageRes = await fetch(
            `https://api.stripe.com/v1/subscription_items/${meteredItem.id}/usage_records`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                quantity: String(overageMinutes),
                timestamp: String(Math.floor(Date.now() / 1000)),
                action: 'increment',
              }).toString(),
            }
          );
          reported = usageRes.ok;
          if (!reported) {
            console.error('[credits] Failed to report usage to Stripe:', usageRes.status);
          }
        }
      }
    } catch (err) {
      console.error('[credits] Error reporting overage to Stripe:', err.message);
    }
  }

  return { overageMinutes, reported };
}

/**
 * Retrieves credit transaction history for a user.
 */
export async function getTransactions(db, userId, limit = 50, offset = 0) {
  const { results } = await db
    .prepare(
      'SELECT * FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    )
    .bind(userId, limit, offset)
    .all();

  return results;
}

/**
 * Checks if a balance is at low or critical level.
 */
export function checkLowBalance(balance) {
  return {
    lowBalance: balance < 50,
    criticalBalance: balance < 20,
  };
}
