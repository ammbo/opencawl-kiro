import { isValidE164 } from '../../lib/validation.js';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * Plan gate — returns a 403 response if the user is on the free plan.
 * @returns {Response|null} 403 response or null if allowed
 */
function checkPaidPlan(user) {
  if (user.plan === 'free') {
    return json(
      { error: { code: 'FORBIDDEN', message: 'This feature requires a paid plan' } },
      403,
    );
  }
  return null;
}

/**
 * GET /api/phone/accepted-numbers
 * Returns all accepted numbers for the authenticated user.
 */
export async function onRequestGet(context) {
  const user = context.data.user;
  const gate = checkPaidPlan(user);
  if (gate) return gate;

  const db = context.env.DB;
  const { results } = await db
    .prepare('SELECT phone_number, label, created_at FROM accepted_numbers WHERE user_id = ?')
    .bind(user.id)
    .all();

  return json({ numbers: results ?? [] });
}

/**
 * POST /api/phone/accepted-numbers
 * Adds one or more E.164 phone numbers with optional labels.
 */
export async function onRequestPost(context) {
  const user = context.data.user;
  const gate = checkPaidPlan(user);
  if (gate) return gate;

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json(
      { error: { code: 'INVALID_INPUT', message: 'Invalid JSON body' } },
      400,
    );
  }

  const { numbers } = body;
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return json(
      { error: { code: 'INVALID_INPUT', message: 'numbers must be a non-empty array' } },
      400,
    );
  }

  // Validate all phone numbers first
  for (const entry of numbers) {
    if (!isValidE164(entry.phone_number)) {
      return json(
        { error: { code: 'INVALID_INPUT', message: 'One or more phone numbers are not valid E.164 format' } },
        400,
      );
    }
  }

  const db = context.env.DB;
  const now = new Date().toISOString();
  let added = 0;

  for (const entry of numbers) {
    const id = crypto.randomUUID();
    try {
      await db
        .prepare(
          'INSERT INTO accepted_numbers (id, user_id, phone_number, label, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(id, user.id, entry.phone_number, entry.label ?? null, now)
        .run();
      added++;
    } catch (err) {
      // UNIQUE constraint violation — skip duplicates gracefully
      if (err.message && err.message.includes('UNIQUE')) {
        continue;
      }
      throw err;
    }
  }

  return json({ success: true, added });
}

/**
 * DELETE /api/phone/accepted-numbers
 * Removes specified phone numbers from the user's accepted list.
 */
export async function onRequestDelete(context) {
  const user = context.data.user;
  const gate = checkPaidPlan(user);
  if (gate) return gate;

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json(
      { error: { code: 'INVALID_INPUT', message: 'Invalid JSON body' } },
      400,
    );
  }

  const { phone_numbers } = body;
  if (!Array.isArray(phone_numbers) || phone_numbers.length === 0) {
    return json(
      { error: { code: 'INVALID_INPUT', message: 'phone_numbers must be a non-empty array' } },
      400,
    );
  }

  const db = context.env.DB;
  const placeholders = phone_numbers.map(() => '?').join(', ');
  const sql = `DELETE FROM accepted_numbers WHERE user_id = ? AND phone_number IN (${placeholders})`;

  const result = await db
    .prepare(sql)
    .bind(user.id, ...phone_numbers)
    .run();

  return json({ success: true, removed: result.meta?.changes ?? 0 });
}
