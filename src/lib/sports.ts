/**
 * Sports board — fetch live / upcoming / finished events from several
 * public endpoints, then normalize them into one card shape.
 *
 * Sources (no API key required):
 *   1. ESPN scoreboard JSON  — live clock, scores, team logos
 *   2. TheSportsDB           — extra football fixtures + venues
 *
 * When every source is unreachable (restricted networks, this sandbox),
 * a small demo board is returned so the page still works.
 */

export type SportKind =
  | 'football'
  | 'basketball'
  | 'american-football'
  | 'motorsport'
  | 'tennis'
  | 'other';

export type EventStatus = 'live' | 'upcoming' | 'final';

export type SportsTeam = {
  name: string;
  short?: string;
  logo?: string | null;
  score?: number | null;
};

export type SportsEvent = {
  id: string;
  source: 'espn' | 'thesportsdb' | 'demo';
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
  source: 'rapidapi' | 'demo';
  federation: string;
  market: string;
  startAt: string;
  homeTeam: string;
  awayTeam: string;
  prediction: string;
  winOdds?: string | null;
  competition?: string | null;
};

export type SportsSourceReport = {
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

type EspnLeague = {
  sport: string;
  league: string;
  kind: SportKind;
  slug: string;
  name: string;
};

const ESPN_LEAGUES: EspnLeague[] = [
  { sport: 'soccer', league: 'eng.1', kind: 'football', slug: 'epl', name: 'Premier League' },
  { sport: 'soccer', league: 'esp.1', kind: 'football', slug: 'laliga', name: 'La Liga' },
  { sport: 'soccer', league: 'ita.1', kind: 'football', slug: 'seriea', name: 'Serie A' },
  { sport: 'soccer', league: 'ger.1', kind: 'football', slug: 'bundesliga', name: 'Bundesliga' },
  { sport: 'soccer', league: 'fra.1', kind: 'football', slug: 'ligue1', name: 'Ligue 1' },
  { sport: 'soccer', league: 'uefa.champions', kind: 'football', slug: 'ucl', name: 'Champions League' },
  { sport: 'soccer', league: 'caf.champions', kind: 'football', slug: 'caf', name: 'CAF Champions League' },
  { sport: 'basketball', league: 'nba', kind: 'basketball', slug: 'nba', name: 'NBA' },
  { sport: 'football', league: 'nfl', kind: 'american-football', slug: 'nfl', name: 'NFL' },
  { sport: 'racing', league: 'f1', kind: 'motorsport', slug: 'f1', name: 'Formula 1' },
];

const SPORTSDB_LEAGUES: { id: string; slug: string; name: string; kind: SportKind }[] = [
  { id: '4328', slug: 'epl', name: 'Premier League', kind: 'football' },
  { id: '4335', slug: 'laliga', name: 'La Liga', kind: 'football' },
  { id: '4480', slug: 'ucl', name: 'Champions League', kind: 'football' },
  { id: '4387', slug: 'nba', name: 'NBA', kind: 'basketball' },
];

const PREDICTION_ENDPOINT = 'https://football-prediction-api.p.rapidapi.com/api/v2/predictions';
const PREDICTION_HOST = 'football-prediction-api.p.rapidapi.com';
const API_TZ = 'Europe/London';

const FETCH_MS = 7_000;
const CACHE_MS = 45_000;

let cache: { at: number; board: SportsBoard } | null = null;

function espnUrl(sport: string, league: string) {
  return `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard`;
}

function sportsDbNextUrl(leagueId: string) {
  return `https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=${leagueId}`;
}

function sportsDbPastUrl(leagueId: string) {
  return `https://www.thesportsdb.com/api/v1/json/3/eventspastleague.php?id=${leagueId}`;
}

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'HyperSports/1.0 (+https://hyper.social)',
      },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function espnState(state?: string): EventStatus {
  if (state === 'in') return 'live';
  if (state === 'post') return 'final';
  return 'upcoming';
}

function parseScore(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseEspnEvents(payload: any, meta: EspnLeague): SportsEvent[] {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  const out: SportsEvent[] = [];
  for (const ev of events) {
    const comp = ev?.competitions?.[0];
    if (!comp) continue;
    const competitors = Array.isArray(comp.competitors) ? comp.competitors : [];
    const homeRaw = competitors.find((c: any) => c.homeAway === 'home') || competitors[0];
    const awayRaw = competitors.find((c: any) => c.homeAway === 'away') || competitors[1];
    if (!homeRaw || !awayRaw) continue;
    const status = espnState(comp.status?.type?.state);
    const detail =
      comp.status?.type?.shortDetail ||
      comp.status?.displayClock ||
      comp.status?.type?.detail ||
      null;
    out.push({
      id: `espn-${meta.slug}-${ev.id}`,
      source: 'espn',
      sport: meta.kind,
      league: meta.slug,
      leagueName: payload?.leagues?.[0]?.name || meta.name,
      status,
      startAt: ev.date || new Date().toISOString(),
      venue: comp.venue?.fullName || null,
      detail,
      home: {
        name: homeRaw.team?.displayName || homeRaw.team?.name || 'Home',
        short: homeRaw.team?.abbreviation,
        logo: homeRaw.team?.logo || null,
        score: parseScore(homeRaw.score),
      },
      away: {
        name: awayRaw.team?.displayName || awayRaw.team?.name || 'Away',
        short: awayRaw.team?.abbreviation,
        logo: awayRaw.team?.logo || null,
        score: parseScore(awayRaw.score),
      },
      url: ev.links?.[0]?.href || null,
    });
  }
  return out;
}

function sportsDbStatus(row: any): EventStatus {
  const raw = String(row?.strStatus || '').toLowerCase();
  if (raw.includes('live') || raw === '1h' || raw === '2h' || raw === 'ht') return 'live';
  if (raw === 'ft' || raw === 'aet' || raw === 'pen' || raw === 'match finished') return 'final';
  if (row?.intHomeScore != null && row?.intAwayScore != null && raw) return 'final';
  return 'upcoming';
}

function parseSportsDbEvents(
  payload: any,
  meta: (typeof SPORTSDB_LEAGUES)[number],
  fallbackStatus?: EventStatus,
): SportsEvent[] {
  const rows = Array.isArray(payload?.events) ? payload.events : [];
  return rows.slice(0, 8).map((row: any) => {
    const date = row.dateEvent || '';
    const time = (row.strTime || '00:00:00').slice(0, 8);
    const startAt = date ? new Date(`${date}T${time}Z`).toISOString() : new Date().toISOString();
    const status = fallbackStatus || sportsDbStatus(row);
    return {
      id: `tsdb-${meta.slug}-${row.idEvent}`,
      source: 'thesportsdb' as const,
      sport: meta.kind,
      league: meta.slug,
      leagueName: row.strLeague || meta.name,
      status,
      startAt,
      venue: row.strVenue || null,
      detail: row.strStatus || (status === 'upcoming' ? row.strTime : null),
      home: {
        name: row.strHomeTeam || 'Home',
        logo: row.strHomeTeamBadge || null,
        score: parseScore(row.intHomeScore),
      },
      away: {
        name: row.strAwayTeam || 'Away',
        logo: row.strAwayTeamBadge || null,
        score: parseScore(row.intAwayScore),
      },
      url: row.strVideo || null,
    };
  });
}


function dateInTimeZone(offsetDays: number, timeZone: string) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function parsePredictionStart(value: unknown) {
  const raw = String(value || '');
  if (!raw) return new Date().toISOString();
  // The RapidAPI example treats start_date as Europe/London local time. Store
  // it as an ISO-ish value for display; browsers render it in the user's local
  // timezone when cards call toLocaleTimeString().
  return raw.endsWith('Z') || raw.includes('+') ? new Date(raw).toISOString() : new Date(`${raw}Z`).toISOString();
}

async function fetchRapidApiPredictions(): Promise<SportsPrediction[]> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return [];

  const isoDate = dateInTimeZone(1, API_TZ);
  const url = new URL(PREDICTION_ENDPOINT);
  url.searchParams.set('federation', 'UEFA');
  url.searchParams.set('market', 'classic');
  url.searchParams.set('iso_date', isoDate);

  const payload = await fetchJsonWithHeaders(url.toString(), {
    'X-RapidAPI-Key': key,
    'X-RapidAPI-Host': PREDICTION_HOST,
  });
  const rows = Array.isArray((payload as any)?.data) ? (payload as any).data : [];

  return rows
    .map((match: any, index: number) => {
      const prediction = String(match?.prediction || '').trim();
      const odds = match?.odds && typeof match.odds === 'object' ? match.odds : null;
      const oddValue = odds && prediction ? Number(odds[prediction]) : 0;
      return {
        id: `rapidapi-${match?.id || match?.home_team || 'match'}-${index}`,
        source: 'rapidapi' as const,
        federation: String(match?.federation || 'UEFA'),
        market: 'classic',
        startAt: parsePredictionStart(match?.start_date),
        homeTeam: String(match?.home_team || 'Home'),
        awayTeam: String(match?.away_team || 'Away'),
        prediction: prediction || 'n/a',
        winOdds: oddValue > 1 ? String(oddValue) : null,
        competition: match?.competition_name || match?.competition || match?.league || null,
      };
    })
    .sort((a: SportsPrediction, b: SportsPrediction) => a.startAt.localeCompare(b.startAt))
    .slice(0, 12);
}

async function fetchJsonWithHeaders(url: string, headers: Record<string, string>): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'HyperSports/1.0 (+https://hyper.social)',
        ...headers,
      },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function eventKey(ev: SportsEvent) {
  const day = ev.startAt.slice(0, 10);
  return `${ev.league}:${ev.home.name.toLowerCase()}:${ev.away.name.toLowerCase()}:${day}`;
}

function mergeEvents(groups: SportsEvent[][]) {
  const seen = new Map<string, SportsEvent>();
  const rank = { espn: 0, thesportsdb: 1, demo: 2 } as const;
  for (const group of groups) {
    for (const ev of group) {
      const key = eventKey(ev);
      const prev = seen.get(key);
      if (!prev || rank[ev.source] < rank[prev.source]) seen.set(key, ev);
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
  const predictions: SportsPrediction[] = [
    {
      id: 'demo-prediction-epl',
      source: 'demo',
      federation: 'UEFA',
      market: 'classic',
      startAt: iso(3 * 60 * 60_000),
      homeTeam: 'Real Madrid',
      awayTeam: 'Bayern Munich',
      prediction: '1X',
      winOdds: '1.64',
      competition: 'Champions League',
    },
  ];
  return {
    events,
    predictions,
    sources: [{ id: 'demo', ok: true, count: events.length + predictions.length }],
    fetchedAt: new Date().toISOString(),
    mode: 'demo',
  };
}

export async function getSportsBoard(opts?: { bypassCache?: boolean }): Promise<SportsBoard> {
  if (!opts?.bypassCache && cache && Date.now() - cache.at < CACHE_MS) {
    return cache.board;
  }

  const sources: SportsSourceReport[] = [];
  const groups: SportsEvent[][] = [];
  let predictions: SportsPrediction[] = [];

  const espnJobs = ESPN_LEAGUES.map(async (meta) => {
    const events = parseEspnEvents(await fetchJson(espnUrl(meta.sport, meta.league)), meta);
    sources.push({ id: `espn:${meta.slug}`, ok: true, count: events.length });
    groups.push(events);
  });

  const dbJobs = SPORTSDB_LEAGUES.flatMap((meta) => [
    (async () => {
      const events = parseSportsDbEvents(await fetchJson(sportsDbNextUrl(meta.id)), meta, 'upcoming');
      sources.push({ id: `thesportsdb:next:${meta.slug}`, ok: true, count: events.length });
      groups.push(events);
    })(),
    (async () => {
      const events = parseSportsDbEvents(await fetchJson(sportsDbPastUrl(meta.id)), meta, 'final');
      sources.push({ id: `thesportsdb:past:${meta.slug}`, ok: true, count: events.length });
      groups.push(events);
    })(),
  ]);

  const predictionJobs = [
    (async () => {
      predictions = await fetchRapidApiPredictions();
      if (process.env.RAPIDAPI_KEY) {
        sources.push({ id: 'rapidapi:predictions', ok: true, count: predictions.length });
      }
    })(),
  ];

  const settled = await Promise.allSettled([...espnJobs, ...dbJobs, ...predictionJobs]);
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') return;
    const ids = [
      ...ESPN_LEAGUES.map((l) => `espn:${l.slug}`),
      ...SPORTSDB_LEAGUES.flatMap((l) => [`thesportsdb:next:${l.slug}`, `thesportsdb:past:${l.slug}`]),
      'rapidapi:predictions',
    ];
    const message = result.reason instanceof Error ? result.reason.message : 'fetch failed';
    sources.push({ id: ids[i] || `source-${i}`, ok: false, count: 0, error: message });
  });

  const events = mergeEvents(groups);
  const anyOk = sources.some((s) => s.ok && s.count > 0) || predictions.length > 0;
  const allOk = sources.length > 0 && sources.every((s) => s.ok);

  const board: SportsBoard = anyOk
    ? {
        events,
        predictions,
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
  { id: 'basketball', label: 'NBA' },
  { id: 'american-football', label: 'NFL' },
  { id: 'motorsport', label: 'F1' },
];

export function filterSportsEvents(
  events: SportsEvent[],
  filter: 'all' | EventStatus | SportKind,
) {
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
