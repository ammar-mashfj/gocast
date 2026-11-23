# Getly launch: deploy steps

PR #17 (`feat/getly-card-link`): https://github.com/ammar-mashfj/gocast/pull/17

**Status (2026-11-22): on hold.** The PR has been reviewed and tested and is ready
to merge. We're waiting up to 3 business days for lava.top's security review,
because lava.top has subscriptions and faster payouts. Decide after that:

- **lava.top approves and a payout actually arrives:** use lava.top for cards
  (it still has to be integrated) and keep this PR as a ready backup.
- **lava.top refuses or freezes:** launch Getly using the steps below.

Things to know before launching:

- **Getly holds each sale for about 30 days**, then pays out on the next 1st or
  15th, so money arrives 30 to 45 days after a sale.
- **This PR replaces OxaPay completely.** Crypto buyers would also pay through
  Getly, and their USDT would also be held. Keeping OxaPay for crypto and using
  Getly only for cards is possible, but it's a code change that isn't built.

Do the parts on prod in one sitting: Get Pro stays off between the deploy and
the keys being set.

## 1. Clean up after the staging test (in Getly)

1. **Webhooks:** delete the endpoint for
   `https://api.dragonflylabs.dev/api/webhooks/getly`, if it's still there.
2. **API keys:** delete the staging key.

## 2. Prepare Getly for prod

3. **Prod API key.** At https://www.getly.store/dashboard/developer/keys,
   create a key named "GoCast prod" with only two scopes:
   - `checkout:create`: creates the checkout link and checks a link's status
     (the 10-minute check);
   - `read:coupons`: reads coupons when a buyer applies one.

   Copy it, since it's likely shown only once.
4. **Prod webhook endpoint.**
   - URL: `https://api.gocast.fm/api/webhooks/getly`
   - Events: `sale.completed` and `order.refunded`. Not `dispute.created`:
     Getly handles disputes itself.
   - Copy the signing secret, which is shown only once.
5. **The `FOUNDERS` coupon.** Our dialog shows Getly's own rules, so check:
   - **Discount:** the founder discount you agreed ($61 off was the plan);
   - **Use limit:** give it a maximum number of uses, or anyone who has the
     code can use it forever;
   - **Products:** limit it to the 12-month product if the deal is only for
     that one.

## 3. Prod settings (before deploying)

6. On the prod server:

   ```
   sudo -u gocast nano /var/www/gocast/api/.env
   ```

   Add these three lines:

   ```
   BILLING_GATEWAY=getly
   GETLY_API_KEY=<the key from step 3>
   GETLY_WEBHOOK_SECRET=<the secret from step 4>
   ```

   - **Don't add `GETLY_PRODUCTS`.** The four product ids are built in, and
     they were checked against Getly on 2026-11-22.
   - **Leave the OxaPay lines as they are.** Old OxaPay payments still use
     them.

   | Our product     | Getly product id                       | Price |
   |-----------------|----------------------------------------|-------|
   | pro-1-month     | `f199f7eb-0f21-4c6a-bab1-5d0ff40d928b` | $20   |
   | pro-3-months    | `99d78a52-055d-41c5-96b0-41e35db858e1` | $52   |
   | pro-6-months    | `9497eda5-445c-4ed2-815d-105d2b8425a5` | $96   |
   | pro-12-months   | `c21dc3df-4986-4516-9994-565cbc173c29` | $160  |

   If you ever change a price, change it on both sides: in admin → Products
   and on Getly. When they differ, Pay fails for that plan.

## 4. Merge and deploy

7. **Merge PR #17 into main.** Before merging, check the branch is still up to
   date with main.
8. **Deploy on the prod server:**

   ```
   cd /var/www/gocast
   sudo bash infra/native/deploy-native.sh
   ```

   - **Migration:** the script runs the database migration itself, after a
     backup. It's `widen_payments_review_reason`, which turns
     `payments.review_reason` into a text column.
   - **Settings:** the script reloads the settings from step 6.
   - **Extra steps it may print** (nginx setup, rebuilding the audio image)
     come from earlier PRs. Handle them the way you normally do on prod.
9. **Check https://gocast.fm loads over HTTPS.** If the deploy broke TLS (the
   certbot issue), run certbot again.

## 5. Check it's live (no money spent)

10. **Admin → Payments:** the gateway box says **Getly · live**, with no red
    warning.
11. **Get Pro, without paying:**
    - sign in to https://gocast.fm with a Free account, open Get Pro and pick
      a plan;
    - enter `FOUNDERS` and press Apply; the price matches Getly's;
    - press Pay; a Stripe page whose address starts with `cs_live_` opens,
      which proves the prod key works. **Close it without paying.**
12. **Ask Claude to check prod (read-only):** that the migration ran, and that
    the payment from step 11 has Getly's link and our reference.

Why there's no real test purchase: Getly has no sandbox for checkout links.
Its "test purchase" with the 4242 card only works from the product page, and
on 2026-11-22 it sent no webhook. Buying your own product with real money
risks Getly's "false orders" rule. The first real sale is the test.

## 6. After launch

13. **First sales:** check each one was granted cleanly (ask Claude to look at
    prod).
    - Pro arrives within seconds by webhook, or at most 10 minutes later from
      the API check.
    - If it doesn't, grant Pro by hand from admin and investigate.
14. **Refunds:** Getly's team decides them. When Getly approves one, the
    payment shows "Refunded" with a note and a Telegram alert. Pro is never
    removed automatically, so remove it by hand if you want to.
15. **Card waiting list:** 7 people asked to be told when card payments
    arrive. Email them; nothing in the code does it.
16. **Webhook alert:** "Getly webhook refused…" alerts at most once an hour.
    One alert with no failed sale is probably a random request; repeated
    alerts together with a missing sale mean the secret is wrong.

## Rollback

Set `BILLING_GATEWAY=oxapay` in `api/.env` and run the deploy with
`FULL_DEPLOY=1` to reload the settings. Get Pro goes back to OxaPay, but the
dialog wording still mentions Getly and cards, so fix that if the rollback
lasts.
