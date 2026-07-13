'use strict';

const { db }                              = require('../_lib/firebase-admin');
const { sendEmail }                       = require('../_lib/resend');
const { buildDay0, buildDay3, buildDay6, buildDay8 } = require('../_lib/emails');
const { resolveRecommendation }           = require('../_lib/recommend');
const { createPromo }                     = require('../_lib/promo');

function verifyAdminToken(idToken) {
  if (!idToken) return false;
  try {
    const parts   = idToken.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload.aud === 'chunkz-store' && payload.email === 'brodahsegunofib@gmail.com';
  } catch (e) { return false; }
}

const BUILDERS = { day0: buildDay0, day3: buildDay3, day6: buildDay6, day8: buildDay8 };

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = (req.headers.authorization || '').trim();
  const idToken    = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!verifyAdminToken(idToken)) return res.status(401).json({ error: 'Unauthorized' });

  // GET — return followUp doc for an order
  if (req.method === 'GET') {
    const { orderId } = req.query;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });

    try {
      const [fuSnap, orderSnap] = await Promise.all([
        db.collection('followUps').doc(orderId).get(),
        db.collection('orders').doc(orderId).get(),
      ]);

      if (!fuSnap.exists) return res.status(404).json({ error: 'No follow-up found for this order' });

      const fu    = fuSnap.data();
      const order = orderSnap.exists ? orderSnap.data() : {};

      return res.status(200).json({
        ok: true,
        followUp: fu,
        order: { items: order.items || [], customerEmail: order.customerEmail },
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — trigger / resend / cancel a stage
  if (req.method === 'POST') {
    const { action, orderId, stage } = req.body || {};
    if (!orderId || !stage) return res.status(400).json({ error: 'orderId and stage required' });
    if (!['day0','day3','day6','day8'].includes(stage)) return res.status(400).json({ error: 'invalid stage' });
    if (!['trigger','resend','cancel'].includes(action)) return res.status(400).json({ error: 'action must be trigger, resend, or cancel' });

    try {
      const fuRef    = db.collection('followUps').doc(orderId);
      const orderRef = db.collection('orders').doc(orderId);
      const [fuSnap, orderSnap] = await Promise.all([fuRef.get(), orderRef.get()]);

      if (!fuSnap.exists)    return res.status(404).json({ error: 'Follow-up not found' });
      if (!orderSnap.exists) return res.status(404).json({ error: 'Order not found' });

      const fu    = fuSnap.data();
      const order = orderSnap.data();

      if (action === 'cancel') {
        await fuRef.update({ [stage]: 'cancelled' });
        return res.status(200).json({ ok: true });
      }

      // trigger or resend — build and send the email
      if (!fu.email) return res.status(400).json({ error: 'No email address on follow-up record' });

      const emailData = {
        token:            fu.token,
        customerName:     fu.customerName      || '',
        orderRef:         order.orderRef        || orderId,
        items:            order.items           || [],
        totalNGN:         order.totalNGN        || order.total || 0,
        colourPreference: order.colourPreference || '',
      };

      let stageEmailData = emailData;

      if (stage === 'day8') {
        // Use stored recommendation if present, otherwise resolve fresh
        let rec;
        if (fu.recommendedProductId) {
          rec = {
            productId: fu.recommendedProductId,
            name:      fu.recommendedProductName || '',
            priceNGN:  fu.recommendedPriceNGN    || 0,
            pitch:     fu.recommendedPitch        || '',
            imageUrl:  fu.recommendedProductId,
            source:    fu.recommendationSource   || 'stored',
          };
        } else {
          rec = await resolveRecommendation(fu, order);
          if (rec.source !== 'skipped') {
            await fuRef.update({
              recommendedProductId:   rec.productId,
              recommendedProductName: rec.name,
              recommendedPriceNGN:    rec.priceNGN,
              recommendedPitch:       rec.pitch,
              recommendationSource:   rec.source,
            });
          }
        }

        if (rec.source === 'skipped') {
          return res.status(400).json({ error: 'No eligible recommendation. Set an override first.' });
        }

        // Use existing promo code if present, else generate a new one
        let promoDoc = null;
        if (fu.promoCode) {
          promoDoc = { code: fu.promoCode, discountPct: 15, expiresAt: fu.promoExpiresAt };
        } else {
          try {
            promoDoc = await createPromo({ followUpId: orderId, productId: rec.productId, productName: rec.name });
            await fuRef.update({ promoCode: promoDoc.code, promoExpiresAt: promoDoc.expiresAt });
          } catch (e) {
            console.error('[admin/followup] promo creation failed', e.message);
          }
        }

        stageEmailData = {
          ...emailData,
          upsell: { name: rec.name, imageUrl: rec.imageUrl, priceNGN: rec.priceNGN, pitch: rec.pitch },
          promo:  promoDoc ? {
            code:            promoDoc.code,
            discountPct:     promoDoc.discountPct,
            originalPrice:   rec.priceNGN,
            discountedPrice: Math.round(rec.priceNGN * (100 - promoDoc.discountPct) / 100),
            expiresAt:       promoDoc.expiresAt,
          } : null,
        };
      }

      const email = BUILDERS[stage](stageEmailData);
      await sendEmail({ to: fu.email, subject: email.subject, html: email.html });

      const batch = db.batch();
      batch.update(fuRef, { [stage]: 'sent' });
      batch.set(db.collection('events').doc(), {
        orderId,
        type:      'email_sent',
        metadata:  { stage, adminTriggered: true },
        createdAt: new Date().toISOString(),
      });
      await batch.commit();

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[admin/followup]', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
