'use strict';

const crypto = require('crypto');
const { db }         = require('./_lib/firebase-admin');
const { buildDay0 }  = require('./_lib/emails');
const { sendEmail }  = require('./_lib/resend');

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

  const { orderId, trackingNumber } = req.body || {};
  if (!orderId) return res.status(400).json({ error: 'orderId is required' });

  try {
    const orderRef    = db.collection('orders').doc(orderId);
    const followUpRef = db.collection('followUps').doc(orderId);

    const [orderSnap, followUpSnap] = await Promise.all([
      orderRef.get(),
      followUpRef.get(),
    ]);

    if (!orderSnap.exists) return res.status(404).json({ error: 'Order not found' });

    // Idempotency — if already triggered, return success without creating a duplicate
    if (followUpSnap.exists) {
      return res.status(200).json({ ok: true, idempotent: true });
    }

    const order = orderSnap.data();
    const now   = new Date().toISOString();
    const token = crypto.randomBytes(32).toString('hex');

    const batch = db.batch();

    const orderUpdate = { orderStatus: 'delivered', deliveredAt: now };
    if (trackingNumber) orderUpdate.trackingNumber = trackingNumber;
    batch.update(orderRef, orderUpdate);

    batch.set(followUpRef, {
      orderId,
      email:        order.customerEmail || '',
      customerName: order.customerName  || '',
      token,
      deliveredAt:  now,
      day0:  'pending',
      day3:  'pending',
      day6:  'pending',
      day8:  'pending',
      optedOut:  false,
      promoCode: null,
      createdAt: now,
    });

    await batch.commit();

    // Send Day 0 email — best-effort, never block the response
    if (order.customerEmail) {
      try {
        const email = buildDay0({
          token,
          customerName:     order.customerName     || '',
          orderRef:         order.orderRef          || orderId,
          items:            order.items             || [],
          totalNGN:         order.totalNGN          || order.total || 0,
          colourPreference: order.colourPreference  || '',
        });
        await sendEmail({ to: order.customerEmail, subject: email.subject, html: email.html });
        await followUpRef.update({ day0: 'sent' });
      } catch (emailErr) {
        console.error('[mark-delivered] Day 0 email failed:', emailErr.message);
      }
    } else {
      console.warn('[mark-delivered] No customerEmail for order', orderId);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[mark-delivered]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
