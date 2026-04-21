import { validateOverrideFields } from '../../lib/agent-overrides.js';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * POST /api/phone/agent-config
 * Partial update of the user's default agent configuration.
 * Only provided fields are overwritten; omitted fields retain their values.
 */
export async function onRequestPost(context) {
  const user = context.data.user;
  const db = context.env.DB;

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json(
      { error: { code: 'INVALID_INPUT', message: 'Invalid JSON body' } },
      400,
    );
  }

  const { system_prompt, voice_id, first_message } = body;

  // Collect only the fields that were explicitly provided
  const fields = {};
  if (system_prompt !== undefined) fields.system_prompt = system_prompt;
  if (voice_id !== undefined) fields.voice_id = voice_id;
  if (first_message !== undefined) fields.first_message = first_message;

  if (Object.keys(fields).length === 0) {
    return json(
      { error: { code: 'INVALID_INPUT', message: 'No fields provided' } },
      400,
    );
  }

  // Validate length constraints
  const validation = validateOverrideFields(fields);
  if (!validation.valid) {
    return json(
      { error: { code: 'INVALID_INPUT', message: validation.error } },
      400,
    );
  }

  // Build dynamic UPDATE SQL for only the provided fields
  const setClauses = [];
  const values = [];
  for (const [key, value] of Object.entries(fields)) {
    setClauses.push(`${key} = ?`);
    values.push(value);
  }
  values.push(user.id);

  const sql = `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`;
  await db.prepare(sql).bind(...values).run();

  return json({ success: true });
}

/**
 * GET /api/phone/agent-config
 * Returns the user's stored agent configuration.
 */
export async function onRequestGet(context) {
  const user = context.data.user;
  const db = context.env.DB;

  const row = await db
    .prepare('SELECT system_prompt, voice_id, first_message FROM users WHERE id = ?')
    .bind(user.id)
    .first();

  return json({
    system_prompt: row?.system_prompt ?? null,
    voice_id: row?.voice_id ?? null,
    first_message: row?.first_message ?? null,
  });
}
