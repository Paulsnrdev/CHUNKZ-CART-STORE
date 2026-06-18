// Vercel Serverless Function — sends order status update emails via Resend.
// Required environment variables in Vercel:
//   RESEND_API_KEY        — from resend.com (free tier: 3,000/month)
//   NOTIFY_FROM_EMAIL     — verified sender, e.g. orders@chunkzthebrand.com
//                           (must match a domain you've verified in Resend)

/* Verify the Firebase ID token — same logic as flutterwave.js */
function verifyAdminToken(idToken) {
  if (!idToken) return false;
  try {
    const parts   = idToken.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return (
      payload.aud   === 'chunkz-store' &&
      payload.email === 'brodahsegunofib@gmail.com'
    );
  } catch (e) {
    return false;
  }
}

/* Email content per status */
const TEMPLATES = {
  confirmed: {
    subject: 'Your Chunkz order is confirmed ✓',
    heading: 'Order Confirmed!',
    body:    'Great news — your payment has been received and your order has been confirmed. Our team will begin processing it shortly.'
  },
  processing: {
    subject: 'Your Chunkz order is being packed',
    heading: "We're Packing Your Order",
    body:    "Your order is currently being packed and prepared for dispatch. We'll notify you as soon as it's on its way."
  },
  dispatched: {
    subject: 'Your Chunkz order is on its way! 🚚',
    heading: 'Order Dispatched',
    body:    'Your order has been handed to the courier and is on its way to you.'
  },
  delivered: {
    subject: 'Your Chunkz order has been delivered 🎉',
    heading: 'Order Delivered!',
    body:    'Your order has been delivered. We hope you love it! Thank you for shopping with Chunkz.'
  }
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  // ── Auth ────────────────────────────────────────────────
  const authHeader = (req.headers.authorization || '').trim();
  const idToken    = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken || !verifyAdminToken(idToken)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ── Payload ─────────────────────────────────────────────
  const {
    customerEmail,
    customerName,
    orderId,
    status,
    trackingNumber
  } = req.body || {};

  if (!customerEmail || !orderId || !status) {
    return res.status(400).json({ error: 'Missing required fields: customerEmail, orderId, status' });
  }

  // Only send emails for meaningful status transitions
  const template = TEMPLATES[status];
  if (!template) {
    return res.status(200).json({ skipped: true, reason: 'No email template for status: ' + status });
  }

  // ── Config check ─────────────────────────────────────────
  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'RESEND_API_KEY is not set in Vercel environment variables.' });
  }

  const fromEmail = process.env.NOTIFY_FROM_EMAIL || 'Chunkz <orders@chunkzthebrand.com>';

  // ── Build email ──────────────────────────────────────────
  const trackingBlock = (status === 'dispatched' && trackingNumber)
    ? `<div style="margin:20px 0;padding:14px 18px;background:#f4f4f4;border-radius:8px;font-family:monospace;font-size:14px;color:#0a0a0a">
         Tracking number: <strong>${trackingNumber}</strong>
       </div>`
    : '';

  const html = buildEmail({
    heading:       template.heading,
    body:          template.body,
    orderId,
    customerName:  customerName || 'there',
    trackingBlock
  });

  // ── Send via Resend ──────────────────────────────────────
  try {
    const r    = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        Authorization:  'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from:    fromEmail,
        to:      [customerEmail],
        subject: '[' + orderId + '] ' + template.subject,
        html
      })
    });

    const data = await r.json();
    if (!r.ok) {
      console.error('[notify] Resend error:', data);
      return res.status(502).json({ error: 'Resend error', detail: data });
    }

    return res.status(200).json({ success: true, emailId: data.id });

  } catch (e) {
    console.error('[notify] Fetch error:', e);
    return res.status(500).json({ error: 'Failed to reach Resend API: ' + e.message });
  }
};

function buildEmail({ heading, body, orderId, customerName, trackingBlock }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chunkz Order Update</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
             style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">

        <!-- ── Header ── -->
        <tr>
          <td style="background:#0a0a0a;padding:28px 32px;text-align:center">
            <div style="font-size:24px;font-weight:900;letter-spacing:5px;color:#ffffff">CHUNKZ</div>
            <div style="font-size:10px;letter-spacing:2px;color:#888;margin-top:4px;text-transform:uppercase">Order Update</div>
          </td>
        </tr>

        <!-- ── Body ── -->
        <tr>
          <td style="padding:36px 32px 28px">
            <p style="margin:0 0 4px;font-size:13px;color:#888">Hi ${customerName},</p>
            <h1 style="margin:8px 0 18px;font-size:22px;font-weight:900;color:#0a0a0a;line-height:1.2">${heading}</h1>
            <p style="margin:0 0 20px;font-size:14px;color:#444;line-height:1.7">${body}</p>

            ${trackingBlock}

            <!-- Order ID box -->
            <div style="background:#f8f8f8;border-radius:10px;padding:18px 20px;margin:20px 0">
              <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#888;text-transform:uppercase;margin-bottom:6px">Order ID</div>
              <div style="font-size:17px;font-weight:900;font-family:monospace;color:#0a0a0a;letter-spacing:1px">${orderId}</div>
            </div>

            <!-- CTA button -->
            <a href="https://chunkzthebrand.com/track-order?ref=${orderId}"
               style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;
                      padding:14px 30px;border-radius:8px;font-size:13px;font-weight:700;
                      letter-spacing:1px;margin-top:4px">
              TRACK YOUR ORDER →
            </a>
          </td>
        </tr>

        <!-- ── Footer ── -->
        <tr>
          <td style="padding:20px 32px 28px;border-top:1px solid #f0f0f0;text-align:center">
            <p style="margin:0;font-size:11px;color:#aaa;line-height:1.8">
              Questions? Email us at
              <a href="mailto:chunkzthebrand@gmail.com" style="color:#0a0a0a;text-decoration:none">chunkzthebrand@gmail.com</a><br>
              &copy; 2026 Chunkz. All rights reserved.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
