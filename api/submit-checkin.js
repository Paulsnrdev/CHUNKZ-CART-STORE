'use strict';

const { db } = require('./_lib/firebase-admin');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, response, comment } = req.body || {};
  if (!token || !response) return res.status(400).json({ error: 'token and response are required' });
  if (response !== 'positive' && response !== 'negative') {
    return res.status(400).json({ error: 'response must be positive or negative' });
  }

  try {
    const snap = await db.collection('followUps').where('token', '==', token).limit(1).get();
    if (snap.empty) return res.status(404).json({ error: 'invalid_token' });

    const followUp = snap.docs[0].data();
    if (followUp.optedOut) return res.status(400).json({ error: 'opted_out' });

    const now         = new Date().toISOString();
    const followUpRef = db.collection('followUps').doc(followUp.orderId);
    const eventRef    = db.collection('events').doc();
    const batch       = db.batch();

    batch.update(followUpRef, { day3: 'completed' });
    batch.set(eventRef, {
      orderId:   followUp.orderId,
      type:      'checkin_response',
      metadata:  { response, comment: comment || '' },
      createdAt: now,
    });
    await batch.commit();

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[submit-checkin]', err);
    return res.status(500).json({ error: 'server_error' });
  }
};
