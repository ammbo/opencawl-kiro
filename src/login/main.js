// Login page — two-step phone OTP flow
import { parsePhoneNumber, getCountries, getCountryCallingCode, AsYouType } from 'libphonenumber-js';

// ── Country selector setup ────────────────────────────────────────

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

const countrySelect = document.getElementById('country-select');
const phoneNumberInput = document.getElementById('phone-number');

COUNTRIES.forEach(({ code, flag, dial }) => {
  const opt = document.createElement('option');
  opt.value = code;
  opt.textContent = `${flag} +${dial}`;
  if (code === 'US') opt.selected = true;
  countrySelect.appendChild(opt);
});

// Format number as user types (AsYouType)
function formatAsYouType(digits, countryCode) {
  const formatter = new AsYouType(countryCode);
  let out = '';
  for (const d of digits) out = formatter.input(d);
  return out;
}

phoneNumberInput.addEventListener('input', () => {
  const country = countrySelect.value;
  const digits = phoneNumberInput.value.replace(/\D/g, '');
  const formatted = formatAsYouType(digits, country);
  phoneNumberInput.value = formatted;
  phoneNumberInput.classList.remove('input-error');
  clearMessage(phoneMessage);
});

countrySelect.addEventListener('change', () => {
  const country = countrySelect.value;
  const digits = phoneNumberInput.value.replace(/\D/g, '');
  phoneNumberInput.value = formatAsYouType(digits, country);
  phoneNumberInput.placeholder = country === 'US' ? '(555) 000-0000' : '000 000 0000';
});

// Build E.164 from current inputs
function getE164() {
  const country = countrySelect.value;
  const digits = phoneNumberInput.value.replace(/\D/g, '');
  if (!digits) return null;
  try {
    const parsed = parsePhoneNumber(digits, country);
    return parsed.isValid() ? parsed.number : null;
  } catch {
    return null;
  }
}

// ── OTP 6-box setup ──────────────────────────────────────────────

const otpBoxes = Array.from(document.querySelectorAll('.otp-box'));
const codeForm = document.getElementById('code-form');

otpBoxes.forEach((box, i) => {
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace') {
      if (box.value) {
        box.value = '';
      } else if (i > 0) {
        otpBoxes[i - 1].focus();
        otpBoxes[i - 1].value = '';
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && i > 0) {
      otpBoxes[i - 1].focus();
    } else if (e.key === 'ArrowRight' && i < 5) {
      otpBoxes[i + 1].focus();
    }
  });

  box.addEventListener('input', () => {
    const digit = box.value.replace(/\D/g, '');
    box.value = digit ? digit[digit.length - 1] : '';
    clearOtpErrors();
    clearMessage(codeMessage);
    if (box.value && i < 5) {
      otpBoxes[i + 1].focus();
    }
    if (otpBoxes.every((b) => b.value)) {
      submitOtp();
    }
  });

  box.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
    pasted.split('').slice(0, 6).forEach((digit, j) => {
      if (otpBoxes[j]) otpBoxes[j].value = digit;
    });
    const nextEmpty = otpBoxes.findIndex((b) => !b.value);
    (otpBoxes[nextEmpty === -1 ? 5 : nextEmpty]).focus();
    clearOtpErrors();
    clearMessage(codeMessage);
    if (otpBoxes.every((b) => b.value)) {
      submitOtp();
    }
  });

  // Select on focus so re-entry is easy
  box.addEventListener('focus', () => box.select());
});

function getOtpCode() {
  return otpBoxes.map((b) => b.value).join('');
}

function clearOtpErrors() {
  otpBoxes.forEach((b) => b.classList.remove('input-error'));
}

function setOtpErrors() {
  otpBoxes.forEach((b) => b.classList.add('input-error'));
}

function resetOtp() {
  otpBoxes.forEach((b) => { b.value = ''; b.classList.remove('input-error'); });
}

// ── Shared UI helpers ─────────────────────────────────────────────

const phoneForm = document.getElementById('phone-form');
const sendCodeBtn = document.getElementById('send-code-btn');
const verifyBtn = document.getElementById('verify-btn');  // may be null (removed from HTML)
const backBtn = document.getElementById('back-btn');
const phoneMessage = document.getElementById('phone-message');
const codeMessage = document.getElementById('code-message');
const stepPhone = document.getElementById('step-phone');
const stepCode = document.getElementById('step-code');
const displayPhone = document.getElementById('display-phone');

let currentPhone = '';

function showStep(step) {
  stepPhone.classList.toggle('active', step === 'phone');
  stepCode.classList.toggle('active', step === 'code');
}

function setMessage(el, text, type) {
  el.textContent = text;
  el.className = 'form-message ' + type;
}

function clearMessage(el) {
  el.textContent = '';
  el.className = 'form-message';
}

function setLoading(btn, loading, label) {
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading ? `<span class="spinner"></span>${label}` : label;
}

// ── Step 1: Send verification code ───────────────────────────────

phoneForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessage(phoneMessage);

  const phone = getE164();

  if (!phone) {
    setMessage(phoneMessage, 'Please enter a valid phone number.', 'error');
    phoneNumberInput.classList.add('input-error');
    countrySelect.classList.add('input-error');
    return;
  }

  phoneNumberInput.classList.remove('input-error');
  countrySelect.classList.remove('input-error');
  setLoading(sendCodeBtn, true, 'Sending…');

  try {
    const res = await fetch('/api/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data?.error?.message || 'Failed to send code. Please try again.';
      setMessage(phoneMessage, msg, 'error');
      return;
    }

    currentPhone = phone;
    // Display formatted number
    try {
      displayPhone.textContent = parsePhoneNumber(phone).formatNational();
    } catch {
      displayPhone.textContent = phone;
    }
    showStep('code');
    otpBoxes[0].focus();
  } catch {
    setMessage(phoneMessage, 'Network error. Please check your connection.', 'error');
  } finally {
    setLoading(sendCodeBtn, false, 'Send Code');
  }
});

// ── Step 2: Submit OTP (called on auto-complete or back-compat) ───

async function submitOtp() {
  clearMessage(codeMessage);

  const code = getOtpCode();

  if (!/^\d{6}$/.test(code)) {
    setMessage(codeMessage, 'Please enter all 6 digits.', 'error');
    setOtpErrors();
    return;
  }

  // Disable all boxes during verification
  otpBoxes.forEach((b) => { b.disabled = true; });
  setMessage(codeMessage, 'Verifying…', '');

  try {
    const res = await fetch('/api/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: currentPhone, code }),
    });

    if (res.ok) {
      setMessage(codeMessage, 'Verified! Redirecting…', 'success');
      setTimeout(() => { window.location.href = '/dashboard'; }, 500);
      return;
    }

    const data = await res.json().catch(() => ({}));
    const msg = data?.error?.message || 'Invalid or expired code. Please try again.';
    setMessage(codeMessage, msg, 'error');
    resetOtp();
    otpBoxes.forEach((b) => { b.disabled = false; });
    otpBoxes[0].focus();
  } catch {
    setMessage(codeMessage, 'Network error. Please check your connection.', 'error');
    otpBoxes.forEach((b) => { b.disabled = false; });
  }
}

codeForm.addEventListener('submit', (e) => {
  e.preventDefault();
  submitOtp();
});

// ── Back button ───────────────────────────────────────────────────

backBtn.addEventListener('click', () => {
  clearMessage(codeMessage);
  resetOtp();
  showStep('phone');
  phoneNumberInput.focus();
});
