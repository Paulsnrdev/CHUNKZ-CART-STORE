'use strict';

const { db } = require('../_lib/firebase-admin');

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = (req.headers.authorization || '').trim();
  const idToken    = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!verifyAdminToken(idToken)) return res.status(401).json({ error: 'Unauthorized' });

  const docRef = db.collection('settings').doc('promoConfig');

  if (req.method === 'GET') {
    try {
      const snap = await docRef.get();
      const data = snap.exists ? snap.data() : {};
      return res.status(200).json({
        ok:               true,
        promoDiscountPct: data.promoDiscountPct != null ? data.promoDiscountPct : 15,
        promoExpiryHrs:   data.promoExpiryHrs   != null ? data.promoExpiryHrs   : 72,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const pct = parseInt((req.body || {}).promoDiscountPct, 10);
    const hrs = parseInt((req.body || {}).promoExpiryHrs,   10);
    if (isNaN(pct) || pct < 1 || pct > 99)  return res.status(400).json({ error: 'promoDiscountPct must be 1–99' });
    if (isNaN(hrs) || hrs < 1 || hrs > 720) return res.status(400).json({ error: 'promoExpiryHrs must be 1–720' });
    try {
      await docRef.set({ promoDiscountPct: pct, promoExpiryHrs: hrs }, { merge: true });
      return res.status(200).json({ ok: true, promoDiscountPct: pct, promoExpiryHrs: hrs });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
