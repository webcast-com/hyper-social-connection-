import { NextRequest, NextResponse } from 'next/server';
import { getTeamDetail } from '@/lib/espn-team-feed';
import { TeamInputError } from '@/lib/espn-team';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * One team's detail: identity, fixtures and squad.
 *
 * Its own endpoint, apart from the match and standings routes. `refresh=1`
 * bypasses the server-side cache. Responses are `no-store` — the server cache
 * does the reuse, and a shared cache must never serve one team's board under
 * another team's URL. An unknown competition is a 404, a non-numeric team id a
 * 400, and upstream trouble a 503 the client can retry.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ league: string; teamId: string }> }) {
  try {
    const { league, teamId } = await context.params;
    const board = await getTeamDetail(league, teamId, request.nextUrl.searchParams.get('refresh') === '1');
    return NextResponse.json(board, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const invalid = error instanceof TeamInputError;
    return NextResponse.json(
      { error: invalid ? error.message : 'Team details are busy. Please try again.' },
      { status: invalid ? error.httpStatus : 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
