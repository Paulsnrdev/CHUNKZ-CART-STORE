'use strict';

// Fast-forward a followUp's deliveredAt so you can test Day 3/6/8 emails
// without waiting. Backdates the timestamp so the next cron run treats the
// order as N days old.
//
// Usage:
//   node scripts/fast-forward.js <orderId> <days>
//
// Examples:
//   node scripts/fast-forward.js ORDER123 3   → triggers Day 3 on next cron
//   node scripts/fast-forward.js ORDER123 6   → triggers Day 3 + Day 6
//   node scripts/fast-forward.js ORDER123 8   → triggers all three

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { db } = require('../api/_lib/firebase-admin');

async function main() {
  const [orderId, daysStr] = process.argv.slice(2);

  if (!orderId || !daysStr) {
    console.error('Usage: node scripts/fast-forward.js <orderId> <days>');
    process.exit(1);
  }

  const days = parseFloat(daysStr);
  if (isNaN(days) || days < 0) {
    console.error('Error: days must be a positive number');
    process.exit(1);
  }

  const fakeDeliveredAt = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const docRef = db.collection('followUps').doc(orderId);
  const snap   = await docRef.get();

  if (!snap.exists) {
    console.error('Error: no followUp found for orderId:', orderId);
    process.exit(1);
  }

  await docRef.update({ deliveredAt: fakeDeliveredAt });

  console.log('');
  console.log('✓', orderId);
  console.log('  deliveredAt →', fakeDeliveredAt, '(' + days + ' days ago)');
  console.log('');
  console.log('  Stage readiness:');
  console.log('    day3:', days >= 3 ? 'DUE NOW' : 'in ' + (3 - days).toFixed(1) + ' days');
  console.log('    day6:', days >= 6 ? 'DUE NOW' : 'in ' + (6 - days).toFixed(1) + ' days');
  console.log('    day8:', days >= 8 ? 'DUE NOW' : 'in ' + (8 - days).toFixed(1) + ' days');
  console.log('');
  console.log('  Run the cron manually:');
  console.log('    curl -s https://<your-domain>/api/cron-send-followups | jq');
  console.log('  Or locally (DRY_RUN=true):');
  console.log('    DRY_RUN=true node -e "require(\'./api/cron-send-followups\')({method:\'GET\',headers:{}},{status:c=>({json:r=>(console.log(JSON.stringify(r,null,2)),r)}),setHeader:()=>{}})"');
  console.log('');

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
