import { NextRequest, NextResponse } from 'next/server';
import { getAthleteDetail } from '@/lib/espn-athlete-feed';
import { AthleteInputError } from '@/lib/espn-athlete';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * One player's detail: biography, team and season statistics.
 *
 * Its own endpoint, apart from the leaders and team routes. `refresh=1` bypasses
 * the server-side cache. Responses are `no-store`, so a shared cache can never
 * serve one player's board under another player's URL. An unknown competition is
 * a 404, a non-numeric player id a 400, and upstream trouble a 503 to retry.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ league: string; athleteId: string }> }) {
  try {
    const { league, athleteId } = await context.params;
    const board = await getAthleteDetail(league, athleteId, request.nextUrl.searchParams.get('refresh') === '1');
    return NextResponse.json(board, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const invalid = error instanceof AthleteInputError;
    return NextResponse.json(
      { error: invalid ? error.message : 'Player details are busy. Please try again.' },
      { status: invalid ? error.httpStatus : 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
