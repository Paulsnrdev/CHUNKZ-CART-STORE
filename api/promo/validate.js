'use strict';

const { db }                        = require('../_lib/firebase-admin');
const { checkRateLimit }            = require('../_lib/promo');

const RATES = { NGN: 1, USD: 1375, GBP: 1820, CAD: 975 };

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ valid: false, message: 'Method not allowed' });

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

    // If tied to a specific product, verify that product is in the cart
    if (promo.productId && Array.isArray(cartItems) && cartItems.length > 0) {
      const hasProduct = cartItems.some(function(i) { return i.src === promo.productId; });
      if (!hasProduct) {
        return res.status(200).json({
          valid:   false,
          message: 'This code is for "' + (promo.productName || 'a specific item') + '". Add that item to your cart first.',
        });
      }
    }

    // Compute discount against matched items (or full cart if no product restriction)
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
    console.error('[promo/validate]', err);
    return res.status(500).json({ valid: false, message: 'Something went wrong. Try again.' });
  }
};
