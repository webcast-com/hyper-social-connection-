import { NextRequest, NextResponse } from 'next/server';
import { getStreamDetail } from '@/lib/sportsrc-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One match's stream sources and facts: `?id=<SportSRC match id>`.
 *
 * The id is checked before it is sent anywhere, and the player addresses in the
 * answer are `https` only (see `parseStreamDetail`). They are framed by the
 * browser, never fetched from here.
 */
export async function GET(req: NextRequest) {
  const result = await getStreamDetail(req.nextUrl.searchParams.get('id'));
  return NextResponse.json(result, {
    status: result.state === 'ok' ? 200 : result.state === 'rate-limited' ? 429 : result.state === 'unavailable' ? 502 : 503,
    headers: { 'Cache-Control': result.state === 'ok' ? 'public, max-age=60, s-maxage=120, stale-while-revalidate=180' : 'no-store' },
  });
}
