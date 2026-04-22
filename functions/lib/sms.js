/**
 * SMS sending helper for OpenCawl Phone Platform.
 * Sends SMS messages via the Twilio Messages REST API.
 */

/**
 * Sends an SMS message via the Twilio Messages API.
 *
 * @param {object} env - Environment bindings containing TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN
 * @param {string} from - The sender phone number (E.164 format)
 * @param {string} to - The recipient phone number (E.164 format)
 * @param {string} body - The SMS message body
 * @returns {Promise<{ success: boolean }>}
 */
export async function sendSms(env, from, to, body) {
  try {
    const sid = env.TWILIO_ACCOUNT_SID;
    const token = env.TWILIO_AUTH_TOKEN;

    if (!sid || !token) {
      console.error('[sms] Missing Twilio credentials');
      return { success: false };
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const auth = btoa(`${sid}:${token}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[sms] Twilio API error ${res.status}: ${text}`);
      return { success: false };
    }

    return { success: true };
  } catch (err) {
    console.error('[sms] Failed to send SMS:', err.message);
    return { success: false };
  }
}
