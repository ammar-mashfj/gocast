---
feature: Billing and checkout (OxaPay)
verified: 2026-10-19 uncommitted work on feat/dashboard-design
sources:
  - api/database/migrations/2026_10_19_120000_create_billing_tables.php
  - api/app/Models/Product.php
  - api/app/Models/Discount.php
  - api/app/Models/Payment.php
  - api/app/Services/Billing/Pricing.php
  - api/app/Services/Billing/Quote.php
  - api/app/Services/Billing/Checkout.php
  - api/app/Services/Billing/PaymentProcessor.php
  - api/app/Services/Billing/OxaPaySignature.php
  - api/app/Services/Billing/Gateway/OxaPayGateway.php
  - api/app/Services/Billing/Gateway/FakeGateway.php
  - api/app/Services/Billing/Grants/PlanTermGrant.php
  - api/app/Services/PlanTerm.php
  - api/app/Http/Controllers/BillingController.php
  - api/app/Http/Controllers/OxaPayWebhookController.php
  - api/app/Http/Controllers/Admin/PaymentController.php
  - api/app/Http/Controllers/Admin/ProductController.php
  - api/app/Http/Controllers/Admin/DiscountController.php
  - api/app/Console/Commands/ReconcilePayments.php
  - api/app/Console/Commands/SimulatePaymentWebhook.php
  - api/app/Console/Commands/RemindRenewals.php
  - api/app/Notifications/PlanRenewalReminder.php
  - api/config/services.php
  - client/lib/billing.ts
  - client/lib/billing-catalog.ts
  - client/contexts/ProCheckoutContext.tsx
  - client/components/dashboard/billing/ProCheckoutDialog.tsx
  - client/components/dashboard/billing/PaymentStatusDialog.tsx
  - client/components/dashboard/billing/ProPrice.tsx
  - api/app/Models/CardPaymentInterest.php
fingerprint: eee727b512daace8
---

# Billing and checkout

Pro is bought in the dashboard and paid in crypto through OxaPay's hosted invoice page. A signed webhook grants the plan. No human is involved unless something goes wrong. This replaces the old "Request Pro → payment email → Approve" flow. `/admin/requests` still exists for older rows, Custom enquiries and gifts.

## What is for sale: data, not code

| Table | What it holds |
|---|---|
| `products` | One sellable thing: `name`, `slug`, `price_usd`, `grant_type` (`plan_term` only), `plan_id`, `duration_unit` (`week`/`month`), `duration_count`, `badge`, `description`, `sort`. `active` = buyable at all; `visible` = listed in the dialog (a hidden, active product is bought by link only). |
| `discounts` | A coupon when `code` is set (stored upper-case), an automatic sale when it is null. Exactly one of `percent_off` / `amount_off_usd`. Optional `starts_at`/`ends_at`, `max_redemptions`, `per_user_limit`. `discount_product` pivot; no rows = every product. |
| `payments` | One checkout, with a snapshot of the product and price (`product_name`, `plan_id`, duration, `list_price_usd`, `discount_code`, `discount_usd`, `amount_usd`), plus OxaPay's `track_id`, `payment_url` and `status` (lower-cased), `paid_at`, `granted_at` (the once-only marker), `granted_until`, `review_reason`, the last `payload`, and `reminded_7d_at` / `reminded_1d_at`. `uuid` is the public id and the OxaPay `order_id`. |

The migration seeds the four terms the payment email used to quote: Pro 1/3/6/12 months at $20/$52/$96/$160, with "Best value" on 12 months. Everything after that is edited at `/admin/billing/products` and `/admin/billing/discounts`. A new kind of benefit (not "a plan for a term") needs one class implementing `Grants\PurchaseGrant`, added to `Grants::for()`.

**Pricing rules** (`Pricing`): list price minus at most one discount. Discounts never stack. The running automatic sale that takes off the most applies to everyone. A coupon replaces it only when it takes off more; otherwise the quote carries `coupon_error` "The sale price is already lower than this coupon." Nothing may go below $1 (`MIN_CENTS`). A coupon that would is refused, and a sale that would is ignored. Coupon refusals, in the buyer's words: not valid, not valid yet, expired, doesn't apply to {product}, already used, you've already used this coupon.

## The flow

1. Every Get Pro button in the dashboard calls `useProCheckout().open()`: the sidebar card, the Account plan card (Free only: there is no way to add time to a running Pro term yet; dropped 2026-10-19 until it can be done properly), the overview tile and card, the AutoDJ and Audience upsells, the encoder card, and the embed option behind Share. No station is required.
2. `ProCheckoutDialog` opens with "Paying by card? Card payments are coming soon." + Notify me at the top, then `GET /api/billing/catalog` (public, sale already applied) as term cards. Each card leads with the total in large type, then the per-month price ("$16 / month, paid once"), and a green "Save N%" beside the term name (against the one-month price). A product with an admin `badge` is drawn in Pro amber with the badge on top, and the first badged product is preselected. A product whose unit is `lifetime` (no length) sits on top across both columns in solid Pro amber, says "Paid once, yours for good", and is never preselected; buying it sets `plan_expires_at` to null via `PlanTerm::applyPermanent`, so plans:expire and renewal reminders never touch it, and a later term is refused like any no-end-date account. The only seed badge is 12 months "Best value", so 12 months opens selected; which term gets pushed is an admin edit. "Have a coupon?" calls `POST /api/billing/quote`. **Pay** calls `POST /api/billing/checkout {product, code}`.
3. `Checkout::start` refuses when there is no merchant key (503), the product is unknown or switched off (404), the account is on a hand-made plan or on Pro with no end date (409, via `PlanTerm::conflict`), or a coupon problem exists (422). It reuses an open invoice for the same product, discount and amount if it has more than 10 minutes left. Otherwise it writes the payment row and creates the invoice: `amount` in USD, `fee_paid_by_payer: 0` (the fee is ours), `to_currency: USDT` (the buyer pays any coin), `order_id` = uuid, `callback_url` = `OXAPAY_CALLBACK_URL` or the `webhooks.oxapay` route, `return_url` = `{FRONTEND_URL}/dashboard/settings?payment={uuid}`. If OxaPay refuses, the row becomes `failed` with the reason and the buyer gets a 502 "couldn't reach the payment provider".
4. The dashboard tab never leaves: leaving `/dashboard` would end a live show. Pay closes checkout and opens `PaymentStatusDialog` on "Your payment is ready", whose **Open payment page ↗** is a plain `<a target="_blank">` to the invoice (no `window.open`: it would run after the checkout request, and popup blockers stop it). After that click the dialog shows "Waiting for your payment" with **Reopen payment page ↗**. OxaPay sends the buyer back to `?payment=` in the new tab, which shows the same dialog. It polls `GET /api/billing/payments/{uuid}` (owner only, 404 otherwise) every 4 s, and again whenever the tab is shown, until the state is final or 3 h pass. States are `pending`, `confirming` (OxaPay status `paying`), `granted`, `expired` (also once the invoice's time runs out) or `attention`. On `granted` it calls `router.refresh()` so the layout re-reads the plan.
5. `POST /api/webhooks/oxapay` checks the `HMAC` header (HMAC-SHA512 of the raw body with the merchant key; 401 on mismatch, 503 with no key) and runs `PaymentProcessor`. It answers `ok`.

## PaymentProcessor (webhook, reconcile, admin Recheck and simulate share it)

- An unknown `track_id` is acknowledged and ignored. An `order_id` that is not the row's uuid is flagged and nothing else happens.
- Statuses are normalised ("Paid" → `paid`, "Manual Accept" → `manual_accept`).
- `paid` / `manual_accept` lock the payment and the user, then grant through `PlanTerm::apply` (the same writer the admin Approve uses). A running term of the same plan is extended, not restarted. The grant stamps `granted_at` / `granted_until`, increments the coupon's `redemptions_count`, then (after commit) sends `ProAccessGranted(paid: true)` and a Telegram "💰 Payment received" (or "🧪 Test payment granted" in sandbox).
- These only set `review_reason` and send one "⚠️ Payment needs review" alert (never twice for the same reason): `underpaid`; paid but the account was deleted; paid but `PlanTerm` refuses (a Custom plan or a permanent grant); `refunding`/`refunded` after a grant; an unknown status. **Nothing here ever removes a plan.** Revoking is a human decision.
- Once granted, only a refund status changes the row. A late `paying` or a redelivered `paid` is ignored.
- The webhook's `amount` is in the paid coin (OxaPay's sample: `amount: 10`, `currency: POL`, `value: 3.68`), so it is deliberately not compared with `amount_usd`.

## Scheduled and manual commands

| Command | When | What |
|---|---|---|
| `billing:reconcile` | every 10 min | Asks `GET /v1/payment/{track_id}` about payments still `new/waiting/paying/underpaid` from the last 3 days, and applies the answer through PaymentProcessor. A no-op without a key. OxaPay stops retrying a webhook after ~3.5 h, so this is the safety net. |
| `billing:remind-renewals` | daily 15:00 | `PlanRenewalReminder` (bell + mail) 7 days and 1 day before `plan_expires_at`, **only** when that end date is the `granted_until` of a granted, unrefunded payment on the same plan. Gifts and invites get none. No 7-day reminder for a term granted in the last 2 days. A heads-up only: the button ("See your plan") goes to `/dashboard/settings`, never to checkout, because buying time before a term ends was dropped. |
| `billing:simulate {uuid|track} {status=paid} [--url=]` | by hand, refused in production | Sends a correctly signed, OxaPay-shaped webhook over HTTP to the app's own route. |

`PlanExpired` now ends with "Get Pro again" → `/dashboard/settings?checkout=1`.

## Links into checkout (any dashboard route; parameters are stripped after reading)

`?payment=<uuid>` shows the status dialog. `?product=<slug>` opens checkout on that term, hidden products included. `?coupon=<CODE>` opens it with the coupon applied. `?checkout=1` just opens it. The admin pages have "Copy link" buttons for products and coupons.

## Admin

- `/admin/payments`: stats (needs review, paid & granted, revenue, last 30 days, gateway mode), search by email, coupon, uuid or track id, and filters (all, needs review, granted, not paid yet). **Recheck** asks OxaPay and applies the answer. **Clear** removes the review flag only.
- `/admin/billing/products`: create and edit. There is no delete: switch a product off instead.
- `/admin/billing/discounts`: create and edit coupons and sales. A new coupon defaults to 1 use. 100% is refused.
- `/admin/requests` lost the Payment email button. A "Paid" approval now needs a term of at least a month.

## Prices on the site

The homepage `PricingSection` server-fetches the catalog (`lib/billing-server.ts`, revalidated every 5 min) and shows the one-month product's price (struck through during a sale), then a full-width "Pro, paid ahead" band under the three cards (straight after the Pro card below `lg`, by grid `order`) listing the other terms in catalog order: total, per month, "save N%" against the monthly list price, and the admin badge. Lifetime is never on the homepage (a dashboard-only offer, switched on and off by hand). `monthlyProduct` returns only an exact one-month term: with none, every "/ month" line (homepage and `ProPrice`) is left out rather than quoting another term's total. If the fetch fails, all prices are left out. Dashboard upsells use `ProPrice` / `useProPriceShort` / `useYearlyLine` from the same catalog. `PRO_PRICE_USD`, `PRO_PRICE_YEAR_USD` and `PRO_AVAILABLE` are gone. Help and blog prose still state "$20" and "we email you how to pay" by hand.

## Wording rules

- **The dashboard and emails** say "USDT, USDC or another digital currency" and never "crypto". OxaPay is "our payment provider".
- **The public site** (homepage, marketing, help, blog, player pages) never names the payment method or provider. `client/components/homepage/no-payment-method-on-public-site.test.ts` fails if it does.
- **"Card payments are coming soon."** with **Notify me** sits in the checkout dialog. It writes one `card_payment_interests` row per account (`GET`/`POST /api/billing/card-interest`), and `/admin/payments` shows the count and a copyable list of the emails. `notified_at` is left for whoever sends that email.

## Configuration

`OXAPAY_MERCHANT_KEY` (creates invoices and verifies webhooks), `OXAPAY_SANDBOX`, `OXAPAY_DRIVER` (`oxapay` | `fake`; `fake` throws in production), `OXAPAY_CALLBACK_URL` (an ngrok URL for local sandbox tests, blank in prod), `OXAPAY_INVOICE_LIFETIME` (minutes, 15–2880). Prod is behind Cloudflare: OxaPay's docs say to allow their IPs (ask contact@oxapay.com) if a WAF rule blocks the webhook.

## Testing, from fastest to most real

1. `php artisan test tests/Feature/Billing tests/Feature/Admin/BillingAdminTest.php`: signed webhook bodies, every status, coupons, sales, reminders.
2. Local, no OxaPay: `OXAPAY_DRIVER=fake` and any `OXAPAY_MERCHANT_KEY`. Pay in the dashboard ("Open payment page" opens `?payment=` in a new tab), then run `php artisan billing:simulate <uuid> paying` followed by `… paid`.
3. Sandbox: `OXAPAY_DRIVER=oxapay`, `OXAPAY_SANDBOX=true`, the real key, `ngrok http 8000`, and `OXAPAY_CALLBACK_URL=https://<id>.ngrok-free.app/api/webhooks/oxapay`. Whether sandbox invoices send webhooks is not documented. If they don't, use Recheck or reconcile.
4. Prod smoke test: a hidden $1 product, paid for real by link, then revoked by hand.
