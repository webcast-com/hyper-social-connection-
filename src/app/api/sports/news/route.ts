import { NextRequest, NextResponse } from 'next/server';
import { NewsInputError, resolveNewsLeagues } from '@/lib/espn-news';
import { getSportsNews } from '@/lib/espn-news-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * ESPN league news as article cards.
 *
 * `?leagues=epl,ucl` names up to four competitions by catalog slug; with none
 * named, a default football mix is used. `refresh=1` bypasses the ten-minute
 * cache. A board no competition answered for is `unavailable`, carries no
 * articles and is not cached on the way out: there is no sample news here.
 */
export async function GET(request: NextRequest) {
  try {
    const leagues = resolveNewsLeagues(request.nextUrl.searchParams.get('leagues'));
    const refresh = request.nextUrl.searchParams.get('refresh') === '1';
    const board = await getSportsNews(leagues, refresh);
    return NextResponse.json(board, {
      headers: { 'Cache-Control': !refresh && board.status === 'ready' ? 'public, max-age=120, stale-while-revalidate=300' : 'no-store' },
    });
  } catch (error) {
    const invalid = error instanceof NewsInputError;
    return NextResponse.json({ error: invalid ? error.message : 'News is busy. Please try again.' }, { status: invalid ? error.httpStatus : 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
