import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature, applySubscriptionStatus, fetchSubscription, paypalConfig } from '@/lib/paypal';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/paypal/webhook
 *
 * PayPal → Hyper. Configure this URL in the PayPal developer dashboard with
 * the following events:
 *   BILLING.SUBSCRIPTION.ACTIVATED
 *   BILLING.SUBSCRIPTION.UPDATED
 *   BILLING.SUBSCRIPTION.CANCELLED
 *   BILLING.SUBSCRIPTION.EXPIRED
 *   BILLING.SUBSCRIPTION.SUSPENDED
 *   PAYMENT.SALE.COMPLETED
 *
 * The signature is verified against PAYPAL_WEBHOOK_ID before any state change.
 * Unknown subscriptions are acknowledged and ignored (200) so PayPal does not
 * keep retrying events for subscriptions we never recorded.
 */
export async function POST(request: NextRequest) {
  const cfg = paypalConfig();
  if (!cfg.configured || !cfg.webhookId) {
    return NextResponse.json(
      { error: 'Webhook not configured (set PAYPAL_WEBHOOK_ID)' },
      { status: 503 },
    );
  }

  const rawBody = await request.text();

  let verified = false;
  try {
    verified = await verifyWebhookSignature(request.headers, rawBody);
  } catch (error) {
    console.error('[paypal/webhook] signature verification error:', (error as Error)?.message);
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }
  if (!verified) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: { event_type?: string; resource?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const type = event.event_type ?? '';
  const resource = event.resource ?? {};

  try {
    switch (type) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
      case 'BILLING.SUBSCRIPTION.UPDATED': {
        const id = String(resource['id'] ?? '');
        const billing = (resource['billing_info'] ?? {}) as { next_billing_time?: string };
        if (id) await applySubscriptionStatus(id, 'ACTIVE', billing.next_billing_time ?? null);
        break;
      }
      case 'BILLING.SUBSCRIPTION.CANCELLED': {
        const id = String(resource['id'] ?? '');
        const billing = (resource['billing_info'] ?? {}) as { next_billing_time?: string };
        if (id) {
          // Access lasts until the period already paid for ends.
          await applySubscriptionStatus(id, 'CANCELLED', billing.next_billing_time ?? new Date().toISOString());
        }
        break;
      }
      case 'BILLING.SUBSCRIPTION.EXPIRED':
      case 'BILLING.SUBSCRIPTION.SUSPENDED': {
        const id = String(resource['id'] ?? '');
        if (id) await applySubscriptionStatus(id, type.endsWith('EXPIRED') ? 'EXPIRED' : 'SUSPENDED', new Date().toISOString());
        break;
      }
      case 'PAYMENT.SALE.COMPLETED': {
        const subscriptionId = String(
          (resource['billing_agreement_id'] ?? '') as string,
        );
        if (subscriptionId) {
          // Renewal: extend the paid-through date from the subscription itself.
          const subscription = await fetchSubscription(subscriptionId).catch(() => null);
          const nextBilling = subscription?.billing_info?.next_billing_time ?? null;
          await applySubscriptionStatus(subscriptionId, 'ACTIVE', nextBilling);
        }
        break;
      }
      default:
        // Unhandled event types are acknowledged so PayPal stops retrying.
        break;
    }
  } catch (error) {
    console.error('[paypal/webhook] handler failed:', type, (error as Error)?.message);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
