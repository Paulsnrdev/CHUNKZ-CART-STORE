'use strict';

const { db } = require('./_lib/firebase-admin');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'invalid_token' });

  try {
    const snap = await db.collection('followUps').where('token', '==', token).limit(1).get();
    if (snap.empty) return res.status(404).json({ error: 'invalid_token' });

    const followUp = snap.docs[0].data();

    if (followUp.optedOut) return res.status(200).json({ error: 'opted_out' });

    const daysSince = (Date.now() - new Date(followUp.deliveredAt).getTime()) / 86400000;
    if (daysSince > 30) return res.status(200).json({ error: 'expired_token' });

    const VALID_STAGES = ['day0', 'day3', 'day6', 'day8'];
    let stage = VALID_STAGES.includes(req.query.stage) ? req.query.stage : null;
    if (!stage) {
      if (daysSince < 3)      stage = 'day0';
      else if (daysSince < 6) stage = 'day3';
      else if (daysSince < 8) stage = 'day6';
      else                    stage = 'day8';
    }

    const orderSnap = await db.collection('orders').doc(followUp.orderId).get();
    const order = orderSnap.exists ? orderSnap.data() : {};
    const now = new Date().toISOString();

    const followUpRef = db.collection('followUps').doc(followUp.orderId);
    const eventRef    = db.collection('events').doc();
    const batch       = db.batch();

    const stageStatus = followUp[stage];
    if (stageStatus === 'pending' || stageStatus === 'sent') {
      batch.update(followUpRef, { [stage]: 'opened' });
    }
    batch.set(eventRef, {
      orderId:   followUp.orderId,
      type:      'link_opened',
      metadata:  { stage, token },
      createdAt: now,
    });
    await batch.commit();

    return res.status(200).json({
      stage,
      followUp: {
        orderId:      followUp.orderId,
        customerName: followUp.customerName,
        deliveredAt:  followUp.deliveredAt,
        day0: followUp.day0,
        day3: followUp.day3,
        day6: followUp.day6,
        day8: followUp.day8,
      },
      order: {
        orderRef:         order.orderRef || followUp.orderId,
        customerName:     order.customerName || followUp.customerName,
        items:            order.items || [],
        total:            order.total,
        currency:         order.currency,
        totalNGN:         order.totalNGN,
        colourPreference: order.colourPreference || '',
      },
      recommendation: stage === 'day8' ? {
        productId: followUp.recommendedProductId   || null,
        name:      followUp.recommendedProductName || null,
        imageUrl:  followUp.recommendedProductId   || null, // productId IS the imageUrl (Firebase Storage src)
        priceNGN:  followUp.recommendedPriceNGN    || null,
        pitch:     followUp.recommendedPitch       || null,
        source:    followUp.recommendationSource   || null,
      } : null,
      promo: (stage === 'day8' && followUp.promoCode) ? {
        code:      followUp.promoCode,
        expiresAt: followUp.promoExpiresAt || null,
      } : null,
    });
  } catch (err) {
    console.error('[resolve-token]', err);
    return res.status(500).json({ error: 'server_error' });
  }
};
