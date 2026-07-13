'use strict';

const { db }        = require('./_lib/firebase-admin');
const { sendEmail } = require('./_lib/resend');
const { buildDay3, buildDay6, buildDay8 } = require('./_lib/emails');
const { resolveRecommendation }           = require('./_lib/recommend');
const { createPromo }                     = require('./_lib/promo');

const BUILDERS = { day3: buildDay3, day6: buildDay6, day8: buildDay8 };

const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
const SIX_DAYS   = 6 * 24 * 60 * 60 * 1000;
const EIGHT_DAYS = 8 * 24 * 60 * 60 * 1000;

const AWAITING_STAGES = [
  { key: 'h1',  ms: 1  * 60 * 60 * 1000 },
  { key: 'h12', ms: 12 * 60 * 60 * 1000 },
  { key: 'h24', ms: 24 * 60 * 60 * 1000 },
];

module.exports = async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if ((req.headers.authorization || '').trim() !== 'Bearer ' + cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const now     = Date.now();
  const results = { awaitingPayment: {}, followUps: {} };

  // ── 1. Awaiting-payment reminders ──────────────────────────────────────────
  try {
    const sent   = [];
    const errors = [];
    const snap   = await db.collection('orders').where('orderStatus', '==', 'awaiting_payment').get();

    for (const doc of snap.docs) {
      const order = doc.data();
      if (!order.customerEmail || !order.createdAt) continue;

      const age       = now - new Date(order.createdAt).getTime();
      const reminders = order.awaitingReminders || {};

      for (const stage of AWAITING_STAGES) {
        if (age < stage.ms)       continue;
        if (reminders[stage.key]) continue;

        try {
          const { buildAwaitingPaymentReminder } = require('./_lib/emails');
          const email = buildAwaitingPaymentReminder({
            customerName: order.customerName || '',
            orderRef:     order.orderRef     || doc.id,
            items:        order.items        || [],
            totalNGN:     order.totalNGN     || order.total || 0,
            stage:        stage.key,
          });
          await sendEmail({ to: order.customerEmail, subject: email.subject, html: email.html });
          await db.collection('orders').doc(doc.id).update({ [`awaitingReminders.${stage.key}`]: true });
          sent.push({ orderId: doc.id, stage: stage.key });
        } catch (e) {
          console.error('[cron] awaiting-payment failed', stage.key, doc.id, e.message);
          errors.push({ orderId: doc.id, stage: stage.key, error: e.message });
        }
      }
    }
    results.awaitingPayment = { sent: sent.length, errors: errors.length };
  } catch (err) {
    console.error('[cron] awaiting-payment fatal:', err);
    results.awaitingPayment = { error: err.message };
  }

  // ── 2. Follow-up emails (day3, day6, day8) ────────────────────────────────
  try {
    const sent    = [];
    const skipped = [];
    const errors  = [];
    const snap    = await db.collection('followUps').where('optedOut', '==', false).get();

    for (const doc of snap.docs) {
      const fu = doc.data();
      if (!fu.email || !fu.deliveredAt) continue;

      const age = now - new Date(fu.deliveredAt).getTime();
      const due = [];
      if (age >= THREE_DAYS && fu.day3 === 'pending') due.push('day3');
      if (age >= SIX_DAYS   && fu.day6 === 'pending') due.push('day6');
      if (age >= EIGHT_DAYS && fu.day8 === 'pending') due.push('day8');

      if (due.length === 0) { skipped.push(fu.orderId); continue; }

      let order = {};
      try {
        const os = await db.collection('orders').doc(fu.orderId).get();
        if (os.exists) order = os.data();
      } catch (e) { console.error('[cron] order load failed', fu.orderId, e.message); }

      const baseData = {
        token:            fu.token,
        customerName:     fu.customerName      || '',
        items:            order.items           || [],
        totalNGN:         order.totalNGN        || order.total || 0,
        colourPreference: order.colourPreference || '',
      };

      for (const stage of due) {
        try {
          const fuRef    = db.collection('followUps').doc(fu.orderId);
          const eventRef = db.collection('events').doc();
          let emailData  = baseData;
          let recSource  = null;

          if (stage === 'day8') {
            const rec = await resolveRecommendation(fu, order);
            recSource = rec.source;
            if (rec.source === 'skipped') {
              await fuRef.update({ day8: 'skipped', recommendationSource: 'skipped' });
              skipped.push(fu.orderId + ':day8');
              continue;
            }
            await fuRef.update({
              recommendedProductId:   rec.productId,
              recommendedProductName: rec.name,
              recommendedPriceNGN:    rec.priceNGN,
              recommendedPitch:       rec.pitch,
              recommendationSource:   rec.source,
            });
            let promoDoc = null;
            try {
              promoDoc = await createPromo({ followUpId: fu.orderId, productId: rec.productId, productName: rec.name });
              await fuRef.update({ promoCode: promoDoc.code, promoExpiresAt: promoDoc.expiresAt });
            } catch (e) { console.error('[cron] promo creation failed', fu.orderId, e.message); }

            emailData = {
              ...baseData,
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

          const email = BUILDERS[stage](emailData);
          await sendEmail({ to: fu.email, subject: email.subject, html: email.html });

          const batch = db.batch();
          batch.update(fuRef, { [stage]: 'sent' });
          batch.set(eventRef, {
            orderId:   fu.orderId,
            type:      'email_sent',
            metadata:  recSource ? { stage, recommendationSource: recSource } : { stage },
            createdAt: new Date().toISOString(),
          });
          await batch.commit();
          sent.push({ orderId: fu.orderId, stage });
        } catch (e) {
          console.error('[cron] follow-up failed', stage, fu.orderId, e.message);
          errors.push({ orderId: fu.orderId, stage, error: e.message });
        }
      }
    }
    results.followUps = { sent: sent.length, skipped: skipped.length, errors: errors.length };
  } catch (err) {
    console.error('[cron] follow-ups fatal:', err);
    results.followUps = { error: err.message };
  }

  return res.status(200).json({ ok: true, ...results });
};
