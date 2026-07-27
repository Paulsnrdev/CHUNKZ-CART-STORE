module.exports = async (req, res) => {
  const { url } = req.query;
  if (!url || !url.startsWith('https://res.cloudinary.com/')) {
    res.status(400).end('Bad request');
    return;
  }
  try {
    const r = await fetch(url);
    if (!r.ok) { res.status(r.status).end(); return; }
    const contentType = r.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await r.arrayBuffer());
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': buf.length,
    });
    res.end(buf);
  } catch (e) {
    res.status(500).end(e.message);
  }
};
