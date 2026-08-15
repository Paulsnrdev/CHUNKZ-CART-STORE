const PROJECT_ID = 'chunkz-store';

function toFsValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean')          return { booleanValue: val };
  if (typeof val === 'number')           return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (typeof val === 'string')           return { stringValue: val };
  if (Array.isArray(val))               return { arrayValue: { values: val.map(toFsValue) } };
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) fields[k] = toFsValue(v);
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const order = req.body;
  if (!order || !order.orderRef) return res.status(400).json({ error: 'Missing orderRef' });

  const fields = {};
  for (const [key, val] of Object.entries(order)) fields[key] = toFsValue(val);

  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/orders/${order.orderRef}`;

  try {
    const r = await fetch(url, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ fields })
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('[save-order] Firestore error:', JSON.stringify(data));
      return res.status(500).json({ error: data });
    }
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('[save-order] fetch error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
