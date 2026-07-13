'use strict';

const { db } = require('../_lib/firebase-admin');

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = (req.headers.authorization || '').trim();
  const idToken    = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!verifyAdminToken(idToken)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const [eventsSnap, reviewsSnap, promoSnap, fuSnap] = await Promise.all([
      db.collection('events').get(),
      db.collection('reviews').get(),
      db.collection('promoCodes').where('redeemed', '==', true).get(),
      db.collection('followUps').get(),
    ]);

    const events = eventsSnap.docs.map(d => d.data());

    // Email funnel
    const emailSentByStage   = { day0: 0, day3: 0, day6: 0, day8: 0 };
    const emailOpenedByStage = { day0: 0, day3: 0, day6: 0, day8: 0 };

    // Upsell funnel
    let upsellShown     = 0;
    let upsellClicked   = 0;
    let upsellPurchased = 0;
    let upsellReferred  = 0;
    let referralNewCustomers = 0;

    for (const ev of events) {
      if (ev.type === 'email_sent') {
        const s = ev.metadata && ev.metadata.stage;
        if (emailSentByStage.hasOwnProperty(s)) emailSentByStage[s]++;
      }
      if (ev.type === 'link_opened') {
        const s = ev.metadata && ev.metadata.stage;
        if (emailOpenedByStage.hasOwnProperty(s)) emailOpenedByStage[s]++;
      }
      if (ev.type === 'upsell_shown')     upsellShown++;
      if (ev.type === 'upsell_clicked')   upsellClicked++;
      if (ev.type === 'upsell_referred')  upsellReferred++;
      if (ev.type === 'upsell_purchased') {
        upsellPurchased++;
        if (ev.metadata && ev.metadata.isReferral) referralNewCustomers++;
      }
    }

    // Build followUp map for source breakdown and revenue
    const fuMap = {};
    for (const doc of fuSnap.docs) {
      const fu = doc.data();
      fuMap[fu.orderId || doc.id] = fu;
    }

    const bySource = {};
    for (const doc of fuSnap.docs) {
      const fu  = doc.data();
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

    const reviews     = reviewsSnap.docs.map(d => d.data());
    const reviewCount = reviews.length;
    const avgRating   = reviewCount
      ? reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviewCount
      : 0;

    return res.status(200).json({
      ok: true,
      emails: {
        sentByStage:   emailSentByStage,
        openedByStage: emailOpenedByStage,
        totalSent:     totalEmailsSent,
        totalOpened:   totalOpened,
        openRate:      totalEmailsSent > 0 ? Math.round((totalOpened / totalEmailsSent) * 100) : 0,
      },
      upsell: {
        shown:          upsellShown,
        clicked:        upsellClicked,
        purchased:      upsellPurchased,
        conversionRate: upsellShown > 0 ? Math.round((upsellPurchased / upsellShown) * 100) : 0,
        clickRate:      upsellShown > 0 ? Math.round((upsellClicked / upsellShown) * 100) : 0,
      },
      referrals: {
        shared:         upsellReferred,
        newCustomers:   referralNewCustomers,
        conversionRate: upsellReferred > 0 ? Math.round((referralNewCustomers / upsellReferred) * 100) : 0,
      },
      revenue: {
        upsellNGN: Math.round(upsellRevenueNGN),
      },
      bySource,
      reviews: {
        count:     reviewCount,
        avgRating: Math.round(avgRating * 10) / 10,
        items:     reviews
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 50),
      },
    });
  } catch (err) {
    console.error('[admin/metrics]', err);
    return res.status(500).json({ error: err.message });
  }
};
