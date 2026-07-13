'use strict';

const { db }             = require('./_lib/firebase-admin');
const { checkRateLimit } = require('./_lib/promo');

const RATES = { NGN: 1, USD: 1375, GBP: 1820, CAD: 975 };

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const action = (req.query.action || '').toLowerCase();

  // ── validate ──────────────────────────────────────────────────────────────────
  if (action === 'validate') {
    const ip      = ((req.headers['x-forwarded-for'] || '').split(',')[0] || '').trim();
    const limited = await checkRateLimit(ip).catch(() => false);
    if (limited) {
      return res.status(429).json({ valid: false, message: 'Too many attempts — please wait a few minutes.' });
    }

    const { code, cartItems } = req.body || {};
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ valid: false, message: 'No code provided.' });
    }

    const normalised = code.trim().toUpperCase();

    try {
      const snap = await db.collection('promoCodes').doc(normalised).get();
      if (!snap.exists) {
        return res.status(200).json({ valid: false, message: "This code doesn't exist. Double-check and try again." });
      }

      const promo = snap.data();

      if (promo.redeemed) {
        return res.status(200).json({ valid: false, message: 'This code has already been used.' });
      }
      if (new Date(promo.expiresAt) < new Date()) {
        return res.status(200).json({ valid: false, message: 'This code has expired.' });
      }

      if (promo.productId && Array.isArray(cartItems) && cartItems.length > 0) {
        const hasProduct = cartItems.some(function(i) { return i.src === promo.productId; });
        if (!hasProduct) {
          return res.status(200).json({
            valid:   false,
            message: 'This code is for "' + (promo.productName || 'a specific item') + '". Add that item to your cart first.',
          });
        }
      }

      let applicableNGN = 0;
      if (Array.isArray(cartItems) && cartItems.length > 0) {
        const items = promo.productId
          ? cartItems.filter(function(i) { return i.src === promo.productId; })
          : cartItems;
        applicableNGN = items.reduce(function(sum, i) {
          const rate = RATES[String(i.currency || 'NGN').toUpperCase()] || 1;
          return sum + (Number(i.price) * Number(i.qty || 1) * rate);
        }, 0);
      }

      const discountAmountNGN = Math.round(applicableNGN * promo.discountPct / 100);

      return res.status(200).json({
        valid:            true,
        code:             normalised,
        discountPct:      promo.discountPct,
        discountAmountNGN,
        productId:        promo.productId   || null,
        productName:      promo.productName || null,
        expiresAt:        promo.expiresAt,
        message:          promo.discountPct + '% off applied!',
      });
    } catch (err) {
      console.error('[promo validate]', err);
      return res.status(500).json({ valid: false, message: 'Something went wrong. Try again.' });
    }
  }

  // ── redeem ────────────────────────────────────────────────────────────────────
  if (action === 'redeem') {
    const { code, orderId, email } = req.body || {};
    if (!code || !orderId) return res.status(400).json({ error: 'Missing code or orderId' });

    const normalised = String(code).trim().toUpperCase();

    try {
      const orderSnap = await db.collection('orders').doc(String(orderId)).get();
      if (!orderSnap.exists) return res.status(400).json({ error: 'Invalid order' });

      const promoRef = db.collection('promoCodes').doc(normalised);
      const snap     = await promoRef.get();
      if (!snap.exists) return res.status(404).json({ error: 'Code not found' });

      const promo = snap.data();

      if (promo.redeemed && promo.redeemedOrderId === orderId) {
        return res.status(200).json({ ok: true });
      }
      if (promo.redeemed) {
        return res.status(409).json({ error: 'Code already redeemed' });
      }

      let isReferral = false;
      try {
        const origSnap = await db.collection('orders').doc(promo.followUpId).get();
        if (origSnap.exists) {
          const origEmail  = (origSnap.data().customerEmail || '').trim().toLowerCase();
          const buyerEmail = (email || '').trim().toLowerCase();
          isReferral = !!(origEmail && buyerEmail && origEmail !== buyerEmail);
        }
      } catch (e) {
        console.error('[promo redeem] referral check failed', e.message);
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
          console.error('[promo redeem] followUp cancel failed', e.message);
        }
      }

      batch.set(db.collection('events').doc(), {
        orderId,
        type:      'upsell_purchased',
        metadata:  { code: normalised, isReferral, followUpId: promo.followUpId || null },
        createdAt: now,
      });

      await batch.commit();
      return res.status(200).json({ ok: true, isReferral });
    } catch (err) {
      console.error('[promo redeem]', err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  return res.status(400).json({ error: 'action must be validate or redeem' });
};
