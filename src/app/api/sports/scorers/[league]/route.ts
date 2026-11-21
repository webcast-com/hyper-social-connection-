import { NextRequest, NextResponse } from 'next/server';
import { ScorersInputError } from '@/lib/espn-scorers';
import { getSportsScorers } from '@/lib/espn-scorers-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * ESPN's top scorers for one football competition, by catalog slug.
 *
 * `refresh=1` bypasses the fifteen-minute cache. A table ESPN did not answer
 * for is `unavailable`, carries no players and is not cached on the way out.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ league: string }> }) {
  try {
    const { league } = await context.params;
    const refresh = request.nextUrl.searchParams.get('refresh') === '1';
    const board = await getSportsScorers(league, refresh);
    return NextResponse.json(board, {
      headers: { 'Cache-Control': !refresh && board.status === 'ready' ? 'public, max-age=120, stale-while-revalidate=300' : 'no-store' },
    });
  } catch (error) {
    const invalid = error instanceof ScorersInputError;
    return NextResponse.json({ error: invalid ? error.message : 'Top scorers are busy. Please try again.' }, { status: invalid ? error.httpStatus : 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
