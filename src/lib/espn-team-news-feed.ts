import { ESPN_REQUEST_HEADERS, EspnEndpointError, espnErrorMessage, espnFailureDetails, espnResponseMetadata } from './espn-endpoints';
import { parseMatchDetails, resolveMatch } from './espn-match';
import { newsUrl, parseNews } from './espn-news';
import { filterTeamArticles, parseSummaryInjuries, type TeamNewsBoard, type TeamNewsSource } from './espn-team-news';

const cache = new Map<string, { at: number; board: TeamNewsBoard }>();
const pending = new Map<string, Promise<TeamNewsBoard>>();
const READY_MS = 180_000;
const FAILED_MS = 15_000;

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  let httpStatus: number | null = null;
  try {
    const response = await fetch(url, { headers: ESPN_REQUEST_HEADERS, cache: 'no-store', signal });
    httpStatus = response.status;
    if (!response.ok) {
      const metadata = espnResponseMetadata(response.headers);
      await response.body?.cancel().catch(() => undefined);
      throw new EspnEndpointError(`ESPN HTTP ${httpStatus}`, url, 'http', httpStatus, metadata);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof EspnEndpointError) throw error;
    throw new EspnEndpointError(espnErrorMessage(error), url, signal.aborted ? 'timeout' : httpStatus !== null ? 'invalid-response' : 'network', httpStatus);
  }
}

/** One summary read (injuries + team names) and one league news read, each isolated. */
async function fetchTeamNews(league: string, eventId: string): Promise<TeamNewsBoard> {
  const { meta, reference, url: summaryUrl } = resolveMatch(league, eventId);
  const articlesUrl = newsUrl(meta);
  const signal = AbortSignal.timeout(8_000);
  const sources: TeamNewsSource[] = [];
  const board: TeamNewsBoard = {
    reference, fetchedAt: new Date().toISOString(), status: 'unavailable', message: null, injuries: [], articles: [], sources,
  };
  const [summaryResult, newsResult] = await Promise.allSettled([
    fetchJson(summaryUrl, signal), fetchJson(articlesUrl, signal),
  ]);
  let teamNames: string[] = [];
  if (summaryResult.status === 'fulfilled') {
    try {
      const match = parseMatchDetails(summaryResult.value, reference);
      teamNames = match.teams.map((team) => team.name);
      board.injuries = parseSummaryInjuries(summaryResult.value);
      sources.push({ kind: 'injuries', ok: true, url: summaryUrl, httpStatus: 200 });
    } catch {
      sources.push({ kind: 'injuries', ok: false, url: summaryUrl, httpStatus: null, error: 'ESPN returned invalid match details' });
    }
  } else {
    sources.push({ kind: 'injuries', ok: false, ...espnFailureDetails(summaryResult.reason, summaryUrl) });
  }
  if (newsResult.status === 'fulfilled' && teamNames.length) {
    board.articles = filterTeamArticles(parseNews(newsResult.value, meta), teamNames);
    sources.push({ kind: 'articles', ok: true, url: articlesUrl, httpStatus: 200 });
  } else if (newsResult.status === 'fulfilled') {
    sources.push({ kind: 'articles', ok: false, url: articlesUrl, httpStatus: null, error: 'Team names unavailable; articles cannot be matched to this fixture' });
  } else {
    sources.push({ kind: 'articles', ok: false, ...espnFailureDetails(newsResult.reason, articlesUrl) });
  }
  const okCount = sources.filter((source) => source.ok).length;
  board.status = okCount === 0 ? 'unavailable'
    : okCount < sources.length ? 'partial'
      : board.injuries.length || board.articles.length ? 'ready' : 'empty';
  board.message = board.status === 'unavailable' ? 'Team news is unavailable for this fixture right now.'
    : board.status === 'partial' ? 'Some team news feeds were unavailable; shown items may be incomplete.' : null;
  return board;
}

/** Bounded shared cache so one opened tip costs at most two upstream requests. */
export function getTeamNews(league: string, eventId: string, refresh = false): Promise<TeamNewsBoard> {
  const { url } = resolveMatch(league, eventId);
  const active = pending.get(url);
  if (active) return active;
  const saved = cache.get(url);
  if (!refresh && saved && Date.now() - saved.at < (saved.board.status === 'unavailable' ? FAILED_MS : READY_MS)) return Promise.resolve(saved.board);
  if (pending.size >= 4) return Promise.reject(new Error('Team news is busy; try again shortly'));
  const job = fetchTeamNews(league, eventId).then((board) => {
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(url, { at: Date.now(), board });
    return board;
  }).finally(() => pending.delete(url));
  pending.set(url, job);
  return job;
}
