/**
 * POST /api/phone/configure
 * Updates Twilio webhook and voicemail settings for the user's phone number.
 */
export async function onRequestPost(context) {
  const user = context.data.user;
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = context.env;

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  if (!user.twilio_phone_number) {
    return json(
      { error: { code: 'NOT_FOUND', message: 'No phone number provisioned for this account' } },
      404,
    );
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json(
      { error: { code: 'INVALID_INPUT', message: 'Invalid JSON body' } },
      400,
    );
  }

  const { webhook_url, voicemail_enabled, voicemail_message } = body;

  // Look up the Twilio SID for this phone number
  const twilioAuth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  let numberSid;

  try {
    const lookupRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(user.twilio_phone_number)}`,
      {
        headers: { Authorization: `Basic ${twilioAuth}` },
      },
    );

    if (!lookupRes.ok) {
      return json(
        { error: { code: 'TWILIO_ERROR', message: 'Failed to look up phone number in Twilio' } },
        500,
      );
    }

    const lookupData = await lookupRes.json();
    if (!lookupData.incoming_phone_numbers || lookupData.incoming_phone_numbers.length === 0) {
      return json(
        { error: { code: 'NOT_FOUND', message: 'Phone number not found in Twilio account' } },
        404,
      );
    }

    numberSid = lookupData.incoming_phone_numbers[0].sid;
  } catch (err) {
    return json(
      { error: { code: 'TWILIO_ERROR', message: 'Unable to reach Twilio API' } },
      500,
    );
  }

  // Build update params
  const updateParams = new URLSearchParams();

  if (webhook_url) {
    updateParams.set('VoiceUrl', webhook_url);
    updateParams.set('VoiceMethod', 'POST');
  }

  if (voicemail_enabled !== undefined) {
    // Twilio voicemail is configured via VoiceFallbackUrl
    if (voicemail_enabled && voicemail_message) {
      updateParams.set(
        'VoiceFallbackUrl',
        `https://handler.twilio.com/twiml/voicemail?message=${encodeURIComponent(voicemail_message)}`,
      );
    } else if (!voicemail_enabled) {
      updateParams.set('VoiceFallbackUrl', '');
    }
  }

  if ([...updateParams].length === 0) {
    return json(
      { error: { code: 'INVALID_INPUT', message: 'No configuration changes provided' } },
      400,
    );
  }

  // Update the Twilio number
  try {
    const updateRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers/${numberSid}.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${twilioAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: updateParams.toString(),
      },
    );

    if (!updateRes.ok) {
      return json(
        { error: { code: 'TWILIO_ERROR', message: 'Failed to update phone number configuration' } },
        500,
      );
    }
  } catch (err) {
    return json(
      { error: { code: 'TWILIO_ERROR', message: 'Unable to reach Twilio API' } },
      500,
    );
  }

  return json({ success: true });
}
