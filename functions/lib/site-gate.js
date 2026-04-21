/**
 * Site-gate check: verifies a phone number is approved or has a valid invite code.
 *
 * @param {D1Database} db - Cloudflare D1 database binding
 * @param {string} phone - E.164 phone number to check
 * @returns {Promise<{ approved: boolean }>}
 */
export async function checkSiteGate(db, phone) {
  const row = await db.prepare(
    "SELECT * FROM waitlist WHERE phone = ? AND (status = 'approved' OR invite_code IS NOT NULL)",
  )
    .bind(phone)
    .first();

  return { approved: !!row };
}
