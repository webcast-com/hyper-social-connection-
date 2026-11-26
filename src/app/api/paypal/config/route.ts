import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/viewer';
import {
  paypalConfig,
  paypalSdkUrl,
  ensureProPlan,
  PRO_PRICE,
  PRO_CURRENCY,
  PRO_INTERVAL,
} from '@/lib/paypal';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/paypal/config
 *
 * What the upgrade modal needs to render the PayPal button: whether payments
 * are configured, the public client id, and the plan id to subscribe to. When
 * PAYPAL_PLAN_ID is unset the product + plan are auto-created on first call
 * and the plan id is cached in the app_settings table.
 */
export async function GET() {
  const cfg = paypalConfig();
  if (!cfg.configured) {
    return NextResponse.json({
      configured: false,
      price: PRO_PRICE,
      currency: PRO_CURRENCY,
      interval: PRO_INTERVAL,
    });
  }

  try {
    const planId = await ensureProPlan();
    const viewer = await getViewer();
    return NextResponse.json({
      configured: true,
      env: cfg.env,
      clientId: cfg.publicClientId,
      sdkUrl: paypalSdkUrl(cfg),
      planId,
      price: PRO_PRICE,
      currency: PRO_CURRENCY,
      interval: PRO_INTERVAL,
      signedIn: Boolean(viewer),
    });
  } catch (error) {
    console.error('[paypal/config] failed to ensure plan:', (error as Error)?.message);
    return NextResponse.json(
      { configured: false, error: 'PayPal is configured but the product/plan could not be created. Check the server credentials.' },
      { status: 502 },
    );
  }
}
