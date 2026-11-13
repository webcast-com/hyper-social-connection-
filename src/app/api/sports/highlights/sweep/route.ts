import { NextRequest, NextResponse } from 'next/server';
import { highlightsStore } from '@/lib/highlights-index';
import { runHighlightsSweep } from '@/lib/highlights-sweep';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Walk one bounded slice of the catalog and store what ESPN publishes.
 *
 * This is the endpoint that makes "all competitions" affordable. ESPN has no bulk
 * highlights endpoint and no date range, so coverage is built a pass at a time:
 * at most 24 scoreboards and 24 game collections per pass, 8 in flight, inside a
 * shared four-second deadline, with the cursor stored in Postgres so the next
 * pass continues where this one stopped instead of starting over.
 *
 * A pass is rate-limited per process — ten minutes when it happens on the way
 * past a page load, thirty seconds when it is asked for explicitly, five minutes
 * per named competition — and the limit applies after a failure too, so a refused
 * or throttled ESPN is backed off from rather than hammered. `?force=1` uses the
 * explicit interval; it does not remove it.
 *
 * `?league=` walks one competition completely (all seven days, up to forty
 * games) instead of a slice of the catalog, which is how a reader gets a full
 * reel for the competition they care about without waiting for the rotation.
 *
 * The response reports what the pass actually cost — cells walked, games asked,
 * requests made, clips stored, and whether the deadline cut it short — so its
 * behaviour is never a guess. Nothing here invents a clip: a competition ESPN
 * publishes no per-game clips for stays empty on the match side, and the pass
 * says so by storing nothing.
 */

const intParam = (value: string | null, min: number): number | null => {
  if (value === null || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min ? Math.trunc(parsed) : null;
};

async function sweep(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const pass = await runHighlightsSweep({
    league: params.get('league'),
    days: intParam(params.get('days'), 1),
    force: params.get('force') === '1',
  });
  // A sweep writes, so it is never cached, and its summary is read fresh: the
  // caller asked what the index holds now.
  return NextResponse.json(
    { pass, summary: pass.summary.ok ? pass.summary : await highlightsStore.summary() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const GET = sweep;
export const POST = sweep;
