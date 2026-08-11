'use strict';

// Vercel Serverless Function — proxies Paystack API calls to keep the secret key off the browser.
// Required environment variable in Vercel: PAYSTACK_SECRET_KEY

const PST_BASE   = 'https://api.paystack.co';
const PST_SECRET = process.env.PAYSTACK_SECRET_KEY;

function verifyAdminToken(idToken) {
  if (!idToken) return false;
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return (
      payload.aud   === 'chunkz-store' &&
      payload.email === 'brodahsegunofib@gmail.com'
    );
  } catch (e) {
    return false;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = (req.headers.authorization || '').trim();
  const idToken    = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!idToken)               return res.status(401).json({ error: 'Unauthorized — no token provided' });
  if (!verifyAdminToken(idToken)) return res.status(401).json({ error: 'Unauthorized — token does not match admin account' });

  if (!PST_SECRET) {
    return res.status(500).json({ error: 'PAYSTACK_SECRET_KEY environment variable is not set in Vercel.' });
  }

  const pstHeaders = { Authorization: `Bearer ${PST_SECRET}` };
  const { action } = req.query;

  try {
    if (action === 'transactions') {
      const params = new URLSearchParams({ perPage: '100' });
      if (req.query.from) params.set('from', req.query.from);
      if (req.query.to)   params.set('to',   req.query.to);
      const r = await fetch(`${PST_BASE}/transaction?${params}`, { headers: pstHeaders });
      return res.status(r.status).json(await r.json());
    }

    if (action === 'balance') {
      const r = await fetch(`${PST_BASE}/balance`, { headers: pstHeaders });
      return res.status(r.status).json(await r.json());
    }

    if (action === 'transfers') {
      const params = new URLSearchParams({ perPage: '100' });
      if (req.query.from) params.set('from', req.query.from);
      if (req.query.to)   params.set('to',   req.query.to);
      const r = await fetch(`${PST_BASE}/transfer?${params}`, { headers: pstHeaders });
      return res.status(r.status).json(await r.json());
    }

    if (action === 'settlements') {
      const params = new URLSearchParams({ perPage: '100' });
      if (req.query.from) params.set('from', req.query.from);
      if (req.query.to)   params.set('to',   req.query.to);
      const r = await fetch(`${PST_BASE}/settlement?${params}`, { headers: pstHeaders });
      return res.status(r.status).json(await r.json());
    }

    return res.status(400).json({ error: 'Unknown action. Use: transactions | balance | transfers | settlements' });

  } catch (e) {
    return res.status(500).json({ error: 'Failed to reach Paystack API: ' + e.message });
  }
};
