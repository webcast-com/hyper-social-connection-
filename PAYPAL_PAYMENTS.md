# PayPal payments for Hyper Pro — predictions tips

Hyper Pro unlocks the **Pro prediction tips** on `/sports/predictions` (locked
tips, full analysis, bookmaker comparisons). It is sold as a recurring
**$0.99 USD / month** PayPal subscription.

> The ESPN odds feed marks the top tips as `is_premium`. Before this
> integration the "Upgrade" button could only show a toast saying premium was
> not available; the button now opens a real PayPal checkout.

## How it fits together

```
TipDetailPanel  ──"Unlock Pro"──▶  ProUpgradeModal
                                       │  GET  /api/paypal/config     (client id, plan id, price)
                                       │  loads PayPal JS SDK (intent=subscription)
                                       ▼
                              PayPal subscription button
                                       │  buyer approves in PayPal popup
                                       ▼
                              POST /api/paypal/activate  { subscriptionId }
                                       │  server fetches the subscription from PayPal,
                                       │  checks plan_id + status, upserts
                                       ▼
                              paypal_subscriptions (Postgres)
                                       │
                     POST /api/paypal/webhook  (ACTIVATED / SALE.COMPLETED / CANCELLED / …)
                                       ▼
                     /sports/predictions  →  isProUser(viewerId)  →  tips unlocked
```

* Entitlement is tied to the **Hyper user id** (the buyer's Hyper account),
  never to the browser — the activate route fetches the subscription from
  PayPal server-to-server and refuses plans/subscriptions that don't match.
* A cancelled subscription keeps Pro until the end of the period already paid
  for (`valid_until`, taken from PayPal's `next_billing_time`).
* `POST /api/paypal/cancel` cancels from the site (the modal's "Cancel
  subscription" link).
* The `paypal_subscriptions` and `app_settings` tables are created by the boot
  DDL in `src/lib/migrate.ts` (and applied on Supabase as migration
  `add_paypal_pro_subscriptions`).

## One-time setup

1. **Create a PayPal app** — <https://developer.paypal.com/dashboard/applications>
   → *Create App* → copy the **Client ID** and **Secret**. Sandbox is fine for
   testing; use a separate app (and `PAYPAL_ENV=live`) for production.
2. **Set the environment variables** (locally in `.env.local`, in production on
   Vercel/Netlify):

   ```bash
   PAYPAL_CLIENT_ID=A...               # from the PayPal app
   PAYPAL_CLIENT_SECRET=E...           # server-only, never NEXT_PUBLIC_
   NEXT_PUBLIC_PAYPAL_CLIENT_ID=A...   # same client id (public-safe); the SDK URL
                                       # is built from this
   PAYPAL_ENV=sandbox                  # or "live"
   # Optional: reuse an existing plan instead of auto-provisioning one
   # PAYPAL_PLAN_ID=P-0XXXXX
   # Optional but recommended for automatic renewals/cancellations
   # PAYPAL_WEBHOOK_ID=5ABC123...
   ```

   No plan has to be created by hand: on first use the server creates the
   product **Hyper Pro — Predictions Tips** and a $0.99/month plan via the
   PayPal API and stores the plan id in the `app_settings` table. Set
   `PAYPAL_PLAN_ID` to skip that.
3. **Webhook (recommended)** — in the PayPal dashboard add a webhook pointing
   at `https://<your-domain>/api/paypal/webhook` with these events:
   `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.UPDATED`,
   `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.EXPIRED`,
   `BILLING.SUBSCRIPTION.SUSPENDED`, `PAYMENT.SALE.COMPLETED`. Copy the webhook
   id into `PAYPAL_WEBHOOK_ID`. The route verifies the signature before any
   state change; without it renewals/cancellations are not synced automatically
   (buyers keep Pro until `valid_until` anyway).
4. **Redeploy / restart** and open `/sports/predictions` → open a locked Pro
   tip → *Unlock Pro* → pay with a sandbox personal account (create one under
   *Sandbox → Accounts*).

## Testing with sandbox

* `PAYPAL_ENV=sandbox` + sandbox app credentials.
* Buyer: any **personal sandbox account** (it comes pre-funded).
* The webhook only reaches a public HTTPS URL — for local testing use a tunnel
  (e.g. `ngrok http 3000`) or skip the webhook and verify the activate flow,
  which is synchronous.

## Pricing

| Item | Value |
| --- | --- |
| Price | **$0.99 USD / month** |
| Product | `Hyper Pro — Predictions Tips` (type SERVICE) |
| Plan | auto-created on first use (or `PAYPAL_PLAN_ID`) |
| Billing | `REGULAR` cycle, `total_cycles: 0` → until cancelled |
| Failure handling | retries 3 times, then the subscription is cancelled |

## FAQ

**Can a buyer get Pro on several devices?** Yes — the entitlement is stored
against their Hyper account, so signing in anywhere unlocks Pro.

**What if the activate call fails after payment?** The buyer paid, PayPal will
fire `BILLING.SUBSCRIPTION.ACTIVATED`; with the webhook configured Pro is
activated automatically. Without it, re-opening the modal and having the buyer
re-approve (or re-clicking the button) links the same subscription.

**Is the browser trusted?** No. `activate` re-fetches the subscription from
PayPal and checks `plan_id` and status; the webhook is signature-verified.
