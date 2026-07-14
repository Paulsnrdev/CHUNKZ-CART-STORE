/**
 * Firestore collection schemas for the Chunkz follow-up system.
 * These are JSDoc type definitions — they provide IDE intellisense
 * for the server-side Vercel functions.
 *
 * All reads/writes to these collections happen via the Firebase Admin SDK
 * in server-side functions. Customers never access these collections directly
 * from the browser. Firestore security rules enforce this.
 */

/**
 * /orders/{orderRef}  — EXISTING, do not restructure.
 *
 * @typedef {Object} Order
 * @property {string}  orderRef
 * @property {string}  orderStatus     - 'awaiting_payment'|'confirmed'|'processing'|'dispatched'|'delivered'
 * @property {string}  paymentMethod   - 'flutterwave'|'opay'
 * @property {string}  trackingNumber
 * @property {string}  customerName
 * @property {string}  customerEmail
 * @property {string}  customerPhone
 * @property {string}  deliveryAddress
 * @property {string}  deliveryZone
 * @property {number}  deliveryFeeNGN
 * @property {string}  colourPreference
 * @property {string}  descriptionNote
 * @property {OrderItem[]} items
 * @property {number}  total
 * @property {string}  currency        - 'NGN'|'USD'|'GBP'|'CAD'
 * @property {number}  totalNGN
 * @property {string}  timestamp       - ISO 8601 creation time
 * @property {string}  [deliveredAt]   - ISO 8601; stamped by trigger in Phase 2
 */

/**
 * @typedef {Object} OrderItem
 * @property {string} name
 * @property {string} collection  - the product pid / category key
 * @property {string} size
 * @property {number} qty
 * @property {number} price
 * @property {string} currency
 */

/**
 * /followUps/{autoId}
 *
 * Created when an order transitions to 'delivered'.
 * Token is the only identifier exposed in customer-facing URLs.
 *
 * @typedef {Object} FollowUp
 * @property {string}  orderId
 * @property {string}  email
 * @property {string}  token            - 32-byte hex; used in /follow-up/<token> URLs
 * @property {string}  deliveredAt      - ISO 8601
 * @property {StageStatus} day0
 * @property {StageStatus} day3
 * @property {StageStatus} day6
 * @property {StageStatus} day8
 * @property {boolean} optedOut
 * @property {string|null}  promoCode
 * @property {string|null}  expiresAt           - ISO 8601; promo expiry
 * @property {string}       createdAt           - ISO 8601
 * @property {string|null}  recommendedProductId
 * @property {RecommendationSource|null} recommendationSource
 * @property {string|null}  adminOverrideProductId
 * @property {string|null}  adminOverridePitch
 */

/**
 * @typedef {'pending'|'sent'|'opened'|'completed'|'cancelled'} StageStatus
 */

/**
 * @typedef {'admin_override'|'manual_pairing'|'claude'|'skipped'} RecommendationSource
 */

/**
 * /products/{slugId}
 *
 * The recommendation catalogue. Separate from the existing /catalog collection
 * which drives the storefront. This collection drives follow-up recommendations.
 * Document IDs are kebab-case slugs (e.g. 'chunkz-hoodie') for stable pairsWith references.
 *
 * @typedef {Object} Product
 * @property {string}   name
 * @property {number}   priceNgn
 * @property {string}   imageUrl
 * @property {ProductCategory} category
 * @property {string[]} pairsWith                 - array of product document IDs
 * @property {boolean}  active
 * @property {boolean}  excludeFromRecommendations
 * @property {string}   createdAt                 - ISO 8601
 */

/**
 * @typedef {'tee'|'hoodie'|'tracksuit'|'jersey'|'sweatshirt'|'shorts'|'cargo'|'longsleeve'|'combo'} ProductCategory
 */

/**
 * /reviews/{autoId}
 *
 * @typedef {Object} Review
 * @property {string}  orderId
 * @property {number}  rating     - 1–5
 * @property {string}  comment
 * @property {string}  createdAt  - ISO 8601
 */

/**
 * /promoCodes/{code}
 *
 * Document ID IS the code string (e.g. 'CHUNKZ-XXXXXX') for direct lookup.
 * Transferable — a friend can redeem it. Not bound to the original customer's email.
 *
 * @typedef {Object} PromoCode
 * @property {string}       code
 * @property {string}       referredBy         - originating orderId
 * @property {string}       productId
 * @property {number}       discountPercent
 * @property {boolean}      redeemed
 * @property {string|null}  redeemedByEmail
 * @property {string|null}  redeemedAt         - ISO 8601
 * @property {string}       expiresAt          - ISO 8601
 * @property {string}       createdAt          - ISO 8601
 */

/**
 * /events/{autoId}
 *
 * Append-only audit log for the follow-up funnel.
 *
 * @typedef {Object} FunnelEvent
 * @property {string}    orderId
 * @property {EventType} type
 * @property {Object}    metadata
 * @property {string}    createdAt  - ISO 8601
 */

/**
 * @typedef {'email_sent'|'link_opened'|'checkin_response'|'review_submitted'|'upsell_shown'|'upsell_clicked'|'upsell_referred'|'upsell_purchased'} EventType
 */

module.exports = {};
