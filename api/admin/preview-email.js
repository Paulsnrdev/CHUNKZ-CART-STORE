'use strict';

const { db }        = require('../_lib/firebase-admin');
const { buildDay8 } = require('../_lib/emails');

function verifyAdminToken(idToken) {
  if (!idToken) return false;
  try {
    const parts   = idToken.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload.aud === 'chunkz-store' && payload.email === 'brodahsegunofib@gmail.com';
  } catch (e) { return false; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = (req.headers.authorization || '').trim();
  const idToken    = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!verifyAdminToken(idToken)) return res.status(401).json({ error: 'Unauthorized' });

  const { orderId } = req.query;
  if (!orderId) return res.status(400).json({ error: 'orderId required' });

  try {
    const [fuSnap, orderSnap] = await Promise.all([
      db.collection('followUps').doc(orderId).get(),
      db.collection('orders').doc(orderId).get(),
    ]);

    if (!fuSnap.exists) return res.status(404).json({ error: 'Follow-up not found' });

    const fu    = fuSnap.data();
    const order = orderSnap.exists ? orderSnap.data() : {};

    if (!fu.recommendedProductId) {
      return res.status(400).json({ error: 'No recommendation set. Resolve or override recommendation first.' });
    }

    const priceNGN    = fu.recommendedPriceNGN || 0;
    const discountPct = fu.promoCode ? 15 : 0;

    const email = buildDay8({
      token:            fu.token,
      customerName:     fu.customerName      || '',
      items:            order.items           || [],
      totalNGN:         order.totalNGN        || order.total || 0,
      colourPreference: order.colourPreference || '',
      upsell: {
        name:     fu.recommendedProductName || '',
        imageUrl: fu.recommendedProductId,
        priceNGN: priceNGN,
        pitch:    fu.recommendedPitch || '',
      },
      promo: fu.promoCode ? {
        code:            fu.promoCode,
        discountPct:     discountPct,
        originalPrice:   priceNGN,
        discountedPrice: Math.round(priceNGN * (100 - discountPct) / 100),
        expiresAt:       fu.promoExpiresAt || '',
      } : null,
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(email.html);
  } catch (err) {
    console.error('[admin/preview-email]', err);
    return res.status(500).json({ error: err.message });
  }
};
