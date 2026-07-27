const handler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // GET: proxy Cloudinary image through Vercel
  if (req.method === 'GET') {
    const { url } = req.query;
    if (!url || !url.startsWith('https://res.cloudinary.com/')) {
      return res.status(400).end('Bad request');
    }
    try {
      const r = await fetch(url);
      if (!r.ok) return res.status(r.status).end();
      const contentType = r.headers.get('content-type') || 'image/jpeg';
      const buf = Buffer.from(await r.arrayBuffer());
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.end(buf);
    } catch (e) {
      return res.status(500).end(e.message);
    }
  }

  // POST: upload image to Cloudinary
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'No image provided' });

    const params = new URLSearchParams();
    params.append('file', image);
    params.append('upload_preset', 'chunkz_upload');

    const r = await fetch('https://api.cloudinary.com/v1_1/dt7px3ltu/image/upload', {
      method: 'POST',
      body: params
    });
    const data = await r.json();

    if (data.secure_url) return res.json({ url: data.secure_url });
    return res.status(400).json({ error: (data.error && data.error.message) || 'Upload failed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

handler.config = { api: { bodyParser: { sizeLimit: '4mb' } } };
module.exports = handler;
