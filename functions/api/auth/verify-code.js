import { isValidE164, parseBody } from '../../lib/validation.js';
import { signJWT } from '../../lib/jwt.js';

/**
 * POST /api/auth/verify-code
 * Verifies OTP via Twilio, creates/retrieves user, generates JWT session.
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  // Parse and validate request body
  const parsed = await parseBody(request, ['phone', 'code']);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: { code: 'INVALID_INPUT', message: parsed.error } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { phone, code } = parsed.data;

  if (!isValidE164(phone)) {
    return new Response(
      JSON.stringify({ error: { code: 'INVALID_INPUT', message: 'Invalid phone number format' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Verify OTP via Twilio Verify API
  const twilioUrl = `https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`;
  const credentials = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);

  let verificationStatus;
  try {
    const twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phone, Code: code }),
    });

    if (!twilioRes.ok) {
      const errorBody = await twilioRes.text();
      console.error('Twilio VerificationCheck error:', twilioRes.status, errorBody);
      return new Response(
        JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired verification code' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const twilioData = await twilioRes.json();
    verificationStatus = twilioData.status;
  } catch (err) {
    console.error('Twilio fetch error:', err);
    return new Response(
      JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Verification service unavailable' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (verificationStatus !== 'approved') {
    return new Response(
      JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired verification code' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Look up or create user
  let user = await env.DB.prepare('SELECT * FROM users WHERE phone = ?')
    .bind(phone)
    .first();

  const now = new Date().toISOString();

  if (!user) {
    // Auto-create new user with Free_Tier, 250 credits, null voice_id
    const userId = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO users (id, phone, plan, credits_balance, voice_id, is_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(userId, phone, 'free', 250, null, 0, now, now)
      .run();

    user = {
      id: userId,
      phone,
      plan: 'free',
      credits_balance: 250,
      voice_id: null,
      is_admin: 0,
      created_at: now,
      updated_at: now,
    };
  }

  // Generate JWT (24h expiry)
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 86400;
  const jwt = await signJWT({ sub: user.id, iat, exp }, env.JWT_SECRET);

  // Hash the JWT and store session
  const tokenHashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(jwt),
  );
  const tokenHash = Array.from(new Uint8Array(tokenHashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(exp * 1000).toISOString();

  await env.DB.prepare(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(sessionId, user.id, tokenHash, expiresAt, now)
    .run();

  // Build user profile response
  const profile = {
    id: user.id,
    phone: user.phone,
    plan: user.plan,
    credits_balance: user.credits_balance,
    voice_id: user.voice_id,
  };

  return new Response(JSON.stringify({ success: true, user: profile }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `session=${jwt}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`,
    },
  });
}
