/**
 * Server-side league news feed.
 *
 * The same shape as the other Hyper Sports feeds: a short-lived cache per
 * competition, an in-flight guard so concurrent callers share one request, and
 * honest failure reporting. There is no bundled sample news: when ESPN does not
 * answer, the board is `unavailable` and carries no articles.
 */
import { ESPN_REQUEST_HEADERS, EspnEndpointError, espnErrorMessage, espnFailureDetails } from './espn-endpoints';
import type { EspnLeague } from './sports-catalog';
import { combineNews, newsUrl, parseNews, type SportsNewsArticle, type SportsNewsBoard, type SportsNewsSource } from './espn-news';

type LeagueNews = { articles: SportsNewsArticle[]; source: SportsNewsSource };

const cache = new Map<string, { at: number; news: LeagueNews }>();
const pending = new Map<string, Promise<LeagueNews>>();
const LIVE_TTL = 10 * 60_000;
const FAILURE_TTL = 30_000;

async function fetchLeagueNews(league: EspnLeague): Promise<LeagueNews> {
  const url = newsUrl(league);
  const signal = AbortSignal.timeout(8000);
  let httpStatus: number | null = null;
  try {
    const response = await fetch(url, { headers: ESPN_REQUEST_HEADERS, cache: 'no-store', signal });
    httpStatus = response.status;
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new EspnEndpointError(`ESPN HTTP ${httpStatus}`, url, 'http', httpStatus, undefined);
    }
    const payload: unknown = await response.json();
    if (payload === null || typeof payload !== 'object' || !Array.isArray((payload as { articles?: unknown }).articles)) {
      throw new EspnEndpointError('ESPN returned no article list', url, 'invalid-response', httpStatus, undefined);
    }
    return { articles: parseNews(payload, league), source: { league: league.slug, ok: true, url, httpStatus } };
  } catch (error) {
    const failure = error instanceof EspnEndpointError ? error : new EspnEndpointError(
      httpStatus !== null && !signal.aborted ? 'ESPN returned an invalid news response' : espnErrorMessage(error),
      url, signal.aborted ? 'timeout' : httpStatus !== null ? 'invalid-response' : 'network', httpStatus,
    );
    return { articles: [], source: { league: league.slug, ok: false, ...espnFailureDetails(failure, url) } };
  }
}

function leagueNews(league: EspnLeague, refresh: boolean): Promise<LeagueNews> {
  const saved = cache.get(league.slug);
  if (!refresh && saved && Date.now() - saved.at < (saved.news.source.ok ? LIVE_TTL : FAILURE_TTL)) return Promise.resolve(saved.news);
  const running = pending.get(league.slug);
  if (running) return running;
  const request = fetchLeagueNews(league).then((news) => {
    // A failed refresh does not replace an answer that is still fresh enough to show.
    const previous = cache.get(league.slug);
    if (!news.source.ok && previous?.news.source.ok && Date.now() - previous.at < 6 * LIVE_TTL) return previous.news;
    cache.set(league.slug, { at: Date.now(), news });
    return news;
  }).finally(() => { pending.delete(league.slug); });
  pending.set(league.slug, request);
  return request;
}

/** News for a few competitions as one board. Never rejects. */
export async function getSportsNews(leagues: EspnLeague[], refresh = false): Promise<SportsNewsBoard> {
  const results = await Promise.all(leagues.map((league) => leagueNews(league, refresh)));
  const articles = combineNews(results.map((result) => result.articles));
  const answered = results.some((result) => result.source.ok);
  return {
    status: articles.length ? 'ready' : answered ? 'empty' : 'unavailable',
    articles,
    leagues: leagues.map((league) => ({ slug: league.slug, name: league.name })),
    fetchedAt: new Date().toISOString(),
    sources: results.map((result) => result.source),
  };
}

/** For tests: forget what was cached. */
export function resetSportsNewsCache(): void { cache.clear(); pending.clear(); }
