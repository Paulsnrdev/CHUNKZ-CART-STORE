'use strict';
const { sendEmail } = require('./_lib/resend');

const PROJECT_ID   = 'chunkz-store';
const ADMIN_EMAIL  = process.env.ADMIN_EMAIL  || 'jibadepaul@gmail.com';
const SITE_URL     = process.env.SITE_URL     || 'https://chunkzthebrand.com';

/* ── Firestore helpers ── */
function toFsValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean')          return { booleanValue: val };
  if (typeof val === 'number')           return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (typeof val === 'string')           return { stringValue: val };
  if (Array.isArray(val))               return { arrayValue: { values: val.map(toFsValue) } };
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) fields[k] = toFsValue(v);
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

/* ── Admin email builder ── */
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildAdminEmail(o) {
  const items       = o.items || [];
  const symbol      = o.symbol || (o.currency === 'NGN' ? '₦' : o.currency === 'GBP' ? '£' : o.currency === 'CAD' ? 'CA$' : '$');
  const statusBg    = o.paymentStatus === 'paid' ? '#2a9d8f' : '#e63946';
  const statusLabel = o.paymentStatus === 'paid' ? '&#x2705; PAYMENT CONFIRMED' : '&#x23F3; AWAITING PAYMENT';
  const total       = o.total || o.totalNGN || 0;
  const subtotal    = o.subtotal || items.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0);
  const deliveryFee = o.deliveryFee || (o.deliveryFeeNGN ? '₦' + Number(o.deliveryFeeNGN).toLocaleString() : 'Free');
  const orderDate   = o.orderDate || o.timestamp || new Date().toISOString();

  const itemRows = items.map(item => {
    const lineTotal = (item.price || 0) * (item.qty || 1);
    const imgBlock  = item.src
      ? `<img src="${esc(item.src)}" width="72" height="72"
             style="width:72px;height:72px;object-fit:cover;border-radius:8px;
                    display:block;border:1px solid #2a2a2a;" alt="${esc(item.name)}">`
      : `<div style="width:72px;height:72px;background:#1e1e1e;border-radius:8px;
                    text-align:center;line-height:72px;border:1px solid #2a2a2a;
                    font-size:28px;">&#x1F455;</div>`;
    return `
<tr style="border-bottom:1px solid #1e1e1e;">
  <td style="padding:10px 8px;width:88px;vertical-align:top;">${imgBlock}</td>
  <td style="padding:10px 8px;vertical-align:top;">
    <p style="margin:0 0 4px;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;line-height:1.3;">${esc(item.name)}</p>
    ${item.size ? `<p style="margin:0 0 3px;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#888888;">Size: <strong style="color:#cccccc;">${esc(item.size)}</strong></p>` : ''}
    <p style="margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#666666;">Qty: ${item.qty || 1}</p>
  </td>
  <td style="padding:10px 8px;vertical-align:top;text-align:right;white-space:nowrap;">
    <p style="margin:0 0 3px;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#666666;">${esc(symbol)}${Number(item.price || 0).toLocaleString()} each</p>
    <p style="margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:700;color:#e63946;">${esc(symbol)}${Number(lineTotal).toLocaleString()}</p>
  </td>
</tr>`;
  }).join('');

  const promoCode    = o.promoCode || o.appliedPromo;
  const promoDiscount = o.promoDiscount || (o.promoDiscountNGN ? '₦' + Number(o.promoDiscountNGN).toLocaleString() : '');
  const promoRow = promoCode ? `
<tr>
  <td colspan="2" style="padding:4px 0;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#888888;">Promo (${esc(promoCode)})</td>
  <td style="padding:4px 0;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#2a9d8f;text-align:right;">- ${esc(promoDiscount)}</td>
</tr>` : '';

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0a0a;">
<tr><td align="center" style="padding:24px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">

<tr><td bgcolor="#e63946" style="border-radius:10px 10px 0 0;padding:16px 24px;text-align:center;">
  <span style="font-family:'Segoe UI',Arial,sans-serif;font-size:20px;font-weight:900;letter-spacing:6px;color:#ffffff;text-transform:uppercase;">CHUNKZ &mdash; NEW ORDER</span>
</td></tr>

<tr><td bgcolor="${statusBg}" style="padding:10px 24px;text-align:center;">
  <span style="font-family:'Segoe UI',Arial,sans-serif;font-size:13px;font-weight:800;letter-spacing:2px;color:#ffffff;">${statusLabel} &nbsp;&middot;&nbsp; ${esc(o.orderRef)}</span>
</td></tr>

<tr><td bgcolor="#111111" style="border-radius:0 0 10px 10px;padding:24px;">

  <!-- Customer -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#181818;border-radius:8px;margin-bottom:20px;">
    <tr><td style="padding:12px 16px;border-bottom:1px solid #222222;">
      <span style="font-family:'Segoe UI',Arial,sans-serif;font-size:9px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#555555;">CUSTOMER INFO</span>
    </td></tr>
    <tr><td style="padding:14px 16px;">
      <table cellpadding="0" cellspacing="5" border="0">
        <tr><td style="font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#666666;width:90px;">Name</td><td style="font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#ffffff;font-weight:600;">${esc(o.customerName)}</td></tr>
        <tr><td style="font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#666666;">Phone</td><td><a href="tel:${esc(o.customerPhone)}" style="font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#e63946;text-decoration:none;font-weight:600;">${esc(o.customerPhone)}</a></td></tr>
        ${o.customerEmail ? `<tr><td style="font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#666666;">Email</td><td style="font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#cccccc;">${esc(o.customerEmail)}</td></tr>` : ''}
        <tr><td style="font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#666666;">Address</td><td style="font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#cccccc;">${esc(o.deliveryAddress || 'Self Pickup')}</td></tr>
        <tr><td style="font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#666666;">Zone</td><td style="font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#cccccc;">${esc(o.deliveryZone || '')}</td></tr>
        ${o.colourPreference ? `<tr><td style="font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#666666;">Colour</td><td style="font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#cccccc;">${esc(o.colourPreference)}</td></tr>` : ''}
        ${o.descriptionNote ? `<tr><td style="font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#666666;">Note</td><td style="font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#cccccc;">${esc(o.descriptionNote)}</td></tr>` : ''}
        <tr><td style="font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#666666;">Date</td><td style="font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#666666;">${esc(String(orderDate))}</td></tr>
      </table>
    </td></tr>
  </table>

  <!-- Items -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#181818;border-radius:8px;margin-bottom:20px;">
    <tr><td colspan="3" style="padding:12px 16px;border-bottom:1px solid #222222;">
      <span style="font-family:'Segoe UI',Arial,sans-serif;font-size:9px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#555555;">ORDER ITEMS &mdash; ${items.length} item${items.length !== 1 ? 's' : ''}</span>
    </td></tr>
    ${itemRows}
    <tr><td colspan="3" style="padding:14px 16px;border-top:1px solid #222222;">
      <table width="100%" cellpadding="0" cellspacing="4" border="0">
        <tr><td colspan="2" style="font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#666666;">Subtotal</td><td style="font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#aaaaaa;text-align:right;">${esc(symbol)}${Number(subtotal).toLocaleString()}</td></tr>
        <tr><td colspan="2" style="font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#666666;">Delivery</td><td style="font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#aaaaaa;text-align:right;">${esc(String(deliveryFee))}</td></tr>
        ${promoRow}
        <tr><td colspan="2" style="font-family:'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:800;color:#ffffff;padding-top:10px;border-top:1px solid #2a2a2a;">TOTAL</td><td style="font-family:'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:800;color:#e63946;text-align:right;padding-top:10px;border-top:1px solid #2a2a2a;">${esc(symbol)}${Number(total).toLocaleString()} <span style="font-size:11px;color:#555555;font-weight:400;">${esc(o.currency || '')}</span></td></tr>
      </table>
    </td></tr>
  </table>

  <p style="margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#444444;text-align:center;">
    <a href="${SITE_URL}/admin" style="color:#e63946;text-decoration:none;font-weight:700;">Open Admin Dashboard &rarr;</a>
  </p>

</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  const totalStr = `${symbol}${Number(total).toLocaleString()} ${o.currency || ''}`;
  return {
    subject: `New Order ${o.orderRef} — ${o.customerName} · ${totalStr}`,
    html,
  };
}

/* ── Handler ── */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const order = req.body;
  if (!order || !order.orderRef) return res.status(400).json({ error: 'Missing orderRef' });

  /* Save to Firestore */
  const fields = {};
  for (const [key, val] of Object.entries(order)) fields[key] = toFsValue(val);
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/orders/${order.orderRef}`;

  try {
    const r = await fetch(url, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ fields })
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('[save-order] Firestore error:', JSON.stringify(data));
      return res.status(500).json({ error: data });
    }
  } catch (e) {
    console.error('[save-order] fetch error:', e.message);
    return res.status(500).json({ error: e.message });
  }

  /* Send admin email (fire-and-forget — never block the response) */
  try {
    const { subject, html } = buildAdminEmail(order);
    await sendEmail({ to: ADMIN_EMAIL, subject, html });
  } catch (e) {
    console.error('[save-order] admin email error:', e.message);
  }

  return res.status(200).json({ success: true });
};
