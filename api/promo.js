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
    const { deviceId } = req.body || {};
    const ip           = ((req.headers['x-forwarded-for'] || '').split(',')[0] || '').trim();
    const identifier   = deviceId ? String(deviceId).slice(0, 100) : ip;
    const limited = await checkRateLimit(identifier).catch(() => false);
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
      const now   = new Date();

      if (promo.active === false) {
        return res.status(200).json({ valid: false, message: 'This code is not active.' });
      }
      if (promo.startsAt && new Date(promo.startsAt) > now) {
        return res.status(200).json({ valid: false, message: 'This code is not valid yet.' });
      }
      if (new Date(promo.expiresAt) < now) {
        return res.status(200).json({ valid: false, message: 'This code has expired.' });
      }
      if (promo.usageLimit && (promo.usedCount || 0) >= promo.usageLimit) {
        return res.status(200).json({ valid: false, message: 'This code has reached its usage limit.' });
      }
      if (!promo.usageLimit && promo.redeemed) {
        return res.status(200).json({ valid: false, message: 'This code has already been used.' });
      }

      let applicableNGN = 0;
      if (Array.isArray(cartItems) && cartItems.length > 0) {
        applicableNGN = cartItems.reduce(function(sum, i) {
          const rate = RATES[String(i.currency || 'NGN').toUpperCase()] || 1;
          return sum + (Number(i.price) * Number(i.qty || 1) * rate);
        }, 0);
      }

      if (promo.minimumOrderNGN && applicableNGN < promo.minimumOrderNGN) {
        return res.status(200).json({ valid: false, message: 'Minimum order of ₦' + Number(promo.minimumOrderNGN).toLocaleString() + ' required for this code.' });
      }

      let discountAmountNGN;
      let message;
      if (promo.type === 'fixed') {
        discountAmountNGN = Math.min(Math.round(promo.fixedAmountNGN || 0), Math.round(applicableNGN));
        message = '₦' + Number(discountAmountNGN).toLocaleString() + ' off applied!';
      } else {
        discountAmountNGN = Math.round(applicableNGN * (promo.discountPct || 0) / 100);
        message = (promo.discountPct || 0) + '% off applied!';
      }

      return res.status(200).json({
        valid:            true,
        code:             normalised,
        discountPct:      promo.discountPct || 0,
        discountAmountNGN,
        expiresAt:        promo.expiresAt,
        message,
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

      const newUsedCount = (promo.usedCount || 0) + 1;
      // null  = admin "unlimited" code  → never mark fully redeemed
      // undefined = Day 8 auto code     → single-use (mark redeemed after 1st use)
      // N > 0 = limited admin code      → mark redeemed when count hits limit
      const limitReached = promo.usageLimit > 0
        ? newUsedCount >= promo.usageLimit
        : promo.usageLimit !== null;

      if (!promo.usageLimit && promo.redeemed && promo.redeemedOrderId === orderId) {
        return res.status(200).json({ ok: true });
      }
      if (!promo.usageLimit && promo.redeemed) {
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

      const redemptionUpdate = {
        usedCount:       newUsedCount,
        redeemedAt:      now,
        redeemedByEmail: email   || null,
        redeemedOrderId: orderId,
        isReferral,
      };
      if (limitReached) redemptionUpdate.redeemed = true;
      batch.update(promoRef, redemptionUpdate);

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
