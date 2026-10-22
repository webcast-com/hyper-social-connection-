import { NextRequest, NextResponse } from 'next/server';
import { getEspnOdds } from '@/lib/espn-odds-feed';
import { OddsInputError } from '@/lib/espn-odds';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function respond(request: NextRequest, body: unknown) {
  try {
    const board = await getEspnOdds(body, { bypassCache: request.nextUrl.searchParams.get('refresh') === '1' });
    return NextResponse.json(board, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const badInput = error instanceof OddsInputError;
    return NextResponse.json({ matches: [], error: badInput ? error.message : 'Unable to load ESPN odds. Please try again.' }, {
      status: badInput ? 400 : 503, headers: { 'Cache-Control': 'no-store' },
    });
  }
}
export async function GET(request: NextRequest) { return respond(request, {}); }
export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ matches: [], error: 'Request body must be valid JSON' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  return respond(request, body);
}
