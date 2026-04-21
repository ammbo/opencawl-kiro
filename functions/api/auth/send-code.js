import { isValidE164, parseBody } from '../../lib/validation.js';

/**
 * POST /api/auth/send-code
 * Sends an OTP verification code via Twilio Verify API.
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

  // Call Twilio Verify API to send OTP
  const twilioUrl = `https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/Verifications`;
  const credentials = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);

  try {
    const twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phone, Channel: 'sms' }),
    });

    if (!twilioRes.ok) {
      const errorBody = await twilioRes.text();
      console.error('Twilio Verify error:', twilioRes.status, errorBody);
      return new Response(
        JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Failed to send verification code' } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
  } catch (err) {
    console.error('Twilio fetch error:', err);
    return new Response(
      JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Failed to send verification code' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}
