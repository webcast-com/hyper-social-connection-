/**
 * PayPal integration for Hyper Pro ($0.99 USD / month).
 *
 * Flow
 * ----
 * 1. The predictions page (`/sports/predictions`) resolves whether the signed-in
 *    viewer already has Pro via `isProUser()` and passes it to the client.
 * 2. A non-Pro viewer clicking "Unlock Pro" opens the upgrade modal, which loads
 *    the PayPal JS SDK (`intent=subscription&vault=true`) and renders the
 *    subscription button with `plan_id` from `GET /api/paypal/config`.
 * 3. The buyer approves in the PayPal popup; the client then POSTs the
 *    subscription id to `/api/paypal/activate`, which fetches it back from
 *    PayPal (never trusting the browser), checks it against our plan, and
 *    upserts a row in `paypal_subscriptions`.
 * 4. `POST /api/paypal/webhook` keeps the row in sync afterwards
 *    (activated / renewed / cancelled / expired / suspended). Access lasts
 *    until `valid_until` (PayPal's `next_billing_time`), so a cancellation does
 *    not cut short a period the buyer already paid for.
 *
 * Configuration (see PAYPAL_PAYMENTS.md)
 * --------------------------------------
 *   PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET   – from developer.paypal.com
 *   PAYPAL_ENV                                – "sandbox" (default) or "live"
 *   NEXT_PUBLIC_PAYPAL_CLIENT_ID              – same client id (public-safe), lets
 *                                               the page build the SDK URL; the
 *                                               server value is used if unset
 *   PAYPAL_PLAN_ID                            – optional; when unset a product +
 *                                               $0.99/month plan are created on
 *                                               first use and the plan id is kept
 *                                               in the `app_settings` table
 *   PAYPAL_WEBHOOK_ID                         – required for the webhook route
 *
 * Everything degrades gracefully: with no credentials the site renders and the
 * modal says payments are not configured yet.
 */
import { rawQuery, rawExecute, hasDatabase, markDatabaseDown } from '@/lib/prisma';

export const PRO_PRICE = '0.99';
export const PRO_CURRENCY = 'USD';
export const PRO_INTERVAL = 'MONTH';
export const PRO_NAME = 'Hyper Pro — Predictions Tips';

const TOKEN_SAFETY_MS = 60_000;

type PayPalEnv = 'sandbox' | 'live';

export type PayPalConfig = {
  configured: boolean;
  env: PayPalEnv;
  clientId: string | null;
  secret: string | null;
  planIdFromEnv: string | null;
  webhookId: string | null;
  /** Client id the browser may use (public-safe). */
  publicClientId: string | null;
};

export function paypalConfig(): PayPalConfig {
  const env: PayPalEnv = (process.env.PAYPAL_ENV ?? 'sandbox').toLowerCase() === 'live' ? 'live' : 'sandbox';
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim() || null;
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim() || null;
  const publicClientId = (process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() || clientId) || null;
  return {
    configured: Boolean(clientId && secret),
    env,
    clientId,
    secret,
    planIdFromEnv: process.env.PAYPAL_PLAN_ID?.trim() || null,
    webhookId: process.env.PAYPAL_WEBHOOK_ID?.trim() || null,
    publicClientId,
  };
}

export function paypalBaseUrl(env: PayPalEnv = paypalConfig().env): string {
  return env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

export function paypalSdkUrl(cfg: PayPalConfig = paypalConfig()): string | null {
  if (!cfg.publicClientId) return null;
  const host = cfg.env === 'live' ? 'https://www.paypal.com' : 'https://www.sandbox.paypal.com';
  return `${host}/sdk/js?client-id=${encodeURIComponent(cfg.publicClientId)}&vault=true&intent=subscription`;
}

/* ── Access token (module-cached; PayPal tokens live ~8h) ─────────────── */
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(cfg: PayPalConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + TOKEN_SAFETY_MS) {
    return cachedToken.token;
  }
  const auth = Buffer.from(`${cfg.clientId}:${cfg.secret}`).toString('base64');
  const res = await fetch(`${paypalBaseUrl(cfg.env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`PayPal auth failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('PayPal auth response did not include an access token');
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  };
  return cachedToken.token;
}

async function paypalApi<T = unknown>(cfg: PayPalConfig, path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken(cfg);
  const res = await fetch(`${paypalBaseUrl(cfg.env)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`PayPal ${init.method ?? 'GET'} ${path} failed (${res.status})${text ? `: ${text.slice(0, 300)}` : ''}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/* ── Plan provisioning ─────────────────────────────────────────────────── */
const PLAN_SETTING_KEY = 'paypal_pro_plan_id';

async function readSetting(key: string): Promise<string | null> {
  if (!hasDatabase) return null;
  const rows = await rawQuery<{ value: string }>('SELECT "value" FROM "app_settings" WHERE "key" = $1', key);
  return rows[0]?.value ?? null;
}

async function writeSetting(key: string, value: string): Promise<void> {
  if (!hasDatabase) return;
  await rawExecute(
    `INSERT INTO "app_settings" ("key", "value") VALUES ($1, $2)
     ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updated_at" = now()`,
    key,
    value,
  );
}

/**
 * Return the plan id for Hyper Pro, creating the product + plan on first use
 * when PAYPAL_PLAN_ID is not configured. Idempotent: the created id is stored
 * in app_settings so it survives restarts and deploys.
 */
export async function ensureProPlan(): Promise<string> {
  const cfg = paypalConfig();
  if (!cfg.configured) {
    throw new Error('PayPal is not configured (set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET)');
  }
  if (cfg.planIdFromEnv) return cfg.planIdFromEnv;

  const cached = await readSetting(PLAN_SETTING_KEY).catch(() => null);
  if (cached) return cached;

  const product = await paypalApi<{ id: string }>(cfg, '/v1/catalogs/products', {
    method: 'POST',
    body: JSON.stringify({
      name: PRO_NAME,
      description: 'Access to all Pro predictions tips, full analysis and bookmaker comparisons.',
      type: 'SERVICE',
      category: 'SOFTWARE',
    }),
  });

  const plan = await paypalApi<{ id: string }>(cfg, '/v1/billing/plans', {
    method: 'POST',
    body: JSON.stringify({
      product_id: product.id,
      name: `${PRO_NAME} — $${PRO_PRICE}/month`,
      description: 'Recurring monthly subscription. Cancel anytime.',
      status: 'ACTIVE',
      billing_cycles: [
        {
          frequency: { interval_unit: PRO_INTERVAL, interval_count: 1 },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: { value: PRO_PRICE, currency_code: PRO_CURRENCY },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: 'CANCEL',
        payment_failure_threshold: 3,
      },
    }),
  });

  await writeSetting(PLAN_SETTING_KEY, plan.id).catch((error) => {
    console.warn('[paypal] could not persist plan id (set PAYPAL_PLAN_ID to skip auto-provisioning):', (error as Error)?.message);
  });
  return plan.id;
}

/* ── Entitlement ───────────────────────────────────────────────────────── */

/** True when the user has an active subscription or an unexpired paid period. */
export async function isProUser(userId: number): Promise<boolean> {
  if (!hasDatabase) return false;
  try {
    const rows = await rawQuery<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM "paypal_subscriptions"
         WHERE "user_id" = $1
           AND (
             "status" IN ('ACTIVE', 'APPROVED')
             OR ("valid_until" IS NOT NULL AND "valid_until" > now())
           )
       ) AS ok`,
      userId,
    );
    return Boolean(rows[0]?.ok);
  } catch (error) {
    markDatabaseDown();
    console.warn('[paypal] isProUser failed:', (error as Error)?.message);
    return false;
  }
}

export type PayPalSubscription = {
  id: string;
  status: string;
  plan_id?: string;
  subscriber?: { email_address?: string };
  billing_info?: { next_billing_time?: string };
};

export async function fetchSubscription(subscriptionId: string): Promise<PayPalSubscription> {
  const cfg = paypalConfig();
  if (!cfg.configured) throw new Error('PayPal is not configured');
  return paypalApi<PayPalSubscription>(cfg, `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

/**
 * Verify a subscription the browser claims the buyer just approved, then
 * upsert it for this user. Throws on forgery/mismatch — the browser alone
 * never grants Pro.
 */
export async function activateSubscriptionForUser(
  userId: number,
  subscriptionId: string,
): Promise<{ status: string }> {
  if (!hasDatabase) throw new Error('Payments require a connected database');
  const cfg = paypalConfig();
  const planId = await ensureProPlan();
  const subscription = await fetchSubscription(subscriptionId);

  if (!subscription?.id) throw new Error('PayPal returned no such subscription');
  if (subscription.plan_id !== planId) {
    throw new Error('Subscription does not belong to the Hyper Pro plan');
  }
  const status = (subscription.status ?? '').toUpperCase();
  const grantable = ['ACTIVE', 'APPROVED', 'APPROVAL_PENDING'];
  if (!grantable.includes(status)) {
    throw new Error(`Subscription is ${status || 'unknown'}, not approved`);
  }

  const nextBilling = subscription.billing_info?.next_billing_time ?? null;
  const payerEmail = subscription.subscriber?.email_address ?? null;
  const effectiveStatus = status === 'APPROVAL_PENDING' ? 'APPROVAL_PENDING' : 'ACTIVE';

  // A subscription id already tied to ANOTHER user is rejected — plan buyers
  // cannot transfer entitlements by re-submitting someone else's id.
  const existing = await rawQuery<{ user_id: number }>(
    'SELECT "user_id" FROM "paypal_subscriptions" WHERE "paypal_subscription_id" = $1',
    subscriptionId,
  );
  if (existing[0] && existing[0].user_id !== userId) {
    throw new Error('This PayPal subscription is already linked to another account');
  }

  await rawExecute(
    `INSERT INTO "paypal_subscriptions"
       ("user_id", "paypal_subscription_id", "plan_id", "status", "payer_email", "valid_until")
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT ("paypal_subscription_id") DO UPDATE SET
       "status" = EXCLUDED."status",
       "payer_email" = COALESCE(EXCLUDED."payer_email", "paypal_subscriptions"."payer_email"),
       "valid_until" = COALESCE(EXCLUDED."valid_until", "paypal_subscriptions"."valid_until"),
       "updated_at" = now()`,
    userId,
    subscriptionId,
    planId,
    effectiveStatus,
    payerEmail,
    nextBilling,
  );
  return { status: effectiveStatus };
}

/** Apply a webhook status change. Unknown subscriptions are ignored. */
export async function applySubscriptionStatus(
  subscriptionId: string,
  status: string,
  validUntil?: string | null,
): Promise<void> {
  if (!hasDatabase) return;
  const normalized = (status || '').toUpperCase();
  const clearValidUntil = normalized === 'EXPIRED' || normalized === 'SUSPENDED';
  const validUntilValue = clearValidUntil ? new Date() : validUntil ?? null;
  await rawExecute(
    `UPDATE "paypal_subscriptions"
       SET "status" = $2,
           "valid_until" = CASE WHEN $3::timestamptz IS NULL THEN "valid_until" ELSE $3::timestamptz END,
           "updated_at" = now()
     WHERE "paypal_subscription_id" = $1`,
    subscriptionId,
    normalized,
    validUntilValue,
  );
}

/** Cancel a subscription with PayPal. PayPal answers 204 No Content. */
export async function cancelSubscription(subscriptionId: string, reason: string): Promise<void> {
  const cfg = paypalConfig();
  if (!cfg.configured) throw new Error('PayPal is not configured');
  const token = await getAccessToken(cfg);
  const res = await fetch(
    `${paypalBaseUrl(cfg.env)}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: reason.slice(0, 128) }),
      cache: 'no-store',
    },
  );
  if (!res.ok && res.status !== 204) {
    const detail = await res.text().catch(() => '');
    throw new Error(`PayPal cancel failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
}

/* ── Webhook signature verification ────────────────────────────────────── */

export async function verifyWebhookSignature(
  headers: Headers,
  rawBody: string,
): Promise<boolean> {
  const cfg = paypalConfig();
  if (!cfg.configured || !cfg.webhookId) return false;
  const payload = {
    auth_algo: headers.get('paypal-auth-algo') ?? '',
    cert_url: headers.get('paypal-cert-url') ?? '',
    transmission_id: headers.get('paypal-transmission-id') ?? '',
    transmission_sig: headers.get('paypal-transmission-sig') ?? '',
    transmission_time: headers.get('paypal-transmission-time') ?? '',
    webhook_id: cfg.webhookId,
    webhook_event: JSON.parse(rawBody) as unknown,
  };
  if (!payload.transmission_id || !payload.transmission_sig) return false;
  const result = await paypalApi<{ verification_status?: string }>(
    cfg,
    '/v1/notifications/verify-webhook-signature',
    { method: 'POST', body: JSON.stringify(payload) },
  );
  return result?.verification_status === 'SUCCESS';
}

/** Find the viewer's current active/approved subscription, newest first. */
export async function findActiveSubscriptionForUser(
  userId: number,
): Promise<{ paypalSubscriptionId: string } | null> {
  if (!hasDatabase) return null;
  const rows = await rawQuery<{ paypal_subscription_id: string }>(
    `SELECT "paypal_subscription_id" FROM "paypal_subscriptions"
     WHERE "user_id" = $1 AND "status" IN ('ACTIVE', 'APPROVED', 'APPROVAL_PENDING')
     ORDER BY "id" DESC LIMIT 1`,
    userId,
  );
  return rows[0] ? { paypalSubscriptionId: rows[0].paypal_subscription_id } : null;
}
