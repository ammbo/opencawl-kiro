/**
 * GET /api/admin/shared-numbers — list all shared phone numbers
 * POST /api/admin/shared-numbers — add a number to the shared pool
 */

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function onRequestGet(context) {
  const db = context.env.DB;
  try {
    const { results } = await db
      .prepare('SELECT * FROM shared_phone_numbers ORDER BY created_at DESC')
      .all();
    return json({ numbers: results });
  } catch {
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list shared numbers' } }, 500);
  }
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  try {
    const { phone_number } = await context.request.json();
    if (!phone_number || !/^\+\d{10,15}$/.test(phone_number)) {
      return json({ error: { code: 'INVALID_INPUT', message: 'Valid E.164 phone_number required' } }, 400);
    }

    const existing = await db
      .prepare('SELECT phone_number FROM shared_phone_numbers WHERE phone_number = ?')
      .bind(phone_number)
      .first();

    if (existing) {
      return json({ error: { code: 'CONFLICT', message: 'Number already in pool' } }, 409);
    }

    await db
      .prepare('INSERT INTO shared_phone_numbers (phone_number) VALUES (?)')
      .bind(phone_number)
      .run();

    return json({ success: true, phone_number });
  } catch {
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to add shared number' } }, 500);
  }
}
