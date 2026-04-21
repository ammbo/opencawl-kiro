// Landing page — waitlist form + smooth scroll

/**
 * Validate phone number in E.164 format.
 * Must start with +, followed by 1-15 digits (total 2-16 chars).
 */
function isValidPhone(phone) {
  if (typeof phone !== 'string') return false;
  return /^\+\d{1,15}$/.test(phone);
}

function showMessage(el, text, type) {
  el.textContent = text;
  el.className = 'form-message ' + type;
}

function clearMessage(el) {
  el.textContent = '';
  el.className = 'form-message';
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('waitlist-form');
  const phoneInput = document.getElementById('phone');
  const submitBtn = document.getElementById('waitlist-submit');
  const messageEl = document.getElementById('form-message');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage(messageEl);
    phoneInput.classList.remove('input-error');

    const phone = phoneInput.value.trim();

    // Client-side validation
    if (!isValidPhone(phone)) {
      phoneInput.classList.add('input-error');
      showMessage(messageEl, 'Please enter a valid phone number (e.g. +1234567890).', 'error');
      return;
    }

    // Disable while submitting
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    try {
      const res = await fetch('/api/waitlist/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      if (res.ok) {
        showMessage(messageEl, "You're on the list! We'll text you when it's your turn.", 'success');
        phoneInput.value = '';
      } else if (res.status === 409) {
        showMessage(messageEl, 'This phone number is already on the waitlist.', 'error');
      } else if (res.status === 400) {
        const data = await res.json().catch(() => ({}));
        showMessage(messageEl, data?.error?.message || 'Invalid phone number.', 'error');
      } else {
        showMessage(messageEl, 'Something went wrong. Please try again.', 'error');
      }
    } catch {
      showMessage(messageEl, 'Network error. Please check your connection and try again.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Join Waitlist';
    }
  });

  // Clear error state on input
  phoneInput.addEventListener('input', () => {
    phoneInput.classList.remove('input-error');
    clearMessage(messageEl);
  });

  // Smooth scroll for nav links (fallback for browsers without CSS scroll-behavior)
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
});
