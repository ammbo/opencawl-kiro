import { useState, useEffect } from 'preact/hooks';
import { parsePhoneNumber, getCountries, getCountryCallingCode, AsYouType } from 'libphonenumber-js';

const flagEmoji = (code) =>
  code.split('').map((c) => String.fromCodePoint(c.charCodeAt(0) + 127397)).join('');

const POPULAR = ['US', 'CA', 'GB', 'AU', 'IN', 'DE', 'FR', 'JP', 'MX', 'BR'];
const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });

const COUNTRIES = getCountries()
  .map((code) => ({
    code,
    name: countryNames.of(code) || code,
    dial: getCountryCallingCode(code),
    flag: flagEmoji(code),
  }))
  .sort((a, b) => {
    const ai = POPULAR.indexOf(a.code);
    const bi = POPULAR.indexOf(b.code);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

export default function PhoneInput({ value, onValue, id, required, class: cls }) {
  const [country, setCountry] = useState('US');
  const [national, setNational] = useState('');

  useEffect(() => {
    if (!value) return;
    try {
      const parsed = parsePhoneNumber(value);
      if (parsed.country) setCountry(parsed.country);
      setNational(parsed.formatNational());
    } catch {
      // leave state as-is
    }
  }, []);

  const formatNational = (digits, countryCode) => {
    const formatter = new AsYouType(countryCode);
    let out = '';
    for (const d of digits) out = formatter.input(d);
    return out;
  };

  const emitE164 = (countryCode, digits) => {
    if (!digits) { onValue(''); return; }
    try {
      const parsed = parsePhoneNumber(digits, countryCode);
      onValue(parsed.isValid() ? parsed.number : '');
    } catch {
      onValue('');
    }
  };

  const handleCountryChange = (e) => {
    const next = e.target.value;
    setCountry(next);
    // re-format existing digits with new country
    const digits = national.replace(/\D/g, '');
    const formatted = formatNational(digits, next);
    setNational(formatted);
    emitE164(next, digits);
  };

  const handleInput = (e) => {
    const digits = e.target.value.replace(/\D/g, '');
    const formatted = formatNational(digits, country);
    setNational(formatted);
    emitE164(country, digits);
  };

  return (
    <div class={`phone-field${cls ? ` ${cls}` : ''}`}>
      <select
        class="phone-country-select"
        value={country}
        onChange={handleCountryChange}
        aria-label="Country code"
      >
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.flag} +{c.dial}
          </option>
        ))}
      </select>
      <input
        type="tel"
        id={id}
        class="form-input phone-number-input"
        value={national}
        onInput={handleInput}
        placeholder="(555) 000-0000"
        autocomplete="tel-national"
        required={required}
      />
    </div>
  );
}
