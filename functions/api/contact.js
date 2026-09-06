const topics = new Set(['Volunteer', 'Support the rescue', 'Other']);
const reply = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});
const unavailable = () => reply({ error: 'The form is temporarily unavailable. Please email or call the rescue.' }, 503);

export async function onRequest({ request, env }) {
  const ready = ['RESEND_API_KEY', 'CONTACT_FROM', 'CONTACT_TO', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'].every((key) => env[key]);
  if (request.method === 'GET') return ready ? reply({ sitekey: env.TURNSTILE_SITE_KEY }) : unavailable();
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return reply({ error: 'Please send your message from the rescue website.' }, 403);
  if (!ready) return unavailable();
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply({ error: 'Invalid request.' }, 415);
  let input;
  try {
    // Bound the actual bytes, including requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    let size = 0;
    let raw = '';
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) { await reader.cancel(); return reply({ error: 'Your message is too long.' }, 413); }
      raw += decoder.decode(value, { stream: true });
    }
    input = JSON.parse(raw + decoder.decode());
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
  } catch { return reply({ error: 'Invalid request.' }, 400); }
  const get = (key) => typeof input[key] === 'string' ? input[key].trim() : '';
  const name = get('name'), email = get('email'), topic = get('topic'), message = get('message'), token = get('token');
  if (get('website')) return reply({ error: 'Please leave the website field blank.' }, 400);
  if (!name || name.length > 100 || /[\r\n]/.test(name) || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !topics.has(topic) || message.length < 10 || message.length > 5000 || !token || token.length > 2048) {
    return reply({ error: 'Please check your name, email and message, and complete the verification.' }, 400);
  }
  try {
    const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: request.headers.get('CF-Connecting-IP') || undefined }),
      signal: AbortSignal.timeout(10000)
    });
    const result = await verification.json();
    if (!verification.ok || !result.success || result.action !== 'contact' || result.hostname !== new URL(request.url).hostname) {
      return reply({ error: 'Verification expired or failed. Please verify again and retry.' }, 400);
    }
    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.CONTACT_FROM,
        to: [env.CONTACT_TO],
        reply_to: email,
        subject: `Salty Dog website: ${topic}`,
        text: `Name: ${name}\nEmail: ${email}\nInterest: ${topic}\n\n${message}`
      }),
      signal: AbortSignal.timeout(15000)
    });
    if (!sent.ok) return unavailable();
    const accepted = await sent.json();
    if (!accepted.id) return unavailable();
    return reply({ ok: true });
  } catch { return reply({ error: 'We couldn’t confirm your message was sent. Please try again or email the rescue directly.' }, 502); }
}
