/**
 * ESPN scores and fixtures, normalized into a shared board.
 * No external prediction provider is connected.
 * If ESPN is unreachable, return clearly labeled sample fixtures.
 */

import {
  ESPN_LEAGUES, SPORTS_COMPETITIONS, competitionRegion,
  type SportKind, type SportsRegion,
} from './sports-catalog';
import { fetchEspnScoreboard } from './espn-client';
import { espnFailureDetails, espnScoreboardUrl, type EspnEndpointDetails } from './espn-endpoints';
export type { SportKind } from './sports-catalog';

export type EventStatus = 'live' | 'upcoming' | 'final';

export type SportsTeam = {
  name: string;
  short?: string;
  logo?: string | null;
  score?: number | null;
};

export type SportsRace = { title: string; entries: { name: string; position: number | null }[] };

export type SportsEvent = {
  id: string;
  source: 'espn' | 'demo';
  race?: SportsRace;
  sport: SportKind;
  league: string;
  leagueName: string;
  status: EventStatus;
  startAt: string;
  venue?: string | null;
  detail?: string | null;
  home: SportsTeam;
  away: SportsTeam;
  url?: string | null;
};

export type SportsPrediction = {
  id: string;
  source: 'manual' | 'demo';
  federation: string;
  market: string;
  startAt: string;
  homeTeam: string;
  awayTeam: string;
  prediction: string;
  winOdds?: string | null;
  competition?: string | null;
};

export type SportsSourceReport = Partial<EspnEndpointDetails> & {
  id: string;
  ok: boolean;
  count: number;
  error?: string;
};

export type SportsBoard = {
  events: SportsEvent[];
  predictions: SportsPrediction[];
  sources: SportsSourceReport[];
  fetchedAt: string;
  mode: 'live' | 'partial' | 'demo';
};

// Kickoff times are shown to users in Kenyan time (EAT, UTC+3 — no DST).
export const PREDICTION_DISPLAY_TZ = 'Africa/Nairobi';

const CACHE_MS = 45_000;

let cache: { at: number; board: SportsBoard } | null = null;

/**
 * Kickoff label in Nairobi time, e.g. "Sep 2, 22:00 EAT". Explicit locale +
 * timeZone keeps server and client renders identical (no hydration drift),
 * regardless of the viewer's device timezone.
 */
export function formatPredictionKickoff(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const label = new Intl.DateTimeFormat('en-KE', {
    timeZone: PREDICTION_DISPLAY_TZ,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return `${label} EAT`;
}

function mergeEvents(groups: SportsEvent[][]) {
  const seen = new Map<string, SportsEvent>();
  for (const group of groups) {
    for (const ev of group) {
      // ESPN event IDs distinguish same-day doubleheaders and race sessions.
      if (!seen.has(ev.id)) seen.set(ev.id, ev);
    }
  }
  return [...seen.values()].sort((a, b) => {
    const order = { live: 0, upcoming: 1, final: 2 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
  });
}

function demoBoard(): SportsBoard {
  const now = Date.now();
  const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();
  const events: SportsEvent[] = [
    {
      id: 'demo-epl-live',
      source: 'demo',
      sport: 'football',
      league: 'epl',
      leagueName: 'Premier League',
      status: 'live',
      startAt: iso(-55 * 60_000),
      venue: 'Emirates Stadium',
      detail: "54'",
      home: { name: 'Arsenal', short: 'ARS', score: 2 },
      away: { name: 'Chelsea', short: 'CHE', score: 1 },
    },
    {
      id: 'demo-nba-live',
      source: 'demo',
      sport: 'basketball',
      league: 'nba',
      leagueName: 'NBA',
      status: 'live',
      startAt: iso(-80 * 60_000),
      venue: 'Crypto.com Arena',
      detail: 'Q3 4:12',
      home: { name: 'Los Angeles Lakers', short: 'LAL', score: 88 },
      away: { name: 'Boston Celtics', short: 'BOS', score: 84 },
    },
    {
      id: 'demo-ucl-up',
      source: 'demo',
      sport: 'football',
      league: 'ucl',
      leagueName: 'Champions League',
      status: 'upcoming',
      startAt: iso(3 * 60 * 60_000),
      venue: 'Santiago Bernabéu',
      detail: 'Kickoff soon',
      home: { name: 'Real Madrid', short: 'RMA', score: null },
      away: { name: 'Bayern Munich', short: 'BAY', score: null },
    },
    {
      id: 'demo-epl-up',
      source: 'demo',
      sport: 'football',
      league: 'epl',
      leagueName: 'Premier League',
      status: 'upcoming',
      startAt: iso(6 * 60 * 60_000),
      venue: 'Anfield',
      home: { name: 'Liverpool', short: 'LIV', score: null },
      away: { name: 'Manchester City', short: 'MCI', score: null },
    },
    {
      id: 'demo-caf-up',
      source: 'demo',
      sport: 'football',
      league: 'caf',
      leagueName: 'CAF Champions League',
      status: 'upcoming',
      startAt: iso(26 * 60 * 60_000),
      venue: 'Moi International Sports Centre',
      home: { name: 'Gor Mahia', short: 'GOR', score: null },
      away: { name: 'Al Ahly', short: 'AHL', score: null },
    },
    {
      id: 'demo-f1-up',
      source: 'demo',
      sport: 'motorsport',
      league: 'f1',
      leagueName: 'Formula 1',
      status: 'upcoming',
      startAt: iso(48 * 60 * 60_000),
      venue: 'Monza',
      detail: 'Italian Grand Prix',
      race: { title: 'Italian Grand Prix', entries: [] },
      home: { name: 'Race start', short: 'F1', score: null },
      away: { name: 'Monza', short: 'ITA', score: null },
    },
    {
      id: 'demo-laliga-ft',
      source: 'demo',
      sport: 'football',
      league: 'laliga',
      leagueName: 'La Liga',
      status: 'final',
      startAt: iso(-5 * 60 * 60_000),
      venue: 'Spotify Camp Nou',
      detail: 'FT',
      home: { name: 'Barcelona', short: 'BAR', score: 3 },
      away: { name: 'Atlético Madrid', short: 'ATM', score: 1 },
    },
    {
      id: 'demo-nba-ft',
      source: 'demo',
      sport: 'basketball',
      league: 'nba',
      leagueName: 'NBA',
      status: 'final',
      startAt: iso(-8 * 60 * 60_000),
      venue: 'Chase Center',
      detail: 'Final',
      home: { name: 'Golden State Warriors', short: 'GSW', score: 112 },
      away: { name: 'Denver Nuggets', short: 'DEN', score: 108 },
    },
  ];
  // Representative examples, never merged into a board with responding feeds.
  const worldwideSamples = [
    { league: 'mls', home: 'Inter Miami', away: 'LA Galaxy' },
    { league: 'brasileirao', home: 'Flamengo', away: 'Palmeiras' },
    { league: 'jleague', home: 'Vissel Kobe', away: 'Urawa Red Diamonds' },
    { league: 'saudi', home: 'Al Hilal', away: 'Al Nassr' },
    { league: 'south-africa', home: 'Mamelodi Sundowns', away: 'Orlando Pirates' },
    { league: 'aleague', home: 'Melbourne Victory', away: 'Sydney FC' },
    { league: 'wnba', home: 'Las Vegas Aces', away: 'New York Liberty' },
    { league: 'super-rugby', home: 'Blues', away: 'Crusaders' },
    { league: 'mlb', home: 'Los Angeles Dodgers', away: 'New York Yankees' },
    { league: 'nhl', home: 'Toronto Maple Leafs', away: 'Edmonton Oilers' },
  ];
  for (const [index, sample] of worldwideSamples.entries()) {
    const meta = SPORTS_COMPETITIONS.find((competition) => competition.slug === sample.league)!;
    events.push({
      id: `demo-${sample.league}`, source: 'demo', sport: meta.kind,
      league: meta.slug, leagueName: meta.name, status: 'upcoming',
      startAt: iso((index + 2) * 60 * 60_000), detail: 'Sample fixture',
      home: { name: sample.home }, away: { name: sample.away },
    });
  }
  return {
    events,
    predictions: [],
    sources: [{ id: 'demo', ok: true, count: events.length }],
    fetchedAt: new Date().toISOString(),
    mode: 'demo',
  };
}

let inFlight: Promise<SportsBoard> | null = null;

export async function getSportsBoard(opts?: { bypassCache?: boolean }): Promise<SportsBoard> {
  if (!opts?.bypassCache && cache && Date.now() - cache.at < CACHE_MS) return cache.board;
  // The page, sidebar and refresh requests share the same in-progress fetch.
  if (inFlight) return inFlight;
  inFlight = fetchSportsBoard();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

/** Bound provider fan-out as the competition catalog grows. */
async function settleJobs(jobs: (() => Promise<void>)[]) {
  const results: PromiseSettledResult<void>[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(12, jobs.length) }, async () => {
    while (next < jobs.length) {
      const index = next++;
      try {
        await jobs[index]();
        results[index] = { status: 'fulfilled', value: undefined };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }));
  return results;
}

async function fetchSportsBoard(): Promise<SportsBoard> {
  const sources: SportsSourceReport[] = [];
  const groups: SportsEvent[][] = [];

  const espnJobs = ESPN_LEAGUES.map((meta) => async () => {
    const { events, url, httpStatus } = await fetchEspnScoreboard(meta);
    sources.push({ id: `espn:${meta.slug}`, ok: true, count: events.length, url, httpStatus });
    groups.push(events);
  });

  const settled = await settleJobs(espnJobs);
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') return;
    const meta = ESPN_LEAGUES[i];
    sources.push({ id: `espn:${meta.slug}`, ok: false, count: 0,
      ...espnFailureDetails(result.reason, espnScoreboardUrl(meta)) });
  });

  const events = mergeEvents(groups);
  const anyOk = sources.some((s) => s.ok);
  const allOk = sources.length > 0 && sources.every((s) => s.ok);

  const board: SportsBoard = anyOk
    ? {
        events,
        predictions: [],
        sources,
        fetchedAt: new Date().toISOString(),
        mode: allOk ? 'live' : 'partial',
      }
    : demoBoard();

  if (!anyOk) {
    board.sources = [...sources, ...board.sources];
  }

  cache = { at: Date.now(), board };
  return board;
}

export const SPORT_FILTERS: { id: 'all' | EventStatus | SportKind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'final', label: 'Results' },
  { id: 'football', label: 'Football' },
  { id: 'basketball', label: 'Basketball' },
  { id: 'american-football', label: 'American football' },
  { id: 'motorsport', label: 'Motorsport' },
  { id: 'rugby', label: 'Rugby' },
  { id: 'baseball', label: 'Baseball' },
  { id: 'ice-hockey', label: 'Ice hockey' },
];

export function filterSportsEvents(
  events: SportsEvent[],
  filter: 'all' | EventStatus | SportKind,
  options?: { sport?: SportKind | 'all'; status?: EventStatus | 'all'; region?: SportsRegion | 'all'; league?: string; query?: string },
): SportsEvent[] {
  if (options) {
    const query = options.query?.trim().toLowerCase();
    return filterSportsEvents(events, filter).filter((event) =>
      (!options.sport || options.sport === 'all' || event.sport === options.sport) &&
      (!options.status || options.status === 'all' || event.status === options.status) &&
      (!options.region || options.region === 'all' || competitionRegion(event.league) === options.region) &&
      (!options.league || options.league === 'all' || event.league === options.league) &&
      (!query || `${event.home.name} ${event.away.name} ${event.leagueName} ${event.race?.title || ''} ${event.race?.entries.map((entry) => entry.name).join(' ') || ''}`.toLowerCase().includes(query)),
    );
  }
  if (filter === 'all') return events;
  if (filter === 'live' || filter === 'upcoming' || filter === 'final') {
    return events.filter((e) => e.status === filter);
  }
  return events.filter((e) => e.sport === filter);
}

export function groupEventsByLeague(events: SportsEvent[]) {
  const map = new Map<string, { league: string; leagueName: string; events: SportsEvent[] }>();
  for (const ev of events) {
    const cur = map.get(ev.league) || { league: ev.league, leagueName: ev.leagueName, events: [] };
    cur.events.push(ev);
    map.set(ev.league, cur);
  }
  return [...map.values()];
}
