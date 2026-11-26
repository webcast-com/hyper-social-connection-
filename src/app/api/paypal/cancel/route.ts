import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/viewer';
import {
  paypalConfig,
  findActiveSubscriptionForUser,
  applySubscriptionStatus,
  fetchSubscription,
  cancelSubscription,
} from '@/lib/paypal';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/paypal/cancel
 *
 * Cancels the signed-in user's Hyper Pro subscription with PayPal. Access
 * continues until the end of the already-paid period (PayPal's
 * next_billing_time), which is stored as valid_until.
 */
export async function POST() {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cfg = paypalConfig();
  if (!cfg.configured) {
    return NextResponse.json({ error: 'PayPal is not configured' }, { status: 503 });
  }

  const active = await findActiveSubscriptionForUser(viewer.id);
  if (!active) {
    return NextResponse.json({ error: 'No active Pro subscription found' }, { status: 404 });
  }

  try {
    const subscription = await fetchSubscription(active.paypalSubscriptionId);
    await cancelSubscription(
      active.paypalSubscriptionId,
      'User cancelled Hyper Pro from the predictions page',
    );
    const accessUntil = subscription?.billing_info?.next_billing_time ?? new Date().toISOString();
    await applySubscriptionStatus(active.paypalSubscriptionId, 'CANCELLED', accessUntil);
    return NextResponse.json({ ok: true, accessUntil });
  } catch (error) {
    console.error('[paypal/cancel] failed:', (error as Error)?.message);
    return NextResponse.json(
      { ok: false, error: (error as Error)?.message ?? 'Could not cancel the subscription' },
      { status: 502 },
    );
  }
}
