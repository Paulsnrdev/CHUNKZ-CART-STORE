'use strict';

const { db } = require('./_lib/firebase-admin');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token is required' });

  try {
    const snap = await db.collection('followUps').where('token', '==', token).limit(1).get();
    if (snap.empty) return res.status(404).json({ error: 'invalid_token' });

    await db.collection('followUps').doc(snap.docs[0].id).update({ optedOut: true });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[opt-out]', err);
    return res.status(500).json({ error: 'server_error' });
  }
};
