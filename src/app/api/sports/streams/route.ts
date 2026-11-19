import { NextRequest, NextResponse } from 'next/server';
import { getStreamBoard } from '@/lib/sportsrc-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The fixtures SportSRC has a stream for: `?sport=football&date=YYYY-MM-DD`.
 *
 * SportSRC is asked from here so its key stays on the server. The answer is the
 * same for every visitor, so a good one may be held by the CDN for a minute; a
 * failure is never cached, so the screen recovers as soon as SportSRC does.
 */
export async function GET(req: NextRequest) {
  const board = await getStreamBoard({
    sport: req.nextUrl.searchParams.get('sport'),
    date: req.nextUrl.searchParams.get('date'),
  });
  return NextResponse.json(board, {
    headers: { 'Cache-Control': board.state === 'ok' && !board.stale ? 'public, max-age=30, s-maxage=60, stale-while-revalidate=120' : 'no-store' },
  });
}
