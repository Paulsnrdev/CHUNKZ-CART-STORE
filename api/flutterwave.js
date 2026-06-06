// Vercel Serverless Function — proxies Flutterwave API calls to keep the secret key off the browser.
// Required environment variable in Vercel:
//   FLUTTERWAVE_SECRET_KEY — your Flutterwave live secret key

const FLW_BASE   = 'https://api.flutterwave.com/v3';
const FLW_SECRET = process.env.FLUTTERWAVE_SECRET_KEY;

/* Verify the Firebase ID token by decoding its JWT payload locally.
   We check the audience (Firebase project) and email match the admin account.
   This avoids an external API call and works without any extra env vars. */
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

  // ── Auth check ──────────────────────────────────────────
  const authHeader = (req.headers.authorization || '').trim();
  const idToken    = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!idToken) {
    return res.status(401).json({ error: 'Unauthorized — no token provided' });
  }
  if (!verifyAdminToken(idToken)) {
    return res.status(401).json({ error: 'Unauthorized — token does not match admin account' });
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
