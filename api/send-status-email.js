'use strict';

const { db }         = require('./_lib/firebase-admin');
const { sendEmail }  = require('./_lib/resend');
const { buildConfirmed, buildProcessing, buildDispatched } = require('./_lib/emails');

const BUILDERS = {
  confirmed:  buildConfirmed,
  processing: buildProcessing,
  dispatched: buildDispatched,
};

function verifyAdminToken(idToken) {
  if (!idToken) return false;
  try {
    const parts = idToken.split('.');
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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = (req.headers.authorization || '').trim();
  const idToken    = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken || !verifyAdminToken(idToken)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { orderId, status, trackingNumber } = req.body || {};
  if (!orderId) return res.status(400).json({ error: 'orderId is required' });
  if (!BUILDERS[status]) return res.status(400).json({ error: 'Invalid status' });

  try {
    const orderRef  = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return res.status(404).json({ error: 'Order not found' });

    const order = orderSnap.data();

    // Update order status
    const update = { orderStatus: status };
    if (trackingNumber) update.trackingNumber = trackingNumber;
    await orderRef.update(update);

    // Send status email — best-effort
    if (order.customerEmail) {
      try {
        const alreadySent = (order.statusEmailsSent || {})[status];
        if (!alreadySent) {
          const email = BUILDERS[status]({
            customerName:   order.customerName  || '',
            orderRef:       order.orderRef       || orderId,
            items:          order.items          || [],
            totalNGN:       order.totalNGN       || order.total || 0,
            trackingNumber: trackingNumber || order.trackingNumber || '',
          });
          await sendEmail({ to: order.customerEmail, subject: email.subject, html: email.html });
          await orderRef.update({ [`statusEmailsSent.${status}`]: true });
        }
      } catch (emailErr) {
        console.error('[send-status-email] email failed:', status, emailErr.message);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[send-status-email]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
