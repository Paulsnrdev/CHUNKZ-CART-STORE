'use strict';

const { db, storageSrcToUrl } = require('./firebase-admin');
const Anthropic = require('@anthropic-ai/sdk');

// Flatten catalog into an eligible product list.
// Filters: hidden, excludeFromRecommendations, outOfStock, same-as-bought.
async function getEligibleProducts(boughtSrc) {
  const snap = await db.collection('catalog').get();
  const eligible = [];
  for (const doc of snap.docs) {
    const cat = doc.data();
    for (const img of (cat.images || [])) {
      if (!img || !img.src)               continue;
      if (img.hidden)                     continue;
      if (img.excludeFromRecommendations) continue;
      if (img.outOfStock)                 continue;
      if (img.src === boughtSrc)          continue;
      eligible.push({
        productId: img.src,
        name:      img.name    || doc.id,
        priceNGN:  img.ngn     || 0,
        category:  cat.title   || doc.id,
        imageUrl:  storageSrcToUrl(img.src),
        pairsWith: img.pairsWith || [],
      });
    }
  }
  return eligible;
}

// Find one catalog image entry by its src URL.
async function findProductBySrc(src) {
  if (!src) return null;
  const snap = await db.collection('catalog').get();
  for (const doc of snap.docs) {
    const img = (doc.data().images || []).find(i => i && i.src === src);
    if (img) return { ...img, catTitle: doc.data().title || doc.id };
  }
  return null;
}

// Ask Claude to SELECT the best product AND write a pitch.
async function askClaudeSelect(purchasedName, purchasedCategory, eligible) {
  const client  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const catalog = eligible.map(p =>
    `ID: ${p.productId}\nName: ${p.name}\nCategory: ${p.category}`
  ).join('\n\n');

  const msg = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 250,
    messages: [{
      role:    'user',
      content: `You are a recommendation engine for Chunkz, a Nigerian urban streetwear brand.

Customer bought: "${purchasedName}"${purchasedCategory ? ' (' + purchasedCategory + ')' : ''}.

Eligible products (pick ONE):
${catalog}

Choose the single best complementary product. Write a pitch in Chunkz's voice — confident, urban, street energy. Under 20 words.

Respond with ONLY valid JSON, no extra text:
{"productId":"<exact ID from above>","pitch":"<one-line pitch>"}`,
    }],
  });

  const text  = (msg.content[0]?.text || '').trim();
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) throw new Error('No JSON in Claude response: ' + text.slice(0, 80));
  return JSON.parse(match[0]);
}

// Ask Claude to write pitch copy only — selection already decided.
async function askClaudePitch(purchasedName, productName) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages: [{
        role:    'user',
        content: `Write a one-line pitch for Chunkz (Nigerian urban streetwear brand, confident voice, under 20 words).
Customer bought "${purchasedName}". We're recommending "${productName}".
Reply with ONLY the pitch text, nothing else.`,
      }],
    });
    return (msg.content[0]?.text || '').trim() || null;
  } catch (e) {
    console.warn('[recommend] pitch gen failed:', e.message);
    return null;
  }
}

// ── Main resolver ────────────────────────────────────────────────────────────
// Returns: { source, productId, name, imageUrl, priceNGN, pitch }
// source: 'admin_override' | 'manual_pairing' | 'claude' | 'skipped'
async function resolveRecommendation(followUp, order) {
  const SKIP        = { source: 'skipped', productId: null, name: null, imageUrl: null, priceNGN: null, pitch: null };
  const boughtSrc   = ((order.items || [])[0] || {}).src || '';
  const purchasedName = ((order.items || [])[0] || {}).name || 'your order';

  // ── Tier 1: Admin manual override ──────────────────────────────────────────
  if (followUp.adminOverrideProductId) {
    const prod = await findProductBySrc(followUp.adminOverrideProductId);
    if (!prod || prod.hidden || prod.excludeFromRecommendations) {
      console.warn('[recommend] admin override product ineligible:', followUp.adminOverrideProductId);
      return SKIP;
    }
    const pitch = followUp.adminOverridePitch
      || await askClaudePitch(purchasedName, prod.name)
      || `The perfect companion to your ${purchasedName}.`;
    return { source: 'admin_override', productId: prod.src, name: prod.name || '', imageUrl: prod.src, priceNGN: prod.ngn || 0, pitch };
  }

  // Build eligible list (used by tiers 2 + 3)
  const eligible = await getEligibleProducts(boughtSrc);
  if (eligible.length === 0) {
    console.warn('[recommend] no eligible products for', followUp.orderId);
    return SKIP;
  }

  // Look up what the customer actually bought so we can read its pairsWith
  const purchasedProd = await findProductBySrc(boughtSrc);

  // ── Tier 2: Manual pairing ──────────────────────────────────────────────────
  if (purchasedProd && Array.isArray(purchasedProd.pairsWith) && purchasedProd.pairsWith.length > 0) {
    const pairedEligible = eligible.filter(e => purchasedProd.pairsWith.includes(e.productId));
    if (pairedEligible.length > 0) {
      const picked = pairedEligible[Math.floor(Math.random() * pairedEligible.length)];
      const pitch  = await askClaudePitch(purchasedName, picked.name)
        || `The perfect companion to your ${purchasedName}.`;
      return { source: 'manual_pairing', productId: picked.productId, name: picked.name, imageUrl: picked.imageUrl, priceNGN: picked.priceNGN, pitch };
    }
  }

  // ── Tier 3: Claude fallback ─────────────────────────────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[recommend] ANTHROPIC_API_KEY not set — skipping Day 8 for', followUp.orderId);
    return SKIP;
  }
  try {
    const clRes     = await askClaudeSelect(purchasedName, purchasedProd?.catTitle || '', eligible);
    const validated = eligible.find(e => e.productId === clRes.productId);
    if (!validated) throw new Error('Claude returned invalid productId: ' + String(clRes.productId).slice(0, 60));
    return {
      source:    'claude',
      productId: validated.productId,
      name:      validated.name,
      imageUrl:  validated.imageUrl,
      priceNGN:  validated.priceNGN,
      pitch:     String(clRes.pitch || '').trim(),
    };
  } catch (e) {
    console.error('[recommend] Claude failed for', followUp.orderId, '—', e.message);
    return SKIP; // Tier 4: safe fallback
  }
}

module.exports = { resolveRecommendation };
