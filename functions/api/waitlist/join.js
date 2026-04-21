import { isValidE164, parseBody } from '../../lib/validation.js';

/**
 * POST /api/waitlist/join
 * Adds a phone number to the waitlist with pending status.
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  // Parse and validate request body
  const parsed = await parseBody(request, ['phone']);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: { code: 'INVALID_INPUT', message: parsed.error } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { phone } = parsed.data;

  if (!isValidE164(phone)) {
    return new Response(
      JSON.stringify({ error: { code: 'INVALID_INPUT', message: 'Invalid phone number format. Must be E.164 (e.g. +15551234567)' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Check if phone already exists in waitlist
  const existing = await env.DB.prepare('SELECT * FROM waitlist WHERE phone = ?')
    .bind(phone)
    .first();

  if (existing) {
    return new Response(
      JSON.stringify({ error: { code: 'CONFLICT', message: 'This phone number is already on the waitlist' } }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Insert into waitlist with pending status
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await env.DB.prepare(
    'INSERT INTO waitlist (id, phone, status, created_at) VALUES (?, ?, ?, ?)',
  )
    .bind(id, phone, 'pending', createdAt)
    .run();

  return new Response(
    JSON.stringify({ success: true, message: "You've been added to the waitlist" }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}
