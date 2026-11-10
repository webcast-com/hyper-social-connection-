import { NextRequest, NextResponse } from 'next/server';
import { getSportsBoard } from '@/lib/sports';
import { SPORTS_BOARD_LEAGUES } from '@/lib/sports-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ESPN sports board. The predictions array is retained for UI compatibility but is empty.
 *
 * Pulls configured ESPN scoreboards on the server (avoids browser CORS),
 * caches ~45s, and falls back to demo fixtures when every source is down.
 * `leagues` limits the request to named catalog competitions, which the browser
 * route uses to re-request only the feeds it could not reach directly.
 */
export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get('refresh') === '1';
  const known = new Set(SPORTS_BOARD_LEAGUES.map((item) => item.slug));
  const requested = [...new Set((req.nextUrl.searchParams.get('leagues') ?? '').split(',').map((item) => item.trim()))]
    .filter((slug) => known.has(slug));
  const board = await getSportsBoard({ bypassCache: refresh, leagues: requested.length ? requested : undefined });
  return NextResponse.json(board, {
    headers: { 'Cache-Control': refresh ? 'no-store' : 'public, max-age=20, stale-while-revalidate=40' },
  });
}
