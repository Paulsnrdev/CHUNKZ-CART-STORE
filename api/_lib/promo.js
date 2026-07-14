'use strict';

const { db } = require('./firebase-admin');

const CHARS      = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I/l
const CODE_LEN   = 6;
const DISC_PCT   = 10;
const EXPIRY_HRS = 72;
const RL_WINDOW  = 10 * 60 * 1000; // 10 minutes
const RL_MAX     = 5;

function generateCode() {
  let code = 'CHUNKZ-';
  for (let i = 0; i < CODE_LEN; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

async function getPromoSettings() {
  try {
    const snap = await db.collection('settings').doc('promoConfig').get();
    if (snap.exists) {
      const d = snap.data();
      return {
        discPct:   d.promoDiscountPct != null ? d.promoDiscountPct : DISC_PCT,
        expiryHrs: d.promoExpiryHrs   != null ? d.promoExpiryHrs   : EXPIRY_HRS,
      };
    }
  } catch (e) {}
  return { discPct: DISC_PCT, expiryHrs: EXPIRY_HRS };
}

async function createPromo({ followUpId }) {
  const { discPct, expiryHrs } = await getPromoSettings();
  const code      = generateCode();
  const now       = new Date();
  const expiresAt = new Date(now.getTime() + expiryHrs * 3600 * 1000).toISOString();

  const data = {
    code,
    followUpId,
    referredBy:      followUpId,
    discountPct:     discPct,
    expiresAt,
    createdAt:       now.toISOString(),
    redeemed:        false,
    redeemedAt:      null,
    redeemedByEmail: null,
    redeemedOrderId: null,
    isReferral:      null,
  };

  await db.collection('promoCodes').doc(code).set(data);
  return data;
}

// Rate limit: max 5 validate attempts per IP per 10-minute window
async function checkRateLimit(ip) {
  if (!ip) return false;
  const safeIp = ip.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 80);
  const ref    = db.collection('rateLimits').doc('promo_v_' + safeIp);
  const snap   = await ref.get();
  const now    = Date.now();

  if (!snap.exists) {
    await ref.set({ attempts: 1, windowStart: now });
    return false;
  }

  const d = snap.data();
  if (now - d.windowStart > RL_WINDOW) {
    await ref.set({ attempts: 1, windowStart: now });
    return false;
  }

  if (d.attempts >= RL_MAX) return true;

  await ref.update({ attempts: d.attempts + 1 });
  return false;
}

module.exports = { createPromo, checkRateLimit, DISC_PCT, EXPIRY_HRS };
