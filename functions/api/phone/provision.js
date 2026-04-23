/**
 * POST /api/phone/provision
 * Provisions a dedicated Twilio phone number for paid-plan users,
 * configures webhooks, and imports the number into ElevenLabs.
 * Free-tier users are assigned from a shared pool instead.
 */
export async function onRequestPost(context) {
  const user = context.data.user;
  const db = context.env.DB;
  const {
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    ELEVENLABS_API_KEY,
    ELEVENLABS_AGENT_ID,
  } = context.env;

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  // Free-tier users get a shared pool number
  if (user.plan === 'free') {
    try {
      const poolNumber = await db
        .prepare(
          'SELECT phone_number FROM shared_phone_numbers WHERE assigned_user_id IS NULL LIMIT 1',
        )
        .first();

      if (!poolNumber) {
        return json(
          { error: { code: 'NO_NUMBERS_AVAILABLE', message: 'No shared numbers available' } },
          503,
        );
      }

      const now = new Date().toISOString();
      await db
        .prepare(
          'UPDATE shared_phone_numbers SET assigned_user_id = ?, assigned_at = ? WHERE phone_number = ?',
        )
        .bind(user.id, now, poolNumber.phone_number)
        .run();

      await db
        .prepare('UPDATE users SET twilio_phone_number = ?, updated_at = ? WHERE id = ?')
        .bind(poolNumber.phone_number, now, user.id)
        .run();

      return json({ phone_number: poolNumber.phone_number, shared: true });
    } catch (err) {
      return json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to assign shared number' } },
        500,
      );
    }
  }

  // Paid users: check if already provisioned
  if (user.twilio_phone_number) {
    return json(
      { error: { code: 'CONFLICT', message: 'Phone number already provisioned' } },
      409,
    );
  }

  // Step 1: Buy a Twilio number
  const host = new URL(context.request.url).origin;
  const twilioAuth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  let twilioNumber;

  try {
    const buyParams = new URLSearchParams({
      AreaCode: '415',
      VoiceUrl: `${host}/api/webhooks/twilio/voice`,
      VoiceMethod: 'POST',
    });

    const buyRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${twilioAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: buyParams.toString(),
      },
    );

    if (!buyRes.ok) {
      const errBody = await buyRes.text();
      return json(
        { error: { code: 'TWILIO_ERROR', message: 'Failed to provision phone number from Twilio' } },
        500,
      );
    }

    const buyData = await buyRes.json();
    twilioNumber = buyData.phone_number;
  } catch (err) {
    return json(
      { error: { code: 'TWILIO_ERROR', message: 'Unable to reach Twilio API' } },
      500,
    );
  }

  // Step 2: Import number into ElevenLabs
  let elevenlabsPhoneNumberId = null;
  try {
    const elRes = await fetch(
      'https://api.elevenlabs.io/v1/convai/phone-numbers/create',
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone_number: twilioNumber,
          agent_id: ELEVENLABS_AGENT_ID,
          provider: 'twilio',
          label: `openclaw-${user.id}`,
          twilio_account_sid: TWILIO_ACCOUNT_SID,
          twilio_auth_token: TWILIO_AUTH_TOKEN,
        }),
      },
    );

    if (elRes.ok) {
      const elData = await elRes.json();
      elevenlabsPhoneNumberId = elData.phone_number_id || null;
    } else {
      // ElevenLabs import failed — number is bought but not linked.
      // We still save it so the user has the number; ElevenLabs can be retried.
      console.error('[provision] ElevenLabs import failed:', elRes.status, await elRes.text().catch(() => ''));
    }
  } catch (err) {
    // Non-fatal: number is provisioned in Twilio, ElevenLabs link can be retried
    console.error('[provision] ElevenLabs import error:', err.message || err);
  }

  // Step 3: Update user record
  try {
    const now = new Date().toISOString();
    await db
      .prepare('UPDATE users SET twilio_phone_number = ?, elevenlabs_phone_number_id = ?, updated_at = ? WHERE id = ?')
      .bind(twilioNumber, elevenlabsPhoneNumberId, now, user.id)
      .run();
  } catch (err) {
    return json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to save phone number to account' } },
      500,
    );
  }

  return json({ phone_number: twilioNumber });
}
