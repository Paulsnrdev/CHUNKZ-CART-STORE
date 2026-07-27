const handler = async (req, res) => {
  const { url } = req.query;
  if (!url || !url.startsWith('https://res.cloudinary.com/')) {
    return res.status(400).json({ error: 'Bad request' });
  }
  try {
    const r = await fetch(url);
    if (!r.ok) return res.status(r.status).json({ error: 'Upstream error' });
    const contentType = r.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200);
    res.end(buf);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

handler.config = { api: { bodyParser: false } };
module.exports = handler;
