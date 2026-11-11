import { NextRequest, NextResponse } from 'next/server';
import { getSportsVideoNews } from '@/lib/espn-video-news-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ESPN league video news — its own endpoint.
 *
 * Separate from `/api/sports/highlights` on purpose: that route reports the
 * fixture-driven match highlights board, this one reports the feed-driven league
 * video list, and a client can refresh one without touching the other.
 *
 * `refresh=1` bypasses the 15-minute cache and is never cached on the way out.
 * A board ESPN did not answer is returned as `unavailable` with an empty list
 * and `no-store`: there are no bundled sample clips here, and a failure must not
 * be cached as though it were an answer.
 */
export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get('refresh') === '1';
  const board = await getSportsVideoNews(refresh);
  const cacheable = !refresh && board.status !== 'unavailable';
  return NextResponse.json(board, {
    headers: {
      'Cache-Control': cacheable
        ? 'public, max-age=120, stale-while-revalidate=300'
        : 'no-store',
    },
  });
}
