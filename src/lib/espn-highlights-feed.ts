/**
 * Server-side match highlights feed for the homepage.
 *
 * Follows the shape of the other Hyper Sports feeds (`espn-leaders-feed`,
 * `espn-standings-feed`): a short-lived cache, an in-flight guard so concurrent
 * renders share one request, and a bundled fallback when ESPN does not answer.
 * A failure here must never break the homepage, so errors resolve to an
 * `unavailable` board instead of rejecting.
 *
 * ESPN has no highlights collection endpoint; a game's clips live on that
 * game's own video collection. So the board the site already fetches supplies
 * the fixtures, and a bounded number of those video collections supply the
 * clips.
 */
import { getSportsBoard, type SportsEvent } from './sports';
import { ESPN_LEAGUES } from './sports-catalog';
import { ESPN_REQUEST_HEADERS, EspnEndpointError, espnErrorMessage, espnFailureDetails } from './espn-endpoints';
import { bundledHighlights, normalizeHighlights, type SportsHighlightClip } from './espn-highlights';

export type SportsHighlightsBoard = {
  clips: SportsHighlightClip[];
  status: 'live' | 'partial' | 'unavailable';
  /** How many ESPN video collections answered with a clip. */
  games: number;
  source: { ok: boolean; url: string; httpStatus: number | null; error?: string; errorKind?: string };
};

/**
 * One video collection per competition keeps the board varied, and a bounded
 * pool keeps the fan-out small. ESPN publishes clips for some competitions and
 * not for others (the Champions League and the NBA answer with clips, the
 * Premier League and the NFL with an empty list), so the pool is wider than the
 * board it feeds: a handful of fixtures have to be asked before one of them
 * carries a clip.
 */
const MAX_GAMES_PER_LEAGUE = 1;
const MAX_GAMES = 10;
const MAX_CLIPS = 12;
const SUMMARY_TIMEOUT_MS = 6_000;
const LIVE_TTL = 15 * 60_000;
const FAILURE_TTL = 60_000;

const cache = new Map<string, { at: number; board: SportsHighlightsBoard }>();
let pending: Promise<SportsHighlightsBoard> | null = null;

/**
 * The video collection for one fixture.
 *
 * `SportsEvent.sport` is the site's own sport kind (`football`,
 * `american-football`), while ESPN addresses a league by its provider path
 * (`soccer/eng.1`), so the catalog supplies the path. The board id is namespaced
 * (`espn-epl-401234`) and the video collection wants the provider's own id,
 * which the event carries; sample fixtures have none and are skipped.
 *
 * The game summary is *not* a substitute: read live, it answers with boxscore,
 * plays, leaders and standings but no videos at all, so the clips have to come
 * from here.
 */
const videosUrl = (event: SportsEvent) => {
  const meta = ESPN_LEAGUES.find((league) => league.slug === event.league);
  const eventId = event.sourceId ?? null;
  const path = meta ? `${meta.sport}/${meta.league}` : null;
  if (!path || !eventId || !/^[a-z][a-z0-9-]*\/[a-z0-9][a-z0-9._-]*$/.test(path)) return null;
  return `https://site.api.espn.com/apis/site/v2/sports/${path}/videos?event=${encodeURIComponent(eventId)}`;
};

/** Live and finished games carry highlights; upcoming fixtures usually do not. */
const ORDER = { live: 0, final: 1, upcoming: 2 } as const;

function pickGames(events: SportsEvent[]): SportsEvent[] {
  const perLeague = new Map<string, number>();
  const chosen: SportsEvent[] = [];
  for (const event of [...events].sort((a, b) => {
    const order = ORDER[a.status] - ORDER[b.status];
    return order !== 0 ? order : new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
  })) {
    const seen = perLeague.get(event.league) ?? 0;
    if (seen >= MAX_GAMES_PER_LEAGUE) continue;
    perLeague.set(event.league, seen + 1);
    chosen.push(event);
    if (chosen.length >= MAX_GAMES) break;
  }
  return chosen;
}

const contextFor = (event: SportsEvent) => ({
  eventId: event.id,
  eventName: `${event.home.name} vs ${event.away.name}`,
  sport: event.sport,
  league: event.league,
  leagueName: event.leagueName,
  home: event.home.name,
  away: event.away.name,
  homeLogo: event.home.logo ?? null,
  awayLogo: event.away.logo ?? null,
  startAt: event.startAt,
  status: event.status,
});

async function readClips(event: SportsEvent) {
  const url = videosUrl(event);
  if (!url) return { url: null, httpStatus: null, clips: [] as SportsHighlightClip[] };
  const signal = AbortSignal.timeout(SUMMARY_TIMEOUT_MS);
  const response = await fetch(url, { headers: ESPN_REQUEST_HEADERS, cache: 'no-store', signal });
  if (!response.ok) throw new EspnEndpointError(`ESPN HTTP ${response.status}`, url, 'http', response.status, undefined);
  const clips = normalizeHighlights(await response.json(), contextFor(event));
  return { url, httpStatus: response.status, clips };
}

async function fetchHighlights(): Promise<SportsHighlightsBoard> {
  const board = await getSportsBoard();
  const games = pickGames(board.events);
  const sources: { ok: boolean; url: string; httpStatus: number | null; error?: string; errorKind?: string }[] = [];

  const settled = await Promise.allSettled(games.map(readClips));
  const clips: SportsHighlightClip[] = [];
  // ESPN publishes clips for some competitions and not for others, so the
  // board counts the collections that actually answered with a clip rather
  // than the ones it asked.
  let read = 0;
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      if (result.value.clips.length) read += 1;
      clips.push(...result.value.clips);
      if (result.value.url) sources.push({ ok: true, url: result.value.url, httpStatus: result.value.httpStatus });
      continue;
    }
    const reason = result.reason;
    const url = reason instanceof EspnEndpointError ? reason.url : 'https://site.api.espn.com/apis/site/v2/sports';
    sources.push({ ok: false, ...espnFailureDetails(reason, url) });
  }

  const anyOk = sources.some((source) => source.ok);
  // A board with no clips is worse than useless on the homepage: fall back.
  if (anyOk && clips.length) {
    return {
      clips: clips.slice(0, MAX_CLIPS),
      status: sources.every((source) => source.ok) ? 'live' : 'partial',
      games: read,
      source: sources.find((source) => source.ok)!,
    };
  }
  return {
    clips: bundledHighlights(),
    status: 'unavailable',
    games: games.length,
    source: {
      ok: false,
      url: sources[0]?.url ?? 'https://site.api.espn.com/apis/site/v2/sports',
      httpStatus: sources[0]?.httpStatus ?? null,
      errorKind: sources[0]?.errorKind,
      error: sources[0]?.error ?? 'ESPN returned no highlight videos',
    },
  };
}

/** Cached highlight clips; concurrent callers share a single fan-out. */
export function getSportsHighlights(refresh = false): Promise<SportsHighlightsBoard> {
  const saved = cache.get('highlights');
  const ttl = saved?.board.status === 'unavailable' ? FAILURE_TTL : LIVE_TTL;
  if (!refresh && saved && Date.now() - saved.at < ttl) return Promise.resolve(saved.board);
  if (pending) return pending;
  const job = fetchHighlights().then((board) => {
    if (cache.size >= 20) cache.delete(cache.keys().next().value!);
    cache.set('highlights', { at: Date.now(), board });
    return board;
  }).finally(() => { pending = null; });
  pending = job;
  return job;
}
