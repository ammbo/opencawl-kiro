import { parsePhoneNumber } from 'libphonenumber-js';

export function formatPhone(e164) {
  if (!e164) return e164;
  try {
    return parsePhoneNumber(e164).formatNational();
  } catch {
    return e164;
  }
}
