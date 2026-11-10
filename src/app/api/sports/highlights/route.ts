import { NextRequest, NextResponse } from 'next/server';
import { getSportsHighlights } from '@/lib/espn-highlights-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ESPN match highlights.
 *
 * Reads a bounded set of ESPN game summaries (the endpoint the Site API
 * documents for a single game) and returns their highlight clips, so the
 * homepage can refresh the same board the server rendered. Falls back to the
 * bundled sample cards when ESPN does not answer; `refresh=1` bypasses the
 * 15-minute cache.
 */
export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get('refresh') === '1';
  const board = await getSportsHighlights(refresh);
  return NextResponse.json(board, {
    headers: { 'Cache-Control': refresh ? 'no-store' : 'public, max-age=120, stale-while-revalidate=300' },
  });
}
