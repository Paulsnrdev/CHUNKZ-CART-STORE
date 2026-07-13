'use strict';

const { db }        = require('./_lib/firebase-admin');
const { sendEmail } = require('./_lib/resend');
const { buildDay0, buildDay3, buildDay6, buildDay8 } = require('./_lib/emails');
const { resolveRecommendation } = require('./_lib/recommend');
const { createPromo }           = require('./_lib/promo');

const BUILDERS = { day0: buildDay0, day3: buildDay3, day6: buildDay6, day8: buildDay8 };

function verifyAdminToken(idToken) {
  if (!idToken) return false;
  try {
    const parts   = idToken.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload.aud === 'chunkz-store' && payload.email === 'brodahsegunofib@gmail.com';
  } catch (e) { return false; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = (req.headers.authorization || '').trim();
  const idToken    = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!verifyAdminToken(idToken)) return res.status(401).json({ error: 'Unauthorized' });

  const action = (req.query.action || '').toLowerCase();

  // ── followup ───────────────────────────────────────────────────────────────
  if (action === 'followup') {
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
        return res.status(200).json({ ok: true, followUp: fu, order: { items: order.items || [], customerEmail: order.customerEmail } });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    if (req.method === 'POST') {
      const { action: bodyAction, orderId, stage } = req.body || {};
      if (!orderId || !stage) return res.status(400).json({ error: 'orderId and stage required' });
      if (!['day0','day3','day6','day8'].includes(stage)) return res.status(400).json({ error: 'invalid stage' });
      if (!['trigger','resend','cancel'].includes(bodyAction)) return res.status(400).json({ error: 'action must be trigger, resend, or cancel' });

      try {
        const fuRef    = db.collection('followUps').doc(orderId);
        const orderRef = db.collection('orders').doc(orderId);
        const [fuSnap, orderSnap] = await Promise.all([fuRef.get(), orderRef.get()]);

        if (!fuSnap.exists)    return res.status(404).json({ error: 'Follow-up not found' });
        if (!orderSnap.exists) return res.status(404).json({ error: 'Order not found' });

        const fu    = fuSnap.data();
        const order = orderSnap.data();

        if (bodyAction === 'cancel') {
          await fuRef.update({ [stage]: 'cancelled' });
          return res.status(200).json({ ok: true });
        }

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

          let promoDoc = null;
          if (fu.promoCode) {
            promoDoc = { code: fu.promoCode, discountPct: 15, expiresAt: fu.promoExpiresAt };
          } else {
            try {
              promoDoc = await createPromo({ followUpId: orderId, productId: rec.productId, productName: rec.name });
              await fuRef.update({ promoCode: promoDoc.code, promoExpiresAt: promoDoc.expiresAt });
            } catch (e) {
              console.error('[admin followup] promo creation failed', e.message);
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
        console.error('[admin followup]', err);
        return res.status(500).json({ error: err.message });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── preview-email ──────────────────────────────────────────────────────────
  if (action === 'preview-email') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { orderId } = req.query;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });

    try {
      const [fuSnap, orderSnap] = await Promise.all([
        db.collection('followUps').doc(orderId).get(),
        db.collection('orders').doc(orderId).get(),
      ]);

      if (!fuSnap.exists) return res.status(404).json({ error: 'Follow-up not found' });

      const fu    = fuSnap.data();
      const order = orderSnap.exists ? orderSnap.data() : {};

      if (!fu.recommendedProductId) {
        return res.status(400).json({ error: 'No recommendation set. Resolve or override recommendation first.' });
      }

      const priceNGN    = fu.recommendedPriceNGN || 0;
      const discountPct = fu.promoCode ? 15 : 0;

      const email = buildDay8({
        token:            fu.token,
        customerName:     fu.customerName      || '',
        items:            order.items           || [],
        totalNGN:         order.totalNGN        || order.total || 0,
        colourPreference: order.colourPreference || '',
        upsell: {
          name:     fu.recommendedProductName || '',
          imageUrl: fu.recommendedProductId,
          priceNGN,
          pitch:    fu.recommendedPitch || '',
        },
        promo: fu.promoCode ? {
          code:            fu.promoCode,
          discountPct,
          originalPrice:   priceNGN,
          discountedPrice: Math.round(priceNGN * (100 - discountPct) / 100),
          expiresAt:       fu.promoExpiresAt || '',
        } : null,
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(email.html);
    } catch (err) {
      console.error('[admin preview-email]', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── metrics ────────────────────────────────────────────────────────────────
  if (action === 'metrics') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
      const [eventsSnap, reviewsSnap, promoSnap, fuSnap] = await Promise.all([
        db.collection('events').get(),
        db.collection('reviews').get(),
        db.collection('promoCodes').where('redeemed', '==', true).get(),
        db.collection('followUps').get(),
      ]);

      const events = eventsSnap.docs.map(d => d.data());
      const emailSentByStage   = { day0: 0, day3: 0, day6: 0, day8: 0 };
      const emailOpenedByStage = { day0: 0, day3: 0, day6: 0, day8: 0 };
      let upsellShown = 0, upsellClicked = 0, upsellPurchased = 0, upsellReferred = 0, referralNewCustomers = 0;

      for (const ev of events) {
        if (ev.type === 'email_sent')  { const s = ev.metadata && ev.metadata.stage; if (emailSentByStage.hasOwnProperty(s))   emailSentByStage[s]++; }
        if (ev.type === 'link_opened') { const s = ev.metadata && ev.metadata.stage; if (emailOpenedByStage.hasOwnProperty(s)) emailOpenedByStage[s]++; }
        if (ev.type === 'upsell_shown')     upsellShown++;
        if (ev.type === 'upsell_clicked')   upsellClicked++;
        if (ev.type === 'upsell_referred')  upsellReferred++;
        if (ev.type === 'upsell_purchased') { upsellPurchased++; if (ev.metadata && ev.metadata.isReferral) referralNewCustomers++; }
      }

      const fuMap    = {};
      const bySource = {};
      for (const doc of fuSnap.docs) {
        const fu = doc.data();
        fuMap[fu.orderId || doc.id] = fu;
        const src = fu.recommendationSource;
        if (src && src !== 'skipped') {
          if (!bySource[src]) bySource[src] = { offered: 0, purchased: 0 };
          bySource[src].offered++;
        }
      }

      let upsellRevenueNGN = 0;
      for (const doc of promoSnap.docs) {
        const p  = doc.data();
        const fu = fuMap[p.followUpId];
        if (fu) {
          const src = fu.recommendationSource || 'unknown';
          if (!bySource[src]) bySource[src] = { offered: 0, purchased: 0 };
          bySource[src].purchased++;
          upsellRevenueNGN += (fu.recommendedPriceNGN || 0) * (1 - (p.discountPct || 15) / 100);
        }
      }

      const totalEmailsSent = Object.values(emailSentByStage).reduce((a,b) => a+b, 0);
      const totalOpened     = Object.values(emailOpenedByStage).reduce((a,b) => a+b, 0);
      const reviews         = reviewsSnap.docs.map(d => d.data());
      const reviewCount     = reviews.length;
      const avgRating       = reviewCount ? reviews.reduce((s,r) => s + (r.rating || 0), 0) / reviewCount : 0;

      return res.status(200).json({
        ok: true,
        emails: { sentByStage: emailSentByStage, openedByStage: emailOpenedByStage, totalSent: totalEmailsSent, totalOpened, openRate: totalEmailsSent > 0 ? Math.round((totalOpened / totalEmailsSent) * 100) : 0 },
        upsell: { shown: upsellShown, clicked: upsellClicked, purchased: upsellPurchased, conversionRate: upsellShown > 0 ? Math.round((upsellPurchased / upsellShown) * 100) : 0, clickRate: upsellShown > 0 ? Math.round((upsellClicked / upsellShown) * 100) : 0 },
        referrals: { shared: upsellReferred, newCustomers: referralNewCustomers, conversionRate: upsellReferred > 0 ? Math.round((referralNewCustomers / upsellReferred) * 100) : 0 },
        revenue: { upsellNGN: Math.round(upsellRevenueNGN) },
        bySource,
        reviews: { count: reviewCount, avgRating: Math.round(avgRating * 10) / 10, items: reviews.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 50) },
      });
    } catch (err) {
      console.error('[admin metrics]', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── settings ───────────────────────────────────────────────────────────────
  if (action === 'settings') {
    const docRef = db.collection('settings').doc('promoConfig');

    if (req.method === 'GET') {
      try {
        const snap = await docRef.get();
        const data = snap.exists ? snap.data() : {};
        return res.status(200).json({
          ok:               true,
          promoDiscountPct: data.promoDiscountPct != null ? data.promoDiscountPct : 15,
          promoExpiryHrs:   data.promoExpiryHrs   != null ? data.promoExpiryHrs   : 72,
        });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    if (req.method === 'POST') {
      const pct = parseInt((req.body || {}).promoDiscountPct, 10);
      const hrs = parseInt((req.body || {}).promoExpiryHrs,   10);
      if (isNaN(pct) || pct < 1 || pct > 99)  return res.status(400).json({ error: 'promoDiscountPct must be 1–99' });
      if (isNaN(hrs) || hrs < 1 || hrs > 720) return res.status(400).json({ error: 'promoExpiryHrs must be 1–720' });
      try {
        await docRef.set({ promoDiscountPct: pct, promoExpiryHrs: hrs }, { merge: true });
        return res.status(200).json({ ok: true, promoDiscountPct: pct, promoExpiryHrs: hrs });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(400).json({ error: 'action must be followup, preview-email, metrics, or settings' });
};
