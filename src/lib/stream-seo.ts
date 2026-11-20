/**
 * Structured data for the live-stream screen: the streamed fixtures, each as a
 * schema.org `BroadcastEvent` of a `SportsEvent`.
 *
 * What is said, and what is not:
 *
 *   - only fixtures that are being streamed now or are still to be played are
 *     listed. A finished or postponed match is not a broadcast anyone can open;
 *   - every value is one the page also shows: the two sides, the competition,
 *     the kick-off SportSRC reported. A kick-off that was not reported is left
 *     out rather than guessed;
 *   - `url` is this page opened on that match, which is where it can be watched;
 *   - nobody is named as the broadcaster. The player is a third party's embed,
 *     so no `publisher`, `provider` or video address is claimed, and no
 *     `VideoObject` is emitted: that needs a thumbnail and a video URL of the
 *     stream itself, which this site does not have.
 *
 * Pure: no network, no environment. The page passes in the board it rendered.
 */
import { orderStreamMatches, type StreamBoard, type StreamMatch, type StreamTeam } from './sportsrc';

/** How many fixtures are described. Bounds the markup; the list is live-first. */
export const STREAM_BROADCAST_LIMIT = 30;

type Json = Record<string, unknown>;

const team = (side: StreamTeam): Json => ({
  '@type': 'SportsTeam',
  name: side.name,
  ...(side.badge ? { logo: side.badge } : {}),
});

function broadcast(match: StreamMatch, origin: string, sport: string): Json {
  const where = [match.league, match.country].filter(Boolean).join(', ');
  const started = match.startAt ? { startDate: match.startAt } : {};
  return {
    '@type': 'BroadcastEvent',
    name: `${match.title} live stream`,
    description: `Live stream of ${match.home.name} vs ${match.away.name}${where ? ` (${where})` : ''}.`,
    isLiveBroadcast: true,
    ...started,
    url: `${origin}/sports/live?match=${encodeURIComponent(match.id)}`,
    broadcastOfEvent: {
      '@type': 'SportsEvent',
      name: match.title,
      sport,
      ...started,
      homeTeam: team(match.home),
      awayTeam: team(match.away),
    },
  };
}

/**
 * The `ItemList` of broadcasts for a board, or null when there is nothing to
 * describe: the provider did not answer, or no listed fixture is live or to come.
 */
export function streamBroadcastsStructuredData(board: StreamBoard, siteUrl: string, limit = STREAM_BROADCAST_LIMIT): Json | null {
  if (board.state !== 'ok') return null;
  const origin = siteUrl.replace(/\/+$/, '');
  const listed = orderStreamMatches(board.matches)
    .filter((match) => match.hasStream && (match.status === 'live' || match.status === 'upcoming'))
    .slice(0, Math.max(0, limit));
  if (listed.length === 0) return null;
  const sport = board.sports.find((item) => item.id === board.sport)?.name ?? 'Football';
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Live ${sport.toLowerCase()} streams`,
    url: `${origin}/sports/live`,
    numberOfItems: listed.length,
    itemListElement: listed.map((match, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: broadcast(match, origin, sport),
    })),
  };
}
