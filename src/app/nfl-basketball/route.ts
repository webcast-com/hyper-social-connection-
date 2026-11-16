import { DASHBOARD_BASKETBALL } from '@/lib/dashboard-seo';

export const dynamic = 'force-dynamic';

/**
 * `/nfl-basketball` has no screen of its own: the app opens the basketball hub.
 * Sending the request there with a permanent redirect makes that one address
 * instead of two that show the same page.
 */
export function GET() {
  return new Response(null, { status: 308, headers: { location: DASHBOARD_BASKETBALL, 'cache-control': 'public, max-age=3600' } });
}
