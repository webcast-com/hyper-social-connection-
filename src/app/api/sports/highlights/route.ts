import { NextRequest, NextResponse } from 'next/server';
import { getSportsHighlights } from '@/lib/espn-highlights-feed';
import { highlightsStore, type HighlightsIndexQuery } from '@/lib/highlights-index';
import type { SportsHighlightStatus } from '@/lib/espn-highlights';
import { runHighlightsSweep } from '@/lib/highlights-sweep';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ESPN match highlights, and the stored clip index.
 *
 * Without `index=1` this is exactly what it has always been: a bounded set of
 * ESPN video collections (one per fixture) for today's scores plus the last
 * week's finished matches, with the bundled sample cards as the fallback when
 * ESPN does not answer. `refresh=1` bypasses the 15-minute cache. The homepage
 * reads this shape and nothing about it changed.
 *
 * `index=1` adds the stored index — every clip this site has ever read from
 * ESPN, kept in Postgres — as `{ board, index }`. That read costs **no ESPN
 * request at all**: it is a query against `sports_highlight_clips`, which a
 * bounded sweeper fills in the background. Filters are clamped server-side
 * (`league` must be a configured competition, `status` one of the three match
 * states, `days` at most a year, `limit` at most 60), and an unknown value is
 * dropped rather than queried.
 *
 * An indexed read also nudges the sweeper, without waiting for it: coverage
 * grows with traffic, one bounded pass at a time, at most once per ten minutes
 * per process. A pass that is already running is shared, and a pass never blocks
 * or fails this response.
 */

const STATUSES: readonly string[] = ['live', 'upcoming', 'final'];

/** A match state this site knows, or null. An arbitrary value is never queried. */
const statusParam = (value: string | null): SportsHighlightStatus | null =>
  value && STATUSES.includes(value) ? (value as SportsHighlightStatus) : null;

/** A whole-number parameter, or null when absent, blank or not a number. */
const intParam = (value: string | null, min: number): number | null => {
  if (value === null || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min ? Math.trunc(parsed) : null;
};

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const refresh = params.get('refresh') === '1';
  const indexed = params.get('index') === '1';
  const board = await getSportsHighlights(refresh);

  if (!indexed) {
    return NextResponse.json(board, {
      headers: { 'Cache-Control': refresh ? 'no-store' : 'public, max-age=120, stale-while-revalidate=300' },
    });
  }

  const kind = params.get('kind');
  const query: HighlightsIndexQuery = {
    kind: kind === 'match' || kind === 'league' ? kind : null,
    league: params.get('league'),
    status: statusParam(params.get('status')),
    days: intParam(params.get('days'), 1),
    limit: intParam(params.get('limit'), 1),
    offset: intParam(params.get('offset'), 0),
  };
  const index = await highlightsStore.read(query);

  // Not awaited: the response does not wait for upstream work, and a sweep
  // resolves rather than rejects, so there is nothing to catch here either.
  void runHighlightsSweep({});

  return NextResponse.json({ board, index }, { headers: { 'Cache-Control': 'no-store' } });
}
