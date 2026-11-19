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
 *
 * When there is nothing to play the answer says why (`reason`, and `note` with
 * SportSRC's own words when it refused), so a failure can be diagnosed from the
 * address bar.
 */
export async function GET(req: NextRequest) {
  const { shape, ...result } = await getStreamDetail(req.nextUrl.searchParams.get('id'));
  // `?debug=1` adds the field names of an answer that could not be used. It is
  // read from the same cached result, so asking costs no SportSRC request.
  const body = req.nextUrl.searchParams.get('debug') === '1' && shape ? { ...result, shape } : result;
  return NextResponse.json(body, {
    status: result.state === 'ok' ? 200 : result.state === 'rate-limited' ? 429 : result.state === 'unavailable' ? 502 : 503,
    headers: { 'Cache-Control': result.state === 'ok' ? 'public, max-age=60, s-maxage=120, stale-while-revalidate=180' : 'no-store' },
  });
}
