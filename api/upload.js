const handler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
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
