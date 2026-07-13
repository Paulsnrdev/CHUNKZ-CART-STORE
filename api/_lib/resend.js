'use strict';

const FROM_ADDRESS = process.env.EMAIL_FROM || 'Chunkz <orders@chunkzthebrand.com>';
const DRY_RUN = process.env.DRY_RUN === 'true';

async function sendEmail({ to, subject, html }) {
  if (DRY_RUN) {
    console.log('[DRY_RUN] sendEmail', JSON.stringify({ to, subject, htmlLength: html ? html.length : 0 }));
    return { id: 'dry-run-' + Date.now() };
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY not configured');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.status.toString());
    throw new Error('Resend ' + res.status + ': ' + text);
  }

  return res.json();
}

module.exports = { sendEmail };
