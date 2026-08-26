import { NextRequest, NextResponse } from 'next/server';
import { getSportsBoard } from '@/lib/sports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Aggregated sports board.
 *
 * Pulls ESPN + TheSportsDB in parallel on the server (avoids browser CORS),
 * caches ~45s, and falls back to demo fixtures when every source is down.
 */
export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get('refresh') === '1';
  const board = await getSportsBoard({ bypassCache: refresh });
  return NextResponse.json(board, {
    headers: { 'Cache-Control': 'public, max-age=20, stale-while-revalidate=40' },
  });
}
