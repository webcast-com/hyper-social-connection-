import { NextRequest, NextResponse } from 'next/server';
import { resolveVideoNewsMedia } from '@/lib/espn-video-news-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One clip's playable rendition, fetched when a reader presses play.
 *
 * The listing endpoint deliberately carries no media URLs: a league's news feed
 * reports a clip page and an id, not a file. This route takes the numeric ESPN
 * clip id, builds the clip-record URL itself and returns whatever ESPN serves —
 * an MP4, an HLS playlist, both, or nothing.
 *
 * The stored index is asked first, and an answer ESPN gives is written back to it,
 * so a rendition is resolved once per clip rather than once per process: it plays
 * after a deploy, on another instance, and with ESPN unreachable.
 *
 * Accepting only an id (never a URL) is what keeps this from being an open
 * proxy: the host it contacts is decided here, from a validated pattern, not by
 * the caller. A clip ESPN will not serve resolves to `{ playable: false }` with
 * the clip page, so the card can offer its labelled ESPN link instead of a
 * player that silently does nothing.
 */
export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get('id') || '').trim();
  if (!/^\d{1,20}$/.test(id)) {
    return NextResponse.json(
      { playable: false, error: 'A numeric ESPN clip id is required.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const media = await resolveVideoNewsMedia(id);
  return NextResponse.json(
    { id, playable: !!media.mp4 || !!media.hls, ...media },
    { headers: { 'Cache-Control': media.mp4 || media.hls ? 'private, max-age=300' : 'no-store' } },
  );
}
