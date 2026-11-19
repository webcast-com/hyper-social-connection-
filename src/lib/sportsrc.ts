/**
 * SportSRC, as the live-stream screen reads it.
 *
 * SportSRC (https://sportsrc.org/docs/) lists the fixtures that have a stream and
 * hands back, per fixture, finished player addresses to put in an iframe. This
 * file turns its three free responses — `matches`, `detail` and `sports` — into
 * the shapes the screen draws, and holds the rules that decide what the screen
 * may claim about a fixture.
 *
 * Nothing here reads a network, a database or the environment, so everything in
 * it is safe to import from the browser. The requests themselves, and the key
 * they carry, live in `sportsrc-feed.ts` and never leave the server.
 *
 * What is decided here rather than in a component:
 *
 *   - a status is one of SportSRC's seven exact strings, mapped to the four the
 *     tabs know. Anything else is `other`, never guessed to be live;
 *   - a clock is what SportSRC reported. The free `matches` response carries the
 *     period ("2nd half") and not always the minute, so a missing minute is shown
 *     as the period ("2H"), never worked out from the kickoff time;
 *   - a score SportSRC did not report is absent, never a zero;
 *   - a player address is used only when it is an `https` address. It goes into
 *     an iframe on this site, so nothing else is let through.
 */

/** SportSRC's status vocabulary, exactly as documented. */
export const SPORTSRC_STATUSES = [
  'notstarted', 'inprogress', 'suspended', 'interrupted', 'finished', 'postponed', 'canceled',
] as const;

export type StreamStatus = 'live' | 'upcoming' | 'finished' | 'other';

export type StreamTeam = {
  name: string;
  /** Three-letter code when SportSRC supplies one, otherwise made from the name. */
  code: string;
  badge: string | null;
  color: string | null;
};

export type StreamMatch = {
  /** SportSRC's opaque, signed match id. The only thing `detail` accepts. */
  id: string;
  title: string;
  /** Kickoff as an ISO string, or null when SportSRC gave no usable time. */
  startAt: string | null;
  status: StreamStatus;
  /** SportSRC's own status string, kept for the cases `status` folds together. */
  rawStatus: string;
  /** The readable period: "1st half", "Halftime", "Ended". May be empty. */
  statusDetail: string;
  /** The minute ("67'"), "HT" or "FT" when SportSRC reports it. May be empty. */
  timer: string;
  round: string | null;
  league: string;
  /** Stable key for filtering: country and name, lower-cased. */
  leagueKey: string;
  country: string | null;
  leagueLogo: string | null;
  home: StreamTeam;
  away: StreamTeam;
  score: { home: number | null; away: number | null };
  hasStream: boolean;
};

export type StreamLeague = {
  key: string;
  name: string;
  country: string | null;
  logo: string | null;
  matches: number;
};

export type StreamSport = { id: string; name: string; total: number | null };

export type StreamSource = {
  id: string;
  /** What the switcher button says: the source's name, upper-cased. */
  label: string;
  embedUrl: string;
  hd: boolean;
  language: string | null;
};

export type StreamDetail = {
  id: string;
  title: string;
  sources: StreamSource[];
  venue: { stadium: string | null; city: string | null; country: string | null; capacity: number | null; surface: string | null } | null;
  referee: string | null;
  managers: { home: string | null; away: string | null };
  season: string | null;
  round: string | null;
};

/**
 * Why a board or a match has nothing to show.
 *
 *   ok           SportSRC answered
 *   missing-key  no SPORTSRC_API_KEY on this server
 *   unauthorized SportSRC refused the key
 *   rate-limited the day's allowance is used up
 *   unavailable  no answer, or one this code could not read
 */
export type StreamState = 'ok' | 'missing-key' | 'unauthorized' | 'rate-limited' | 'unavailable';

export type StreamBoard = {
  state: StreamState;
  sport: string;
  /** The day asked for, `YYYY-MM-DD`, or '' for SportSRC's own current list. */
  date: string;
  leagues: StreamLeague[];
  matches: StreamMatch[];
  sports: StreamSport[];
  fetchedAt: string;
  /** True when this is an earlier answer served because a fresh one failed. */
  stale?: boolean;
};

export type StreamDetailResult = { state: StreamState; detail: StreamDetail | null };

export const DEFAULT_STREAM_SPORT = 'football';

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const textOrNull = (value: unknown): string | null => text(value) || null;
const count = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
};

/** An `https` address and nothing else: these are drawn as images or framed. */
export function httpsUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** A match id as SportSRC writes them: a slug and a signed tail, URL-safe. */
export function streamMatchId(value: unknown): string | null {
  const id = text(value);
  return /^[A-Za-z0-9][A-Za-z0-9._~=+%-]{2,399}$/.test(id) ? id : null;
}

/** A sport id as SportSRC writes them: `football`, `american-football`. */
export function streamSportId(value: unknown): string | null {
  const id = text(value).toLowerCase();
  return /^[a-z][a-z0-9-]{1,39}$/.test(id) ? id : null;
}

/** `YYYY-MM-DD` for a real calendar day, or null. */
export function streamDate(value: unknown): string | null {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === raw ? raw : null;
}

export function streamStatus(raw: unknown): StreamStatus {
  switch (text(raw).toLowerCase()) {
    case 'inprogress':
    case 'live':
      return 'live';
    case 'notstarted':
    case 'not_started':
    case 'scheduled':
    case 'upcoming':
      return 'upcoming';
    case 'finished':
    case 'ended':
      return 'finished';
    default:
      return 'other';
  }
}

function teamCode(name: string, code: unknown): string {
  const given = text(code);
  if (given) return given.slice(0, 4).toUpperCase();
  const letters = name.replace(/[^\p{L}\p{N} ]/gu, '').trim();
  const words = letters.split(/\s+/).filter(Boolean);
  if (words.length >= 3) return words.slice(0, 3).map((word) => word[0]).join('').toUpperCase();
  return letters.replace(/\s+/g, '').slice(0, 3).toUpperCase();
}

function parseTeam(value: unknown, fallback: string): StreamTeam {
  const team = isRecord(value) ? value : {};
  const name = text(team.name) || fallback;
  const color = text(team.color);
  return {
    name,
    code: teamCode(name, team.code ?? team.short_name),
    badge: httpsUrl(team.badge),
    color: /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : null,
  };
}

const leagueKeyFor = (name: string, country: string | null) => `${country ?? ''}:${name}`.toLowerCase();

/**
 * One fixture. `matches` nests the sides under `teams` and the score under
 * `score`; `scores` (the paid list) puts both on `home` / `away`. Both are read,
 * so a plan change does not need a code change.
 */
function parseMatch(value: unknown, league: { name: string; country: string | null; logo: string | null }): StreamMatch | null {
  if (!isRecord(value)) return null;
  const id = streamMatchId(value.id);
  if (!id) return null;
  const teams = isRecord(value.teams) ? value.teams : value;
  const [left, right] = text(value.title).split(/\s+vs\.?\s+/i);
  const home = parseTeam(teams.home, left?.trim() || 'Home');
  const away = parseTeam(teams.away, right?.trim() || 'Away');
  const score = isRecord(value.score) ? value.score : {};
  const flat = (side: unknown) => (isRecord(side) ? count(side.score) : null);
  const stamp = typeof value.timestamp === 'number' && value.timestamp > 0 ? new Date(value.timestamp * 1000) : null;
  const status = streamStatus(value.status);
  // A fixture that has not kicked off has no score, whatever placeholder was sent.
  const reported = status !== 'upcoming';
  return {
    id,
    title: text(value.title) || `${home.name} vs ${away.name}`,
    startAt: stamp && !Number.isNaN(stamp.getTime()) ? stamp.toISOString() : null,
    status,
    rawStatus: text(value.status).toLowerCase(),
    statusDetail: text(value.status_detail) || text(value.status_display),
    timer: text(value.timer),
    round: textOrNull(value.round),
    league: league.name,
    leagueKey: leagueKeyFor(league.name, league.country),
    country: league.country,
    leagueLogo: league.logo,
    home,
    away,
    score: {
      home: reported ? count(score.home) ?? flat(teams.home) : null,
      away: reported ? count(score.away) ?? flat(teams.away) : null,
    },
    // `matches` lists only fixtures with a stream, so an absent flag means yes.
    hasStream: value.has_stream !== false,
  };
}

/** The `matches` (or `scores`) response as leagues and one flat list of fixtures. */
export function parseStreamMatches(payload: unknown): { leagues: StreamLeague[]; matches: StreamMatch[] } {
  const groups = isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
  const leagues = new Map<string, StreamLeague>();
  const matches: StreamMatch[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    if (!isRecord(group)) continue;
    const meta = isRecord(group.league) ? group.league : {};
    const name = text(meta.name) || 'Other competitions';
    const country = textOrNull(meta.country);
    const logo = httpsUrl(meta.logo) ?? httpsUrl(meta.flag);
    const key = leagueKeyFor(name, country);
    for (const item of Array.isArray(group.matches) ? group.matches : []) {
      const match = parseMatch(item, { name, country, logo });
      if (!match || seen.has(match.id)) continue;
      seen.add(match.id);
      matches.push(match);
      const league = leagues.get(key) ?? { key, name, country, logo, matches: 0 };
      league.matches += 1;
      leagues.set(key, league);
    }
  }
  return { leagues: [...leagues.values()], matches };
}

/** The `sports` response. Football is always offered: it is what SportSRC serves. */
export function parseStreamSports(payload: unknown): StreamSport[] {
  const rows = isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
  const sports: StreamSport[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const id = streamSportId(row.id);
    if (!id || sports.some((sport) => sport.id === id)) continue;
    sports.push({ id, name: text(row.name) || id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()), total: count(row.total) });
  }
  if (!sports.some((sport) => sport.id === DEFAULT_STREAM_SPORT)) {
    sports.unshift({ id: DEFAULT_STREAM_SPORT, name: 'Football', total: null });
  }
  return sports;
}

/** The `detail` response: the sources to frame, and the facts for the info row. */
export function parseStreamDetail(payload: unknown): StreamDetail | null {
  const data = isRecord(payload) && isRecord(payload.data) ? payload.data : null;
  if (!data) return null;
  const id = streamMatchId(data.id);
  if (!id) return null;
  const sources: StreamSource[] = [];
  for (const item of Array.isArray(data.sources) ? data.sources : []) {
    if (!isRecord(item)) continue;
    const embedUrl = httpsUrl(item.embedUrl);
    if (!embedUrl || sources.some((source) => source.embedUrl === embedUrl)) continue;
    const name = text(item.source);
    const number = count(item.streamNo);
    sources.push({
      id: text(item.id) || `stream-${sources.length + 1}`,
      label: (name || `Stream ${number ?? sources.length + 1}`).toUpperCase().slice(0, 16),
      embedUrl,
      hd: item.hd === true,
      language: text(item.language) && text(item.language).toLowerCase() !== 'unknown' ? text(item.language) : null,
    });
  }
  const venue = isRecord(data.venue) ? data.venue : null;
  const league = isRecord(data.league) ? data.league : {};
  const managers = isRecord(data.managers) ? data.managers : {};
  const named = (value: unknown) => (isRecord(value) ? textOrNull(value.name) : null);
  return {
    id,
    title: text(data.title),
    sources,
    venue: venue && (text(venue.stadium) || text(venue.city))
      ? {
          stadium: textOrNull(venue.stadium),
          city: textOrNull(venue.city),
          country: textOrNull(venue.country),
          capacity: count(venue.capacity),
          surface: textOrNull(venue.surface),
        }
      : null,
    referee: named(data.referee),
    managers: { home: named(managers.home), away: named(managers.away) },
    season: textOrNull(league.season),
    round: textOrNull(league.round),
  };
}

/** An empty board for a state that has nothing to list. */
export function emptyStreamBoard(state: StreamState, sport = DEFAULT_STREAM_SPORT, date = ''): StreamBoard {
  return {
    state,
    sport,
    date,
    leagues: [],
    matches: [],
    sports: [{ id: DEFAULT_STREAM_SPORT, name: 'Football', total: null }],
    fetchedAt: new Date().toISOString(),
  };
}

const PERIODS: [RegExp, string][] = [
  [/half\s*-?\s*time|^ht$/i, 'HT'],
  [/1st|first/i, '1H'],
  [/2nd|second/i, '2H'],
  [/extra|^et$|overtime/i, 'ET'],
  [/penalt/i, 'PEN'],
  [/break|^bt$/i, 'BT'],
];

const OTHER_LABELS: Record<string, string> = {
  suspended: 'Susp.',
  interrupted: 'Int.',
  postponed: 'Postp.',
  canceled: 'Canc.',
  cancelled: 'Canc.',
};

/**
 * The short clock beside a fixture.
 *
 * In play: SportSRC's own timer ("67'"), or the period it named, or "Live".
 * Over: "FT". Not started: null — the kickoff is a time of day, and only the
 * browser knows the reader's zone, so the caller formats it.
 */
export function streamClock(match: Pick<StreamMatch, 'status' | 'rawStatus' | 'statusDetail' | 'timer'>): string | null {
  if (match.status === 'upcoming') return null;
  if (match.status === 'finished') return 'FT';
  if (match.status === 'other') return OTHER_LABELS[match.rawStatus] ?? (match.statusDetail || '—');
  if (match.timer) return match.timer;
  for (const [pattern, label] of PERIODS) if (pattern.test(match.statusDetail)) return label;
  return 'Live';
}

/** "2 - 1", or "vs" when there is no score to report. */
export function streamScore(match: Pick<StreamMatch, 'score'>): string {
  const { home, away } = match.score;
  return home === null || away === null ? 'vs' : `${home} - ${away}`;
}

/** Minutes before kickoff at which a stream is worth asking for (SportSRC's guide). */
export const WATCH_WINDOW_MINUTES = 30;

/**
 * Whether pressing play can lead anywhere. Sources appear close to kickoff and
 * can linger after full time, so this follows SportSRC's own rule: a stream
 * exists, and the match is in play or starts within half an hour.
 */
export function isWatchable(match: Pick<StreamMatch, 'hasStream' | 'status' | 'startAt'>, now: Date = new Date()): boolean {
  if (!match.hasStream) return false;
  if (match.status === 'live') return true;
  if (match.status !== 'upcoming' || !match.startAt) return false;
  const minutes = (Date.parse(match.startAt) - now.getTime()) / 60_000;
  return minutes <= WATCH_WINDOW_MINUTES;
}

export type StreamTab = 'all' | 'live' | 'upcoming' | 'finished' | 'bookmarks';

export const STREAM_TABS: { id: StreamTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'finished', label: 'Finished' },
  { id: 'bookmarks', label: 'Bookmarks' },
];

export type StreamFilter = {
  tab: StreamTab;
  league?: string | null;
  club?: string | null;
  query?: string;
  bookmarks?: ReadonlySet<string>;
};

const STATUS_ORDER: Record<StreamStatus, number> = { live: 0, upcoming: 1, other: 2, finished: 3 };

/** Live first, then by kickoff; finished fixtures latest first. Stable otherwise. */
export function orderStreamMatches(matches: readonly StreamMatch[]): StreamMatch[] {
  const time = (match: StreamMatch) => (match.startAt ? Date.parse(match.startAt) : Number.MAX_SAFE_INTEGER);
  return matches
    .map((match, index) => ({ match, index }))
    .sort((a, b) =>
      STATUS_ORDER[a.match.status] - STATUS_ORDER[b.match.status]
      || (a.match.status === 'finished' ? time(b.match) - time(a.match) : time(a.match) - time(b.match))
      || a.index - b.index)
    .map((row) => row.match);
}

/** The rows a tab shows, narrowed by league, club and the search box. */
export function filterStreamMatches(matches: readonly StreamMatch[], filter: StreamFilter): StreamMatch[] {
  const query = filter.query?.trim().toLowerCase() ?? '';
  const club = filter.club?.trim().toLowerCase() ?? '';
  return matches.filter((match) => {
    if (filter.tab === 'bookmarks') {
      if (!filter.bookmarks?.has(match.id)) return false;
    } else if (filter.tab !== 'all' && match.status !== filter.tab) {
      return false;
    }
    if (filter.league && match.leagueKey !== filter.league) return false;
    if (club && match.home.name.toLowerCase() !== club && match.away.name.toLowerCase() !== club) return false;
    if (query && !`${match.home.name} ${match.away.name} ${match.league} ${match.country ?? ''}`.toLowerCase().includes(query)) return false;
    return true;
  });
}

/**
 * The match the player opens on: the first one in play, otherwise the first that
 * can be watched now, otherwise the next to start, otherwise the first listed.
 */
export function featuredStreamMatch(matches: readonly StreamMatch[], now: Date = new Date()): StreamMatch | null {
  const ordered = orderStreamMatches(matches);
  return ordered.find((match) => match.status === 'live' && match.hasStream)
    ?? ordered.find((match) => isWatchable(match, now))
    ?? ordered.find((match) => match.status === 'upcoming')
    ?? ordered[0]
    ?? null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const icsStamp = (date: Date) =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
const icsText = (value: string) => value.replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');

/**
 * A calendar entry for a fixture, or null when it has no kickoff time. Two hours
 * long, which covers a football match and its break; the link leads back here.
 */
export function streamMatchIcs(match: StreamMatch, pageUrl: string, now: Date = new Date()): string | null {
  if (!match.startAt) return null;
  const start = new Date(match.startAt);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 2 * 60 * 60_000);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hyper//Live streams//EN',
    'BEGIN:VEVENT',
    `UID:${match.id.slice(0, 80)}@hyper`,
    `DTSTAMP:${icsStamp(now)}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsText(`${match.home.name} vs ${match.away.name}`)}`,
    `DESCRIPTION:${icsText(`${match.league}${match.round ? ` · ${match.round}` : ''}\nWatch: ${pageUrl}`)}`,
    `URL:${pageUrl}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/** `YYYY-MM-DD` as the given zone sees `date` (the reader's own zone by default). */
export function localDayKey(date: Date = new Date(), timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '01';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

/** The date pill: "Today, Oct 4" for today, "Sat, Oct 5" otherwise. */
export function streamDateLabel(day: string, today: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return 'Today';
  const monthDay = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(date);
  if (day === today) return `Today, ${monthDay}`;
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(date);
  return `${weekday}, ${monthDay}`;
}
