import { NextRequest, NextResponse } from 'next/server';
import { MatchInputError } from '@/lib/espn-match';
import { getMatchHistory } from '@/lib/espn-match-history-feed';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;
export async function GET(request: NextRequest, context: { params: Promise<{ league: string; eventId: string }> }) {
  try {
    const { league, eventId } = await context.params;
    return NextResponse.json(await getMatchHistory(league, eventId, request.nextUrl.searchParams.get('refresh') === '1'), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const invalid = error instanceof MatchInputError;
    return NextResponse.json({ error: invalid ? error.message : 'Match history is busy. Please try again.' }, { status: invalid ? error.httpStatus : 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
