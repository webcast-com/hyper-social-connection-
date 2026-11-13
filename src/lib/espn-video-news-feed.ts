/**
 * Server-side league video news feed.
 *
 * A separate stack from the match highlights board, on purpose: it asks
 * different ESPN endpoints, keeps its own cache, reports its own sources and
 * renders through its own card. Nothing here reads or writes
 * `espn-highlights-feed.ts`, `/api/sports/highlights` or the highlights play
 * card, so a change to one cannot break the other.
 *
 * Shape follows the other Hyper Sports feeds — a short-lived cache, an in-flight
 * guard so concurrent renders share one fan-out, and honest failure reporting.
 * Two rules it does not bend:
 *
 *   1. **No invented clips.** When ESPN does not answer, the board is empty and
 *      marked `unavailable`. There is no bundled sample list here: a feeds
 *      section that shows a fake goal clip is worse than one that shows nothing.
 *   2. **No media in the listing.** A league's news feed yields clip pages and
 *      ids, not files, so listing 12 leagues costs 12 requests. The playable
 *      rendition is resolved per clip (`resolveVideoNewsMedia`) — when a reader
 *      presses play, or when a sweep pre-warms a bounded few — and is then stored
 *      beside the clip in the index, so it is asked for once rather than once per
 *      process lifetime. The feed still reads nothing from
 *      `espn-highlights-feed.ts` and writes nothing to the highlights board: the
 *      index is shared storage, not a shared feed.
 *
 * A league that answers with no videos is a normal answer, not a failure: ESPN
 * publishes video for some competitions and not for others.
 */
import { ESPN_LEAGUES, type EspnLeague } from './sports-catalog';
import { ESPN_REQUEST_HEADERS, EspnEndpointError, espnFailureDetails } from './espn-endpoints';
import {
  combineVideoNews,
  espnClipRecordUrl,
  isEspnClipRecordUrl,
  parseVideoNews,
  parseVideoNewsMedia,
  type SportsVideoNewsBoard,
  type SportsVideoNewsClip,
  type SportsVideoNewsMedia,
  type VideoNewsLeague,
} from './espn-video-news';
import { highlightsStore, type HighlightsStore } from './highlights-index';

/**
 * The competitions asked for league video, by catalog slug.
 *
 * Bounded on purpose: each entry is one request per refresh, and the feeds
 * section only shows a couple of cards. Paths and labels are resolved from
 * `ESPN_LEAGUES`, so the catalog stays the single source of truth for provider
 * ids — a slug that is not configured is skipped rather than guessed at.
 */
export const VIDEO_NEWS_SLUGS = [
  'ucl', 'epl', 'laliga', 'seriea', 'bundesliga', 'ligue1',
  'caf', 'afcon', 'mls', 'liga-mx', 'nba', 'nfl',
] as const;

const MAX_CLIPS = 12;
/** Clips the feeds section interleaves; the rest stay available to the API. */
export const MAX_FEED_CLIPS = 2;
const NEWS_LIMIT = 20;
const REQUEST_TIMEOUT_MS = 6_000;
const CONCURRENCY = 6;
const LIVE_TTL = 15 * 60_000;
const FAILURE_TTL = 60_000;
/** A resolved rendition is worth remembering: the file does not change. */
const MEDIA_TTL = 15 * 60_000;
/**
 * How long one server render waits for a cold fan-out. The feeds section is
 * served from whatever is already known; the rest arrives on the next render.
 */
const RENDER_BUDGET_MS = 2_500;

const NEWS_PATH = /^[a-z][a-z0-9-]*\/[a-z0-9][a-z0-9._-]*$/;

/** The league's news feed URL, built from the catalog's own path segments. */
export function espnLeagueNewsUrl(league: Pick<EspnLeague, 'sport' | 'league'>, limit = NEWS_LIMIT): string | null {
  const path = `${league.sport}/${league.league}`;
  if (!NEWS_PATH.test(path)) return null;
  return `https://site.api.espn.com/apis/site/v2/sports/${path}/news?limit=${limit}`;
}

/** Configured competitions this feed asks, in the order above. */
export function videoNewsLeagues(): VideoNewsLeague[] {
  const leagues: VideoNewsLeague[] = [];
  for (const slug of VIDEO_NEWS_SLUGS) {
    const meta = ESPN_LEAGUES.find((league) => league.slug === slug);
    if (!meta) continue;
    leagues.push({ slug: meta.slug, name: meta.name, kind: meta.kind, sport: meta.sport, league: meta.league });
  }
  return leagues;
}

/** Bounded fan-out, in the shape the other feeds use. */
async function settle<T>(jobs: (() => Promise<T>)[]): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
    while (next < jobs.length) {
      const index = next++;
      try {
        results[index] = { status: 'fulfilled', value: await jobs[index]() };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }));
  return results;
}

type Source = { ok: boolean; url: string; httpStatus: number | null; error?: string; errorKind?: string };

async function readLeague(league: VideoNewsLeague): Promise<{ source: Source; clips: SportsVideoNewsClip[] }> {
  const url = espnLeagueNewsUrl(league);
  if (!url) throw new EspnEndpointError('Invalid ESPN news path', url ?? '', 'invalid-response', null);
  const response = await fetch(url, {
    headers: ESPN_REQUEST_HEADERS,
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new EspnEndpointError(`ESPN HTTP ${response.status}`, url, 'http', response.status);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new EspnEndpointError('ESPN returned invalid JSON', url, 'invalid-response', response.status);
  }
  return { source: { ok: true, url, httpStatus: response.status }, clips: parseVideoNews(payload, league) };
}

async function fetchVideoNews(): Promise<SportsVideoNewsBoard> {
  const leagues = videoNewsLeagues();
  if (!leagues.length) {
    return {
      clips: [], status: 'unavailable', leagues: 0,
      source: { ok: false, url: 'https://site.api.espn.com/apis/site/v2/sports', httpStatus: null, error: 'No configured competitions to ask for league video' },
    };
  }

  const settled = await settle(leagues.map((league) => () => readLeague(league)));
  const feeds: SportsVideoNewsClip[][] = [];
  const sources: Source[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      sources.push(result.value.source);
      feeds.push(result.value.clips);
      continue;
    }
    // One league that will not answer is not a reason to lose the others.
    sources.push({ ok: false, ...espnFailureDetails(result.reason, 'https://site.api.espn.com/apis/site/v2/sports') });
  }

  const answered = sources.filter((source) => source.ok).length;
  const clips = combineVideoNews(feeds, MAX_CLIPS);
  const status: SportsVideoNewsBoard['status'] = answered === 0
    ? 'unavailable'
    : answered === sources.length ? 'live' : 'partial';

  return {
    clips,
    status,
    leagues: feeds.filter((feed) => feed.length > 0).length,
    // The first league that answered, so a card can say where a clip came from.
    source: sources.find((source) => source.ok) ?? sources[0],
  };
}

const cache = new Map<string, { at: number; board: SportsVideoNewsBoard }>();
let pending: Promise<SportsVideoNewsBoard> | null = null;

/** Cached league video news; concurrent callers share one fan-out. */
export function getSportsVideoNews(refresh = false): Promise<SportsVideoNewsBoard> {
  const saved = cache.get('video-news');
  const ttl = saved?.board.status === 'unavailable' ? FAILURE_TTL : LIVE_TTL;
  if (!refresh && saved && Date.now() - saved.at < ttl) return Promise.resolve(saved.board);
  if (pending) return pending;
  const job = fetchVideoNews().then((board) => {
    cache.set('video-news', { at: Date.now(), board });
    return board;
  }).finally(() => { pending = null; });
  pending = job;
  return job;
}

/**
 * The board for one server render, with a budget.
 *
 * A cold fan-out can take longer than a page should wait, so the render is
 * served from whatever is already known and the request keeps running in the
 * background to fill the cache for the next one. On timeout this resolves to an
 * empty `unavailable` board rather than throwing: the feeds section then shows
 * no video cards, which is the honest outcome, and the rest of the page is
 * untouched. The in-flight job is never cancelled, so the work is not repeated.
 */
export async function getSportsVideoNewsForRender(budgetMs = RENDER_BUDGET_MS): Promise<SportsVideoNewsBoard> {
  const job = getSportsVideoNews();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<SportsVideoNewsBoard>((resolve) => {
    timer = setTimeout(() => resolve({
      clips: [],
      status: 'unavailable',
      leagues: 0,
      source: {
        ok: false,
        url: 'https://site.api.espn.com/apis/site/v2/sports',
        httpStatus: null,
        error: `League video news did not answer within ${budgetMs}ms`,
        errorKind: 'timeout',
      },
    }), budgetMs);
  });
  try {
    return await Promise.race([job, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ── On-demand media resolution ─────────────────────────────────────────── */

const mediaCache = new Map<string, { at: number; media: SportsVideoNewsMedia }>();
const mediaPending = new Map<string, Promise<SportsVideoNewsMedia>>();

const NO_MEDIA: SportsVideoNewsMedia = { mp4: null, hls: null, page: null, thumbnail: null, duration: null };

/**
 * The playable rendition for one clip.
 *
 * Accepts only a numeric ESPN clip id and builds the record URL itself, so this
 * can never be pointed at an arbitrary host. A clip ESPN will not serve — a
 * geofenced rendition, a removed clip, an offline API — resolves to no media,
 * and the card falls back to its labelled ESPN link instead of a dead player.
 *
 * The stored index is asked before ESPN, and answered renditions are written back
 * to it. In memory a rendition lived 15 minutes and died on every deploy, so the
 * same clip was resolved again forever; stored beside the clip it is resolved
 * once, plays for as long as the row is kept, and costs the next reader nothing.
 * A refusal is still not cached — a reader who presses play again gets a fresh
 * attempt — but it is recorded as a probe, so a sweep's pre-warm does not spend
 * its budget re-asking a clip that has already said no.
 *
 * `store` is injectable for tests; every call is inert without a database, so the
 * behaviour with no storage is exactly what it was before.
 */
export async function resolveVideoNewsMedia(
  clipId: string,
  store: HighlightsStore = highlightsStore,
): Promise<SportsVideoNewsMedia> {
  const url = espnClipRecordUrl(clipId);
  if (!url || !isEspnClipRecordUrl(url)) return NO_MEDIA;

  const cached = mediaCache.get(url);
  if (cached && Date.now() - cached.at < MEDIA_TTL) return cached.media;
  const inflight = mediaPending.get(url);
  if (inflight) return inflight;

  /** One probe row per rendition asked for: 1 when it plays, 0 when it does not. */
  const remember = (resolved: boolean) => {
    void store.recordProbes([{ key: mediaProbeKey(clipId), clips: resolved ? 1 : 0 }]);
  };

  const job = (async () => {
    const stored = await store.findNewsMedia(clipId);
    if (stored) {
      mediaCache.set(url, { at: Date.now(), media: stored });
      return stored;
    }
    try {
      const response = await fetch(url, {
        headers: ESPN_REQUEST_HEADERS,
        cache: 'no-store',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        remember(false);
        return NO_MEDIA;
      }
      const media = parseVideoNewsMedia(await response.json());
      // Only a clip that actually plays is worth remembering; a refusal may be
      // transient and should be asked again.
      if (media.mp4 || media.hls) {
        mediaCache.set(url, { at: Date.now(), media });
        void store.storeNewsMedia(clipId, media).then((rows) => { if (rows) remember(true); });
      } else {
        remember(false);
      }
      return media;
    } catch {
      remember(false);
      return NO_MEDIA;
    } finally {
      mediaPending.delete(url);
    }
  })();

  mediaPending.set(url, job);
  return job;
}

/**
 * The probe key for one clip's rendition.
 *
 * Namespaced apart from a game collection's `probe:{league}:{sourceId}` so the two
 * never collide in the same table, and so the sweeper can ask which renditions are
 * worth pre-warming without disturbing the never-ask-twice rule for collections.
 */
export const mediaProbeKey = (clipId: string) => `media:${clipId}`;

/**
 * True when this clip's rendition is already in memory, so resolving it again
 * would make no request.
 *
 * Exists so a sweep's pre-warm can count its cost exactly: the pass report is a
 * claim about how many upstream requests were made, and a clip served from memory
 * is not one of them.
 */
export function hasResolvedNewsMedia(clipId: string): boolean {
  const url = espnClipRecordUrl(clipId);
  if (!url) return false;
  const cached = mediaCache.get(url);
  return !!cached && Date.now() - cached.at < MEDIA_TTL && !!(cached.media.mp4 || cached.media.hls);
}

/** Test seam: forget the board and every resolved rendition. */
export function resetVideoNewsCaches(): void {
  cache.clear();
  mediaCache.clear();
  mediaPending.clear();
  pending = null;
}
