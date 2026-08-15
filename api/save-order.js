const PROJECT_ID = 'chunkz-store';
const { sendEmail } = require('./_lib/resend');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'jibadepaul@gmail.com';

function orderNotificationHtml(order) {
  const items = (order.items || []).map(i =>
    `<tr>
      <td style="padding:6px 0;border-bottom:1px solid #222;color:#ccc;font-family:Arial,sans-serif;font-size:13px;">${i.name}${i.size ? ' [' + i.size + ']' : ''}</td>
      <td style="padding:6px 0;border-bottom:1px solid #222;color:#ccc;font-family:Arial,sans-serif;font-size:13px;text-align:center;">x${i.qty}</td>
      <td style="padding:6px 0;border-bottom:1px solid #222;color:#fff;font-family:Arial,sans-serif;font-size:13px;text-align:right;">${i.currency} ${Number(i.price * i.qty).toLocaleString()}</td>
    </tr>`
  ).join('');

  const c = order.customer || {};
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="background:#0a0a0a;margin:0;padding:24px;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#111;border-radius:8px;padding:28px;">
    <tr><td>
      <p style="color:#e63946;font-size:11px;font-weight:700;letter-spacing:2px;margin:0 0 4px;">NEW ORDER</p>
      <h2 style="color:#fff;margin:0 0 20px;font-size:20px;">${order.orderRef}</h2>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
        <tr><td style="color:#888;font-size:12px;padding-bottom:4px;">CUSTOMER</td></tr>
        <tr><td style="color:#fff;font-size:14px;">${c.name || '—'}</td></tr>
        <tr><td style="color:#aaa;font-size:13px;">${c.email || '—'}</td></tr>
        <tr><td style="color:#aaa;font-size:13px;">${c.phone || '—'}</td></tr>
        ${c.address ? `<tr><td style="color:#aaa;font-size:13px;padding-top:4px;">${c.address}${c.city ? ', ' + c.city : ''}${c.state ? ', ' + c.state : ''}</td></tr>` : ''}
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
        <tr>
          <th style="color:#888;font-size:11px;text-align:left;padding-bottom:8px;letter-spacing:1px;">ITEM</th>
          <th style="color:#888;font-size:11px;text-align:center;padding-bottom:8px;letter-spacing:1px;">QTY</th>
          <th style="color:#888;font-size:11px;text-align:right;padding-bottom:8px;letter-spacing:1px;">TOTAL</th>
        </tr>
        ${items}
        <tr>
          <td colspan="2" style="padding-top:12px;color:#888;font-size:12px;font-weight:700;letter-spacing:1px;">ORDER TOTAL</td>
          <td style="padding-top:12px;color:#e63946;font-size:16px;font-weight:700;text-align:right;">${order.currency || ''} ${Number(order.total || 0).toLocaleString()}</td>
        </tr>
      </table>

      ${order.promoCode ? `<p style="color:#aaa;font-size:12px;">Promo: <strong style="color:#fff;">${order.promoCode}</strong></p>` : ''}
      ${order.paymentRef ? `<p style="color:#aaa;font-size:12px;">Payment ref: <strong style="color:#fff;">${order.paymentRef}</strong></p>` : ''}
      ${order.notes ? `<p style="color:#aaa;font-size:12px;">Notes: <strong style="color:#fff;">${order.notes}</strong></p>` : ''}
    </td></tr>
  </table>
</body></html>`;
}

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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const order = req.body;
  if (!order || !order.orderRef) return res.status(400).json({ error: 'Missing orderRef' });

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

    // Only notify on first placement (notify flag set by submitOrder, not payment callback)
    if (order.notify) {
      sendEmail({
        to:      ADMIN_EMAIL,
        subject: `New Order: ${order.orderRef} — ${order.currency || ''} ${Number(order.total || 0).toLocaleString()}`,
        html:    orderNotificationHtml(order),
      }).catch(e => console.error('[save-order] admin email failed:', e.message));
    }

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('[save-order] fetch error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
