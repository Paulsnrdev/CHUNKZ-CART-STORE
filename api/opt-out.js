'use strict';

const { db } = require('./_lib/firebase-admin');

const PAGE_SUCCESS = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unsubscribed — Chunkz</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0a0a0a;font-family:'Segoe UI',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
  .card{max-width:400px;width:100%;text-align:center;padding:48px 32px}
  .check{font-size:48px;margin-bottom:20px;color:#2a9d8f}
  h1{font-size:26px;font-weight:900;letter-spacing:3px;color:#ffffff;text-transform:uppercase;margin-bottom:14px}
  p{font-size:15px;color:#888888;line-height:1.6;margin-bottom:28px}
  a{display:inline-block;color:#e63946;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:1px}
  a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="card">
  <div class="check">&#10003;</div>
  <h1>Unsubscribed</h1>
  <p>You won't receive any more follow-up emails from us.<br>Your order history is unaffected.</p>
  <a href="/">&#8592; Back to Chunkz</a>
</div>
</body>
</html>`;

const PAGE_ERROR = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invalid Link — Chunkz</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0a0a0a;font-family:'Segoe UI',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
  .card{max-width:400px;width:100%;text-align:center;padding:48px 32px}
  h1{font-size:24px;font-weight:900;color:#ffffff;margin-bottom:14px}
  p{font-size:15px;color:#888888;line-height:1.6}
</style>
</head>
<body>
<div class="card">
  <h1>Invalid Link</h1>
  <p>This unsubscribe link is invalid or has already been used.</p>
</div>
</body>
</html>`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — unsubscribe confirmation page (linked from emails)
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const { token } = req.query;
    if (!token) return res.status(400).send(PAGE_ERROR);

    try {
      const snap = await db.collection('followUps').where('token', '==', token).limit(1).get();
      if (snap.empty) return res.status(404).send(PAGE_ERROR);
      await snap.docs[0].ref.update({ optedOut: true });
      return res.status(200).send(PAGE_SUCCESS);
    } catch (err) {
      console.error('[opt-out GET]', err);
      return res.status(500).send(PAGE_ERROR);
    }
  }

  // POST — called from follow-up page JS, returns JSON
  if (req.method === 'POST') {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token is required' });

    try {
      const snap = await db.collection('followUps').where('token', '==', token).limit(1).get();
      if (snap.empty) return res.status(404).json({ error: 'invalid_token' });
      await db.collection('followUps').doc(snap.docs[0].id).update({ optedOut: true });
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[opt-out POST]', err);
      return res.status(500).json({ error: 'server_error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
