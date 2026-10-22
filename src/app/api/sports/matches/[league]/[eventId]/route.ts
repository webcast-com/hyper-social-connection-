import { NextRequest, NextResponse } from 'next/server';
import { getMatchDetails } from '@/lib/espn-match-feed';
import { MatchInputError } from '@/lib/espn-match';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;
export async function GET(request: NextRequest, context: { params: Promise<{ league: string; eventId: string }> }) {
  try {
    const { league, eventId } = await context.params;
    const board = await getMatchDetails(league, eventId, request.nextUrl.searchParams.get('refresh') === '1');
    return NextResponse.json(board, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const invalid = error instanceof MatchInputError;
    return NextResponse.json({ error: invalid ? error.message : 'Unable to load match details. Please try again.' },
      { status: invalid ? error.httpStatus : 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
