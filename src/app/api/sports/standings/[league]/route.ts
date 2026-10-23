import { NextRequest, NextResponse } from 'next/server';
import { MatchInputError } from '@/lib/espn-match';
import { getStandings } from '@/lib/espn-standings-feed';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;
export async function GET(request: NextRequest, context: { params: Promise<{ league: string }> }) {
  try {
    const { league } = await context.params;
    const season = request.nextUrl.searchParams.has('season') ? request.nextUrl.searchParams.get('season')! : undefined;
    const board = await getStandings(league, season, request.nextUrl.searchParams.get('refresh') === '1');
    return NextResponse.json(board, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const invalid = error instanceof MatchInputError;
    return NextResponse.json({ error: invalid ? error.message : 'Standings are busy. Please try again.' }, { status: invalid ? error.httpStatus : 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
