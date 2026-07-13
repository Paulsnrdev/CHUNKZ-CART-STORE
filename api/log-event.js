'use strict';

const { db } = require('./_lib/firebase-admin');

const ALLOWED = new Set(['upsell_shown', 'upsell_clicked', 'upsell_referred']);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { token, type, metadata } = req.body || {};
  if (!token || !type || !ALLOWED.has(type)) return res.status(400).end();

  try {
    const snap = await db.collection('followUps').where('token', '==', String(token)).limit(1).get();
    if (snap.empty) return res.status(404).end();
    const orderId = snap.docs[0].data().orderId;

    await db.collection('events').add({
      orderId,
      type,
      metadata: (metadata && typeof metadata === 'object') ? metadata : {},
      createdAt: new Date().toISOString(),
    });
    return res.status(200).end();
  } catch (err) {
    console.error('[log-event]', err);
    return res.status(500).end();
  }
};
