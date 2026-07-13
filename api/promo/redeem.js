'use strict';

const { db } = require('../_lib/firebase-admin');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code, orderId, email } = req.body || {};
  if (!code || !orderId) return res.status(400).json({ error: 'Missing code or orderId' });

  const normalised = String(code).trim().toUpperCase();

  try {
    // Verify the order exists (prevents fake redemptions)
    const orderSnap = await db.collection('orders').doc(String(orderId)).get();
    if (!orderSnap.exists) return res.status(400).json({ error: 'Invalid order' });

    const promoRef = db.collection('promoCodes').doc(normalised);
    const snap     = await promoRef.get();

    if (!snap.exists) return res.status(404).json({ error: 'Code not found' });

    const promo = snap.data();

    // Idempotent: same order already claimed this code
    if (promo.redeemed && promo.redeemedOrderId === orderId) {
      return res.status(200).json({ ok: true });
    }

    if (promo.redeemed) {
      return res.status(409).json({ error: 'Code already redeemed' });
    }

    // Determine referral vs. direct purchase
    let isReferral = false;
    try {
      const origSnap = await db.collection('orders').doc(promo.followUpId).get();
      if (origSnap.exists) {
        const origEmail  = (origSnap.data().customerEmail || '').trim().toLowerCase();
        const buyerEmail = (email || '').trim().toLowerCase();
        isReferral = !!(origEmail && buyerEmail && origEmail !== buyerEmail);
      }
    } catch (e) {
      console.error('[promo/redeem] referral check failed', e.message);
    }

    const now   = new Date().toISOString();
    const batch = db.batch();

    batch.update(promoRef, {
      redeemed:        true,
      redeemedAt:      now,
      redeemedByEmail: email   || null,
      redeemedOrderId: orderId,
      isReferral,
    });

    // Cancel any pending follow-up stages for the original customer
    if (promo.followUpId) {
      try {
        const fuRef  = db.collection('followUps').doc(promo.followUpId);
        const fuSnap = await fuRef.get();
        if (fuSnap.exists) {
          const fu      = fuSnap.data();
          const cancels = {};
          if (fu.day3 === 'pending') cancels.day3 = 'cancelled';
          if (fu.day6 === 'pending') cancels.day6 = 'cancelled';
          if (fu.day8 === 'pending') cancels.day8 = 'cancelled';
          if (Object.keys(cancels).length > 0) batch.update(fuRef, cancels);
        }
      } catch (e) {
        console.error('[promo/redeem] followUp cancel failed', e.message);
      }
    }

    batch.set(db.collection('events').doc(), {
      orderId:   orderId,
      type:      'upsell_purchased',
      metadata:  { code: normalised, isReferral, followUpId: promo.followUpId || null },
      createdAt: now,
    });

    await batch.commit();
    return res.status(200).json({ ok: true, isReferral });
  } catch (err) {
    console.error('[promo/redeem]', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
