'use strict';

const { db }        = require('./_lib/firebase-admin');
const { sendEmail } = require('./_lib/resend');
const { buildAwaitingPaymentReminder } = require('./_lib/emails');

const STAGES = [
  { key: 'h1',  ms: 1  * 60 * 60 * 1000 },
  { key: 'h12', ms: 12 * 60 * 60 * 1000 },
  { key: 'h24', ms: 24 * 60 * 60 * 1000 },
];

module.exports = async function handler(req, res) {
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

  const now    = Date.now();
  const sent   = [];
  const errors = [];

  try {
    const snap = await db.collection('orders')
      .where('orderStatus', '==', 'awaiting_payment')
      .get();

    for (const doc of snap.docs) {
      const order = doc.data();
      if (!order.customerEmail || !order.createdAt) continue;

      const age       = now - new Date(order.createdAt).getTime();
      const reminders = order.awaitingReminders || {};

      for (const stage of STAGES) {
        if (age < stage.ms) continue;    // not due yet
        if (reminders[stage.key]) continue; // already sent

        try {
          const email = buildAwaitingPaymentReminder({
            customerName: order.customerName || '',
            orderRef:     order.orderRef     || doc.id,
            items:        order.items        || [],
            totalNGN:     order.totalNGN     || order.total || 0,
            stage:        stage.key,
          });
          await sendEmail({ to: order.customerEmail, subject: email.subject, html: email.html });
          await db.collection('orders').doc(doc.id).update({
            [`awaitingReminders.${stage.key}`]: true,
          });
          sent.push({ orderId: doc.id, stage: stage.key });
          console.log('[cron-awaiting-payment] sent', stage.key, doc.id);
        } catch (e) {
          console.error('[cron-awaiting-payment] failed', stage.key, doc.id, e.message);
          errors.push({ orderId: doc.id, stage: stage.key, error: e.message });
        }
      }
    }

    const summary = { ok: true, sent: sent.length, errors: errors.length, detail: { sent, errors } };
    console.log('[cron-awaiting-payment]', JSON.stringify(summary));
    return res.status(200).json(summary);
  } catch (err) {
    console.error('[cron-awaiting-payment] fatal:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
