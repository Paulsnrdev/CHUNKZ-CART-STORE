# Chunkz Cart — Technical Reference

Full-stack e-commerce store built on static HTML + vanilla JS, deployed on Vercel, backed by Firebase Firestore, Resend email, Claude AI, and Flutterwave/OPay payments.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Static HTML / vanilla JS (no framework) |
| Hosting | Vercel (static + serverless functions) |
| Database | Firebase Firestore |
| Auth | Firebase Authentication (Email/Password) |
| Storage | Firebase Storage (product images) |
| Email | Resend |
| Payments | Flutterwave (card) + OPay (manual transfer) |
| AI | Anthropic Claude API (Day 8 recommendation) |
| Cron | Vercel Cron Jobs |

---

## Environment Variables (Vercel)

Set all of these in **Vercel → Project → Settings → Environment Variables**.

| Variable | Description |
|---|---|
| `FIREBASE_PROJECT_ID` | Firebase project ID (e.g. `chunkz-store`) |
| `FIREBASE_CLIENT_EMAIL` | Service account client email |
| `FIREBASE_PRIVATE_KEY` | Service account private key (with literal `\n` for newlines) |
| `RESEND_API_KEY` | Resend API key for transactional email |
| `RESEND_FROM` | Sender address (e.g. `Chunkz <orders@yourdomain.com>`) |
| `SITE_URL` | Production URL (e.g. `https://chunkzcart.vercel.app`) |
| `ANTHROPIC_API_KEY` | Claude API key for Day 8 AI recommendations |
| `FLUTTERWAVE_SECRET_KEY` | Flutterwave secret key |
| `CRON_SECRET` | Random secret used to authenticate Vercel cron requests |

### Firebase Admin Key Setup

1. Firebase Console → Project Settings → Service Accounts → Generate new private key
2. Download the JSON file
3. Copy `project_id` → `FIREBASE_PROJECT_ID`
4. Copy `client_email` → `FIREBASE_CLIENT_EMAIL`
5. Copy `private_key` (the full `-----BEGIN PRIVATE KEY-----...` string) → `FIREBASE_PRIVATE_KEY`
   - In Vercel's UI, paste the key exactly as-is; Vercel escapes `\n` automatically
   - The code in `api/_lib/firebase-admin.js` does `.replace(/\\n/g, '\n')` to restore real newlines

### Rotating the Firebase Key

If the service account key is ever exposed:
1. Google Cloud Console → IAM & Admin → Service Accounts → select the account → Keys → delete the old key
2. Add key → Create new key → JSON → download
3. Update all three Vercel env vars and redeploy

---

## Resend Setup

1. Sign up at resend.com
2. Add and verify your sending domain
3. Create an API key with `Full access` or `Sending access`
4. Set `RESEND_API_KEY` and `RESEND_FROM` in Vercel

---

## Firebase Setup

### Firestore Collections

| Collection | Purpose |
|---|---|
| `orders` | All customer orders |
| `catalog` | Product catalogue (categories + images) |
| `settings` | Site-wide config (`siteConfig`, `promoConfig`) |
| `followUps` | Per-order follow-up state (doc ID = orderId) |
| `events` | Analytics event log |
| `reviews` | Customer reviews (doc ID = orderId) |
| `promoCodes` | Issued promo codes (doc ID = code string) |
| `rateLimits` | Brute-force rate limiting for promo validate |

### Firestore Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /orders/{orderId} {
      allow create: if true;
      allow get:    if true;
      allow list, update, delete: if request.auth != null;
    }
    match /catalog/{docId} {
      allow read:  if true;
      allow write: if request.auth != null;
    }
    match /settings/{docId} {
      allow read:  if true;
      allow write: if request.auth != null;
    }
    match /reviews/{docId} {
      allow read:  if request.auth != null;
      allow write: if true;
    }
    match /followUps/{docId} {
      allow read, write: if request.auth != null;
    }
    match /events/{docId} {
      allow read:  if request.auth != null;
      allow create: if true;
    }
    match /promoCodes/{docId} {
      allow read:  if request.auth != null;
      allow write: if request.auth != null;
    }
    match /rateLimits/{docId} {
      allow read, write: if true;
    }
  }
}
```

### Admin User

Firebase Console → Authentication → Email/Password → Add user → use `brodahsegunofib@gmail.com` + a strong password. This is the only account with admin dashboard access.

---

## Vercel Deployment

1. Connect GitHub repo to Vercel
2. Set all environment variables (see above)
3. Push to `main` → Vercel auto-deploys

**`vercel.json`** configures:
- `crons` — daily follow-up email dispatch at 08:00 UTC
- `redirects` — clean URLs (`/admin.html` → `/bestsite`)
- `rewrites` — serve HTML files at clean paths
- `headers` — cache control, CSP, security headers

---

## How the Delivered Trigger Hooks In

The entire follow-up sequence starts when you mark an order as **Delivered** in the admin dashboard:

```
Admin panel → expand order → Status dropdown → "Delivered" → Save
                    ↓
        POST /api/mark-delivered  (with Firebase ID token)
                    ↓
        Firestore: orders/{id}.orderStatus = 'delivered'
        Firestore: followUps/{id} created with all stages 'pending'
                    ↓
        Day 0 email sent immediately (order confirmation + review CTA)
        followUps/{id}.day0 = 'sent'
```

The cron job (`/api/cron-send-followups`, runs daily at 08:00 UTC) then picks up pending stages:

```
Day 3  (3+ days after deliveredAt)  → Review nudge email
Day 6  (6+ days after deliveredAt)  → Thank-you / check-in
Day 8  (8+ days after deliveredAt)  → Upsell email with personalised recommendation + promo code
```

Each stage is idempotent — if a stage is already `sent`, `opened`, or `cancelled`, the cron skips it.

---

## Follow-up Page Token System

Every follow-up doc gets a unique 64-char hex `token`. Emails contain links like:

```
https://yourstore.com/follow-up/{token}
```

`GET /api/resolve-token?token=...` resolves the token to order data, marks the stage as `opened`, and returns the data for the follow-up page to render.

The follow-up page (`follow-up.html`) renders different content per stage:
- **day0** — order summary
- **day3** — review request
- **day6** — check-in / satisfaction
- **day8** — upsell offer with product image, promo code, countdown, share buttons

---

## Recommendation Engine (`api/_lib/recommend.js`)

Day 8 picks a recommendation in this priority order:

1. **admin_override** — admin manually set `adminOverrideProductId` on the followUp doc
2. **manual_pairing** — the purchased product has `pairsWith` entries in the catalog
3. **claude** — calls Claude API to suggest a product from the catalog
4. **skipped** — no eligible product found; Day 8 is skipped

The override can be set any time before Day 8 sends via the admin dashboard (Orders tab → expand a delivered order → Follow-up section → Override Recommendation).

---

## Promo Code System

### Code Format

`CHUNKZ-XXXXXX` where X is from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no ambiguous chars).

### Flow

1. Day 8 cron generates a code via `createPromo()` and persists it to `promoCodes` collection
2. Code is tied to: `followUpId` (originating orderId), `productId`, `discountPct`, `expiresAt`
3. Customer receives the code in the Day 8 email and on the follow-up page
4. **Validation** — `POST /api/promo/validate` with `{ code, cartItems }`:
   - Rate-limited: 5 attempts per IP per 10 minutes
   - Checks: exists → not redeemed → not expired → product in cart
   - Returns `discountAmountNGN` (server-computed; client never supplies the amount)
5. **Redemption** — `POST /api/promo/redeem` with `{ code, orderId, email }` called client-side after successful payment:
   - Verifies orderId exists in Firestore (prevents fake redemptions)
   - Idempotent for the same orderId
   - Detects referral: compares buyer email vs original order's `customerEmail`
   - Cancels remaining pending follow-up stages for the original order
   - Logs `upsell_purchased` event

### Transferability

Codes are **NOT** bound to the original customer's email. A friend can redeem it. The redemption is tagged `isReferral: true` if the buyer email differs from the original order email.

### Default Settings

Configure via **Admin → Settings** tab:
- **Discount %** — default 10%
- **Expiry** — default 72 hours

Settings are stored in `settings/promoConfig` and read by `createPromo()` on each invocation.

---

## How the Promo Field Wires into Checkout

`index.html` has a promo code input in the checkout modal (currently visible to all users; can be made visible-only-with-link by hiding `#promoFg` unless `?promo=CODE` is in the URL).

### Deep-link flow

```
Follow-up page "Buy Now" → /?promo=CHUNKZ-XXXXXX
                                ↓
                    checkout modal opens
                    prefilledPromoCode read from URL
                    applyPromoCode() called after 100ms delay
                                ↓
                    POST /api/promo/validate
                    discountAmountNGN returned
                    discount displayed in cart
                                ↓
                    Customer places order
                    finalTotal = grandTotal - discount (in cart currency)
                                ↓
                    After payment success:
                    redeemPromo(code, orderId, email)  ← fire-and-forget
```

### Currency conversion

The server returns `discountAmountNGN`. The client converts using the same rates used throughout the store (`PROMO_RATES = { NGN:1, USD:1375, GBP:1820, CAD:975 }`).

The server never trusts a client-supplied discount amount.

---

## Admin Dashboard

| URL | Purpose |
|---|---|
| `/bestsite` | Orders, analytics, follow-up control, metrics, reviews, settings |
| `/catalog-admin` | Catalogue management, promo settings, pairing gaps |

### Admin Panel Tabs

**Orders & Analytics**
- Revenue stats, order charts, collections breakdown
- Per-order expansion: address, items, status update controls
- Delivered orders: follow-up stage status (sent/opened/cancelled) with Send / Resend / Cancel per stage
- Recommendation override: product picker + custom pitch + Preview button (renders Day 8 email HTML)

**Payments** — Flutterwave balance, transactions, transfers

**Metrics** — Email funnel, upsell funnel, revenue, referral stats, conversion by recommendation source

**Reviews** — All submitted customer reviews with rating + comment

**Settings** — Promo code discount % and expiry hours

### Catalog Admin Features

- Add / edit / delete categories and products
- Upload images to Firebase Storage
- Toggle `excludeFromRecommendations` per product
- Define `pairsWith` pairings (Day 8 manual pairing source)
- **Pairing Gaps** — shows products with no pairings where Claude will be the fallback; click "Add Pairings" to jump straight to that product's editor
- Sale discount toggle (store-wide)
- Promo code default settings

---

## Dry-Run / Fast-Forward Testing

### Test the promo flow end-to-end

1. Manually create a followUp doc in Firestore for a test order:
   ```json
   {
     "orderId": "test-order-1",
     "email": "your@email.com",
     "customerName": "Test User",
     "token": "abc123",
     "deliveredAt": "<ISO timestamp 9 days ago>",
     "day0": "sent", "day3": "sent", "day6": "sent", "day8": "pending",
     "optedOut": false
   }
   ```
2. Hit `GET /api/cron-send-followups` manually (add `Authorization: Bearer <CRON_SECRET>`) — it will resolve a recommendation, generate a promo code, and send the Day 8 email.
3. Check the email; click Buy Now link; apply code at checkout; complete a test payment.
4. Check `promoCodes` collection — code should be `redeemed: true`.

### Fast-forward a follow-up sequence

In admin.html: expand a delivered order → Follow-up section → use **Send Now** button on any pending stage to immediately send that email (bypasses age checks, uses existing recommendation/promo).

### Test the validate endpoint

```bash
curl -X POST https://yoursite.com/api/promo/validate \
  -H "Content-Type: application/json" \
  -d '{"code":"CHUNKZ-XXXXXX","cartItems":[{"name":"Test","src":"...","price":25000,"currency":"NGN","qty":1}]}'
```

---

## Vercel Cron Config

In `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron-send-followups", "schedule": "0 8 * * *" }
  ]
}
```

Vercel sets `Authorization: Bearer <CRON_SECRET>` on the request. The handler rejects requests without a matching header if `CRON_SECRET` is set.

To test manually without waiting for the schedule:
- Vercel Dashboard → your project → Cron Jobs → trigger manually, or
- `curl -H "Authorization: Bearer <CRON_SECRET>" https://yoursite.com/api/cron-send-followups`
