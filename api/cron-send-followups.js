'use strict';

const { db }                          = require('./_lib/firebase-admin');
const { sendEmail }                   = require('./_lib/resend');
const { buildDay3, buildDay6, buildDay8 } = require('./_lib/emails');
const { resolveRecommendation }       = require('./_lib/recommend');
const { createPromo }                 = require('./_lib/promo');

const THREE_DAYS   = 3 * 24 * 60 * 60 * 1000;
const SIX_DAYS     = 6 * 24 * 60 * 60 * 1000;
const EIGHT_DAYS   = 8 * 24 * 60 * 60 * 1000;

const BUILDERS = {
  day3: buildDay3,
  day6: buildDay6,
  day8: buildDay8,
};

module.exports = async function handler(req, res) {
  // Vercel sets Authorization: Bearer <CRON_SECRET> on cron requests.
  // If CRON_SECRET is configured, reject anything that doesn't match.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = (req.headers.authorization || '').trim();
    if (auth !== 'Bearer ' + cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const now     = Date.now();
  const sent    = [];
  const skipped = [];
  const errors  = [];

  try {
    const snap = await db.collection('followUps').where('optedOut', '==', false).get();

    for (const doc of snap.docs) {
      const fu = doc.data();
      if (!fu.email || !fu.deliveredAt) continue;

      const age = now - new Date(fu.deliveredAt).getTime();

      const due = [];
      if (age >= THREE_DAYS  && fu.day3 === 'pending') due.push('day3');
      if (age >= SIX_DAYS    && fu.day6 === 'pending') due.push('day6');
      if (age >= EIGHT_DAYS  && fu.day8 === 'pending') due.push('day8');

      if (due.length === 0) {
        skipped.push(fu.orderId);
        continue;
      }

      let order = {};
      try {
        const orderSnap = await db.collection('orders').doc(fu.orderId).get();
        if (orderSnap.exists) order = orderSnap.data();
      } catch (e) {
        console.error('[cron] order load failed', fu.orderId, e.message);
      }

      const emailData = {
        token:            fu.token,
        customerName:     fu.customerName     || '',
        items:            order.items          || [],
        totalNGN:         order.totalNGN       || order.total || 0,
        colourPreference: order.colourPreference || '',
      };

      for (const stage of due) {
        try {
          const fuRef    = db.collection('followUps').doc(fu.orderId);
          const eventRef = db.collection('events').doc();

          // Day 8: resolve recommendation + generate promo code before building email
          let stageEmailData = emailData;
          let recSource      = null;
          if (stage === 'day8') {
            const rec = await resolveRecommendation(fu, order);
            recSource = rec.source;
            if (rec.source === 'skipped') {
              // Safe fallback — mark skipped and move on, do not send a broken email
              await fuRef.update({ day8: 'skipped', recommendationSource: 'skipped' });
              console.log('[cron] day8 skipped (no eligible recommendation)', fu.orderId);
              skipped.push(fu.orderId + ':day8');
              continue;
            }
            // Persist recommendation so resolve-token and follow-up page can read it
            await fuRef.update({
              recommendedProductId:   rec.productId,
              recommendedProductName: rec.name,
              recommendedPriceNGN:    rec.priceNGN,
              recommendedPitch:       rec.pitch,
              recommendationSource:   rec.source,
            });

            // Generate a unique promo code for this follow-up
            let promoDoc = null;
            try {
              promoDoc = await createPromo({
                followUpId:  fu.orderId,
                productId:   rec.productId,
                productName: rec.name,
              });
              await fuRef.update({ promoCode: promoDoc.code, promoExpiresAt: promoDoc.expiresAt });
            } catch (e) {
              console.error('[cron] promo creation failed', fu.orderId, e.message);
            }

            stageEmailData = {
              ...emailData,
              upsell: {
                name:     rec.name,
                imageUrl: rec.imageUrl,
                priceNGN: rec.priceNGN,
                pitch:    rec.pitch,
              },
              promo: promoDoc ? {
                code:            promoDoc.code,
                discountPct:     promoDoc.discountPct,
                originalPrice:   rec.priceNGN,
                discountedPrice: Math.round(rec.priceNGN * (100 - promoDoc.discountPct) / 100),
                expiresAt:       promoDoc.expiresAt,
              } : null,
            };
          }

          const email    = BUILDERS[stage](stageEmailData);
          const metadata = recSource ? { stage, recommendationSource: recSource } : { stage };

          await sendEmail({ to: fu.email, subject: email.subject, html: email.html });

          const batch = db.batch();
          batch.update(fuRef, { [stage]: 'sent' });
          batch.set(eventRef, {
            orderId:   fu.orderId,
            type:      'email_sent',
            metadata,
            createdAt: new Date().toISOString(),
          });
          await batch.commit();

          sent.push({ orderId: fu.orderId, stage });
          console.log('[cron] sent', stage, fu.orderId);
        } catch (e) {
          console.error('[cron] failed', stage, fu.orderId, e.message);
          errors.push({ orderId: fu.orderId, stage, error: e.message });
        }
      }
    }

    const summary = { ok: true, sent: sent.length, skipped: skipped.length, errors: errors.length, detail: { sent, errors } };
    console.log('[cron-send-followups]', JSON.stringify(summary));
    return res.status(200).json(summary);
  } catch (err) {
    console.error('[cron-send-followups] fatal:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
