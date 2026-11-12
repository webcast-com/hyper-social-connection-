/**
 * Server-side team detail feed.
 *
 * Its own cache, in-flight guard and failure reporting, in the shape the match
 * details feed uses: bounded work, one job per team, honest sources. It shares
 * nothing with the match highlights board.
 *
 * The three parts of a team page — identity, fixtures, squad — are three
 * independent requests settled together, so one refusal does not lose the other
 * two and `sources` records what each part did. A board is `ready` when all
 * three answered, `partial` when some did and `unavailable` when none did; there
 * is no sample team behind any of those.
 */
import { ESPN_REQUEST_HEADERS, EspnEndpointError, espnErrorMessage, espnFailureDetails, espnResponseMetadata } from './espn-endpoints';
import {
  cdnPortraits,
  parseTeamFixtures,
  parseTeamInfo,
  parseTeamRoster,
  resolveTeam,
  type TeamBoard,
  type TeamFixture,
  type TeamIdentity,
  type TeamRosterEntry,
  type TeamSource,
} from './espn-team';

/** A squad and a season change slowly; a refusal is worth retrying soon. */
const READY_TTL = 300_000;
const FAILURE_TTL = 15_000;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_PENDING = 8;
const MAX_CACHED = 100;

const cache = new Map<string, { at: number; board: TeamBoard }>();
const pending = new Map<string, Promise<TeamBoard>>();

/** One part of the page: fetch, parse, and report what happened either way. */
async function readPart<T>(url: string, part: TeamSource['part'], parse: (payload: unknown) => T, empty: T): Promise<{ source: TeamSource; value: T }> {
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let httpStatus: number | null = null;
  try {
    const response = await fetch(url, { headers: ESPN_REQUEST_HEADERS, cache: 'no-store', signal });
    httpStatus = response.status;
    if (!response.ok) {
      const metadata = espnResponseMetadata(response.headers);
      await response.body?.cancel().catch(() => undefined);
      throw new EspnEndpointError(`ESPN HTTP ${httpStatus}`, url, 'http', httpStatus, metadata);
    }
    // A payload that is not about this team throws in the parser, and is
    // reported as an invalid response rather than rendered under its name.
    return { source: { ok: true, part, url, httpStatus }, value: parse(await response.json()) };
  } catch (error) {
    const failure = error instanceof EspnEndpointError
      ? error
      : new EspnEndpointError(
        signal.aborted ? 'ESPN team request timed out' : httpStatus !== null ? 'ESPN returned unusable team data' : espnErrorMessage(error),
        url,
        signal.aborted ? 'timeout' : httpStatus !== null ? 'invalid-response' : 'network',
        httpStatus,
      );
    return { source: { ok: false, part, ...espnFailureDetails(failure, url) }, value: empty };
  }
}

async function fetchTeam(league: string, teamId: string): Promise<TeamBoard> {
  const { meta, reference, urls } = resolveTeam(league, teamId);
  const [info, schedule, roster] = await Promise.all([
    readPart<TeamIdentity | null>(urls.info, 'info', (payload) => parseTeamInfo(payload, reference), null),
    readPart<TeamFixture[]>(urls.schedule, 'schedule', (payload) => parseTeamFixtures(payload, reference), []),
    readPart<TeamRosterEntry[]>(urls.roster, 'roster', (payload) => parseTeamRoster(payload, meta), []),
  ]);

  const sources = [info.source, schedule.source, roster.source];
  const answered = sources.filter((source) => source.ok).length;
  return {
    reference,
    leagueName: meta.name,
    sport: meta.kind,
    portraitsFromCdn: cdnPortraits(meta),
    team: info.value,
    fixtures: schedule.value,
    roster: roster.value,
    status: answered === 0 ? 'unavailable' : answered === sources.length ? 'ready' : 'partial',
    fetchedAt: new Date().toISOString(),
    sources,
  };
}

/** One team's detail, with bounded shared cache and no fabricated data. */
export function getTeamDetail(league: string, teamId: string, bypassCache = false): Promise<TeamBoard> {
  const { urls } = resolveTeam(league, teamId);
  const saved = cache.get(urls.info);
  if (!bypassCache && saved && Date.now() - saved.at < (saved.board.status === 'unavailable' ? FAILURE_TTL : READY_TTL)) {
    return Promise.resolve(saved.board);
  }
  const active = pending.get(urls.info);
  if (active) return active;
  if (pending.size >= MAX_PENDING) return Promise.reject(new Error('Team details are busy; try again shortly'));
  const job = fetchTeam(league, teamId).then((board) => {
    if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!);
    cache.set(urls.info, { at: Date.now(), board });
    return board;
  }).finally(() => pending.delete(urls.info));
  pending.set(urls.info, job);
  return job;
}

/** Test seam: forget every cached team and drop any in-flight work. */
export function resetTeamCaches(): void {
  cache.clear();
  pending.clear();
}
