'use strict';

const { db } = require('./_lib/firebase-admin');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const type = (req.query.type || '').toLowerCase();
  if (type !== 'checkin' && type !== 'review') {
    return res.status(400).json({ error: 'type must be checkin or review' });
  }

  const { token, response, comment, rating } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token is required' });

  try {
    const snap = await db.collection('followUps').where('token', '==', token).limit(1).get();
    if (snap.empty) return res.status(404).json({ error: 'invalid_token' });

    const followUp    = snap.docs[0].data();
    const followUpRef = db.collection('followUps').doc(followUp.orderId);
    const eventRef    = db.collection('events').doc();
    const now         = new Date().toISOString();

    if (followUp.optedOut) return res.status(400).json({ error: 'opted_out' });

    if (type === 'checkin') {
      if (!response) return res.status(400).json({ error: 'response is required' });
      if (response !== 'positive' && response !== 'negative') {
        return res.status(400).json({ error: 'response must be positive or negative' });
      }

      const batch = db.batch();
      batch.update(followUpRef, { day3: 'completed' });
      batch.set(eventRef, {
        orderId:   followUp.orderId,
        type:      'checkin_response',
        metadata:  { response, comment: comment || '' },
        createdAt: now,
      });
      await batch.commit();
      return res.status(200).json({ ok: true });
    }

    // type === 'review'
    if (!rating) return res.status(400).json({ error: 'rating is required' });
    const ratingNum = parseInt(rating, 10);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: 'rating must be 1-5' });
    }
    if (followUp.day6 === 'completed') return res.status(400).json({ error: 'already_reviewed' });

    const reviewRef = db.collection('reviews').doc(followUp.orderId);
    const batch     = db.batch();
    batch.set(reviewRef, { orderId: followUp.orderId, rating: ratingNum, comment: comment || '', createdAt: now });
    batch.update(followUpRef, { day6: 'completed' });
    batch.set(eventRef, {
      orderId:   followUp.orderId,
      type:      'review_submitted',
      metadata:  { rating: ratingNum },
      createdAt: now,
    });
    await batch.commit();
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('[submit-feedback]', err);
    return res.status(500).json({ error: 'server_error' });
  }
};
