// Vercel Serverless Function — proxies Flutterwave API calls to keep the secret key off the browser.
// Required environment variables in Vercel:
//   FLUTTERWAVE_SECRET_KEY   — your Flutterwave secret key
//   FIREBASE_API_KEY         — your Firebase web API key (already in your HTML, safe to repeat here)

const FLW_BASE       = 'https://api.flutterwave.com/v3';
const FLW_SECRET     = process.env.FLUTTERWAVE_SECRET_KEY;
const FIREBASE_KEY   = process.env.FIREBASE_API_KEY;

/* Verify Firebase ID token so only your logged-in admin can call this function */
async function verifyFirebaseToken(idToken) {
  if (!idToken) return false;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_KEY}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ idToken })
      }
    );
    const data = await res.json();
    return !!(data.users && data.users.length > 0);
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

  // ── Auth check ──────────────────────────────────────────
  const authHeader = (req.headers.authorization || '').trim();
  const idToken    = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!idToken) {
    return res.status(401).json({ error: 'Unauthorized — no token provided' });
  }
  const valid = await verifyFirebaseToken(idToken);
  if (!valid) {
    return res.status(401).json({ error: 'Unauthorized — invalid or expired token' });
  }

  // ── Secret key check ────────────────────────────────────
  if (!FLW_SECRET) {
    return res.status(500).json({ error: 'FLUTTERWAVE_SECRET_KEY environment variable is not set in Vercel.' });
  }

  const flwHeaders = { Authorization: `Bearer ${FLW_SECRET}` };
  const { action } = req.query;

  try {
    // ── Transactions ────────────────────────────────────
    if (action === 'transactions') {
      const params = new URLSearchParams({ count: '100' });
      if (req.query.from) params.set('from', req.query.from);
      if (req.query.to)   params.set('to',   req.query.to);

      const flwRes = await fetch(`${FLW_BASE}/transactions?${params}`, { headers: flwHeaders });
      const data   = await flwRes.json();
      return res.status(flwRes.status).json(data);
    }

    // ── Balance ─────────────────────────────────────────
    if (action === 'balance') {
      const flwRes = await fetch(`${FLW_BASE}/balances`, { headers: flwHeaders });
      const data   = await flwRes.json();
      return res.status(flwRes.status).json(data);
    }

    // ── Settlements ─────────────────────────────────────
    if (action === 'settlements') {
      const flwRes = await fetch(`${FLW_BASE}/settlements`, { headers: flwHeaders });
      const data   = await flwRes.json();
      return res.status(flwRes.status).json(data);
    }

    return res.status(400).json({ error: 'Unknown action. Use: transactions | balance | settlements' });

  } catch (e) {
    return res.status(500).json({ error: 'Failed to reach Flutterwave API: ' + e.message });
  }
};
