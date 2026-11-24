const endpoint = 'https://demos.mrsoftware.dk/api/enquiries';
const form = document.querySelector('#book-demo-form');
const result = document.querySelector('#book-demo-result');

function newRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

if (form && result) {
  let pending = null;
  const value = name => String(form.elements[name]?.value ?? '');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (form.getAttribute('aria-busy') === 'true' || !form.reportValidity()) return;
    const button = form.querySelector('button[type="submit"]');
    form.setAttribute('aria-busy', 'true');
    button.disabled = true;
    result.hidden = false;
    result.textContent = 'Sending your request…';
    try {
      const fields = {
        company: value('company').trim(),
        name: value('name').trim(),
        email: value('email').trim(),
        product: value('product'),
        packageId: '',
        message: value('message').trim(),
        website: value('website'),
      };
      const fingerprint = JSON.stringify(fields);
      if (!pending || pending.fingerprint !== fingerprint) pending = { fingerprint, requestId: newRequestId() };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'MRSoftware' },
        body: JSON.stringify({ requestId: pending.requestId, ...fields }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const fallback = response.status === 429
          ? 'Too many requests have been sent from this network. Please try again in an hour, or email us.'
          : 'We could not confirm your request. Please try again with the same details, or email us. A retry does not create a second request.';
        throw new Error(typeof payload.error === 'string' ? payload.error : fallback);
      }
      if (payload.received !== true || typeof payload.reference !== 'string') throw new Error('We could not confirm your request. Please try again, or email us.');
      form.reset();
      result.textContent = `Request received. Reference ${payload.reference}. We will reply by email.`;
      pending = null;
    } catch (error) {
      result.textContent = error instanceof TypeError
        ? 'We could not confirm your request. Please try again, or email us.'
        : error.message;
    } finally {
      form.removeAttribute('aria-busy');
      button.disabled = false;
      result.focus();
    }
  });
}
