module.exports = async (req, res) => {
  const { url } = req.query;
  if (!url || !url.startsWith('https://res.cloudinary.com/')) {
    return res.status(400).end('Bad request');
  }
  try {
    const r = await fetch(url);
    if (!r.ok) return res.status(r.status).end();
    const contentType = r.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    const buf = Buffer.from(await r.arrayBuffer());
    res.send(buf);
  } catch (e) {
    res.status(500).end(e.message);
  }
};
