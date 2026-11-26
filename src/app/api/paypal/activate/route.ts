import { NextRequest, NextResponse } from 'next/server';
import { getViewer } from '@/lib/viewer';
import { activateSubscriptionForUser } from '@/lib/paypal';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/paypal/activate
 * Body: { subscriptionId: string }
 *
 * Called by the browser after the buyer approves the subscription in the
 * PayPal popup. The browser's word is never trusted: the subscription is
 * fetched from PayPal and must be for our plan before Pro is granted.
 */
export async function POST(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: 'Please sign in to activate Pro.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const subscriptionId =
    typeof body === 'object' && body !== null && 'subscriptionId' in body
      ? String((body as { subscriptionId?: unknown }).subscriptionId ?? '').trim()
      : '';
  if (!/^[A-Z0-9-]{6,64}$/i.test(subscriptionId)) {
    return NextResponse.json({ error: 'Invalid subscription id' }, { status: 400 });
  }

  try {
    const { status } = await activateSubscriptionForUser(viewer.id, subscriptionId);
    return NextResponse.json({ ok: true, status, isPro: true });
  } catch (error) {
    console.error('[paypal/activate] failed:', (error as Error)?.message);
    return NextResponse.json(
      { ok: false, error: (error as Error)?.message ?? 'Could not activate Pro.' },
      { status: 400 },
    );
  }
}
