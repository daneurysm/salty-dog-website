(() => {
  const form = document.querySelector('#contact-form');
  const button = document.querySelector('#contact-send');
  const status = document.querySelector('#contact-status');
  const topic = document.querySelector('#contact-topic');
  let widget;
  let token = '';
  let sending = false;
  const unavailable = 'The form is temporarily unavailable. Please email or call us using the details above.';
  const setToken = (value) => { token = value; button.disabled = sending || !token; };

  document.querySelectorAll('[data-contact-topic]').forEach((link) => {
    link.addEventListener('click', () => {
      topic.value = link.dataset.contactTopic;
      document.querySelector('#contact-name').focus({ preventScroll: true });
    });
  });

  async function prepare() {
    try {
      const response = await fetch('/api/contact', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const config = await response.json();
      if (!config.sitekey) throw new Error();
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
      });
      widget = window.turnstile.render('#contact-verification', {
        sitekey: config.sitekey,
        action: 'contact',
        size: 'compact',
        callback: (value) => {
          setToken(value);
          if (status.textContent.startsWith('Complete the verification') || status.textContent.startsWith('Please complete the verification')) status.textContent = '';
        },
        'expired-callback': () => { setToken(''); status.textContent = 'Please complete the verification again.'; },
        'error-callback': () => { setToken(''); status.textContent = 'Verification could not load. Refresh this page or email us directly.'; }
      });
      status.textContent = 'Complete the verification to send your message.';
    } catch { status.textContent = unavailable; }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending || !token || !form.reportValidity()) return;
    sending = true;
    button.disabled = true;
    button.textContent = 'Sending…';
    status.textContent = '';
    const fields = new FormData(form);
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fields.get('name'), email: fields.get('email'), topic: fields.get('topic'), message: fields.get('message'), website: fields.get('website'), token })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'We couldn’t send your message. Please try again or email us directly.');
      form.reset();
      status.textContent = 'Thank you! Your message has been submitted to the rescue.';
    } catch (error) {
      status.textContent = error.message === 'Failed to fetch' ? 'We couldn’t confirm your message was sent. Please try again or email us directly.' : error.message;
    } finally {
      sending = false;
      setToken('');
      button.textContent = 'Send message';
      window.turnstile.reset(widget);
    }
  });
  prepare();
})();
