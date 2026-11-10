/**
 * ESPN public data client.
 *
 * Everything here talks to ESPN's public (keyless) endpoints and normalises the
 * responses into the exact shapes the ScoreHub pages already render
 * (`src/data/sportsData.js`). If ESPN is unreachable — offline, blocked by a
 * corporate proxy, rate limited — the callers keep the bundled demo data and
 * surface a status badge instead of breaking the page.
 *
 * Endpoints used:
 *   - scoreboard: /apis/site/v2/sports/{sport}/{league}/scoreboard
 *   - standings:  /apis/v2/sports/{sport}/{league}/standings
 *   - leaders:    /apis/common/v3/sports/{sport}/{league}/leaders (best effort)
 *
 * Requests go straight to ESPN from the browser (their public API sends
 * permissive CORS headers). Each request also has a same-origin proxy fallback
 * (`/espn`, `/espn-web`) which the Vite dev server forwards server-side, so the
 * app still works behind strict CORS setups and in the sandbox preview.
 */

import { formatKickoff, shiftDateKey, toDateKey } from "../utils/dates";
import { slugify } from "../utils/entities";

const env = (typeof import.meta !== "undefined" && import.meta.env) || {};

const trimTrailingSlash = (value) => String(value).replace(/\/+$/, "");

export const ESPN_SITE_BASE = trimTrailingSlash(
  env.VITE_ESPN_SITE_BASE_URL || "https://site.api.espn.com"
);
export const ESPN_WEB_BASE = trimTrailingSlash(
  env.VITE_ESPN_WEB_BASE_URL || "https://site.web.api.espn.com"
);
export const ESPN_SITE_PROXY = "/espn";
export const ESPN_WEB_PROXY = "/espn-web";

const SCOREBOARD_TTL = 30 * 1000;
const STANDINGS_TTL = 5 * 60 * 1000;
const LEADERS_TTL = 60 * 60 * 1000;
const DETAIL_TTL = 60 * 1000;
const NEWS_TTL = 5 * 60 * 1000;
const REQUEST_TIMEOUT = 12 * 1000;

/** ESPN league slugs we know how to place in the existing competition filters. */
export const ESPN_LEAGUES = {
  nba: {
    key: "nba",
    sport: "basketball",
    path: "basketball/nba",
    competitionId: "nba",
    competition: "NBA",
    country: "United States",
  },
  wnba: {
    key: "wnba",
    sport: "basketball",
    path: "basketball/wnba",
    competitionId: "wnba",
    competition: "WNBA",
    country: "United States",
  },
  nbl: {
    key: "nbl",
    sport: "basketball",
    path: "basketball/nbl",
    competitionId: "nbl",
    competition: "NBL",
    country: "Australia",
  },
  euroleague: {
    key: "euroleague",
    sport: "basketball",
    path: "basketball/euroleague",
    competitionId: "euroleague",
    competition: "EuroLeague",
    country: "Europe",
  },
  "mens-college-basketball": {
    key: "mens-college-basketball",
    sport: "basketball",
    path: "basketball/mens-college-basketball",
    competitionId: "ncaam",
    competition: "NCAA Men's Basketball",
    country: "United States",
  },
  "womens-college-basketball": {
    key: "womens-college-basketball",
    sport: "basketball",
    path: "basketball/womens-college-basketball",
    competitionId: "ncaaw",
    competition: "NCAA Women's Basketball",
    country: "United States",
  },
  nfl: {
    key: "nfl",
    sport: "football",
    path: "football/nfl",
    competitionId: "nfl",
    competition: "NFL",
    country: "United States",
  },
  "college-football": {
    key: "college-football",
    sport: "football",
    path: "football/college-football",
    competitionId: "cfb",
    competition: "College Football",
    country: "United States",
  },
};

/**
 * Leagues merged into the basketball scoreboard, in display order.
 *
 * The two Division I college boards are part of the default view. ESPN only
 * returns its featured subset for college basketball unless the caller asks for
 * group 50, so those boards are fetched with the wider parameters below.
 */
export const BASKETBALL_LIVE_LEAGUES = [
  "nba",
  "wnba",
  "nbl",
  "euroleague",
  "mens-college-basketball",
  "womens-college-basketball",
];

/** Leagues merged into the NFL scoreboard. */
export const FOOTBALL_LIVE_LEAGUES = ["nfl"];

/**
 * Competitions the hub can load on demand. The default "All competitions" view
 * uses the basketball/football league lists above; a competition outside those
 * lists (college football) is fetched on its own once it is selected.
 */
export const LEAGUE_BY_COMPETITION = {
  nba: "nba",
  wnba: "wnba",
  nbl: "nbl",
  euroleague: "euroleague",
  ncaam: "mens-college-basketball",
  ncaaw: "womens-college-basketball",
  nfl: "nfl",
  cfb: "college-football",
};

/** Which ESPN leagues feed a sport, optionally narrowed to one competition. */
export function liveLeaguesFor(sport, competition) {
  const base = sport === "football" ? FOOTBALL_LIVE_LEAGUES : BASKETBALL_LIVE_LEAGUES;
  const league = competition && competition !== "all" ? LEAGUE_BY_COMPETITION[competition] : null;
  if (!league || base.includes(league)) return base;
  return [league];
}

/** Competition id → ESPN league key (used by the team pages). */
export function leagueKeyForCompetition(competitionId) {
  if (!competitionId) return null;
  return LEAGUE_BY_COMPETITION[competitionId] ?? null;
}

const NFL_COMPETITION_NAMES = {
  nfl: "NFL",
  preseason: "NFL Preseason",
  playoffs: "NFL Playoffs",
};

const NFL_CONFERENCES = {
  BUF: "AFC", MIA: "AFC", NE: "AFC", NYJ: "AFC",
  BAL: "AFC", CIN: "AFC", CLE: "AFC", PIT: "AFC",
  HOU: "AFC", IND: "AFC", JAX: "AFC", TEN: "AFC",
  DEN: "AFC", KC: "AFC", LAC: "AFC", LV: "AFC",
  DAL: "NFC", NYG: "NFC", PHI: "NFC", WAS: "NFC",
  CHI: "NFC", DET: "NFC", GB: "NFC", MIN: "NFC",
  ATL: "NFC", CAR: "NFC", NO: "NFC", TB: "NFC",
  ARI: "NFC", LAR: "NFC", SF: "NFC", SEA: "NFC",
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const asArray = (value) => (Array.isArray(value) ? value : []);
const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toNumber = (value, fallback = null) => {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const pad2 = (value) => String(value).padStart(2, "0");

const unique = (values) => [...new Set(values.filter(Boolean))];

function buildQuery(params = {}) {
  if (typeof URLSearchParams === "undefined") return "";
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

function hasProxyBase(base, proxy) {
  return trimTrailingSlash(base) === proxy;
}

/** Direct ESPN URL first, same-origin dev/edge proxy second. */
function withProxyFallback(base, proxy, path) {
  const direct = `${trimTrailingSlash(base)}${path}`;
  if (hasProxyBase(base, proxy)) return [direct];
  return unique([direct, `${proxy}${path}`]);
}

// ---------------------------------------------------------------------------
// Request layer (in-memory cache + in-flight de-duplication)
// ---------------------------------------------------------------------------

const cache = new Map();
const inFlight = new Map();

export class EspnRequestError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = "EspnRequestError";
    this.status = status;
  }
}

async function fetchJson(url, timeout = REQUEST_TIMEOUT) {
  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
  try {
    const response = await fetch(url, {
      signal: controller?.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new EspnRequestError(`ESPN ${response.status} for ${url}`, response.status);
    }
    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new EspnRequestError(`ESPN request timed out for ${url}`);
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Fetch the first working URL from a list, caching the normalised JSON payload.
 * @param {string[]} urls candidate URLs, in priority order
 * @param {{ ttl?: number, force?: boolean, timeout?: number }} options
 */
export async function requestEspn(urls, { ttl = SCOREBOARD_TTL, force = false, timeout = REQUEST_TIMEOUT } = {}) {
  const candidates = unique(urls);
  if (!candidates.length) throw new EspnRequestError("No ESPN endpoint configured");

  const now = Date.now();
  if (!force) {
    for (const url of candidates) {
      const hit = cache.get(url);
      if (hit && hit.expires > now) return hit.data;
    }
  }

  const key = candidates[0];
  if (!force && inFlight.has(key)) return inFlight.get(key);

  const promise = (async () => {
    let lastError = null;
    for (const url of candidates) {
      try {
        const data = await fetchJson(url, timeout);
        cache.set(url, { data, expires: Date.now() + ttl });
        return data;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError ?? new EspnRequestError("ESPN request failed");
  })();

  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}

export function clearEspnCache() {
  cache.clear();
  inFlight.clear();
}

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

function requireLeague(leagueKey) {
  const league = ESPN_LEAGUES[leagueKey];
  if (!league) throw new EspnRequestError(`Unknown ESPN league: ${leagueKey}`);
  return league;
}

/**
 * Per-league scoreboard parameters. College basketball defaults to ESPN's
 * featured games (roughly the top 25); asking for group 50 with a higher limit
 * returns the whole Division I day, which is also a much bigger payload, so
 * those boards get a longer request timeout. Every other league keeps
 * `limit=100`.
 */
const SCOREBOARD_PARAMS = {
  "mens-college-basketball": { limit: 500, groups: 50, timeout: 25 * 1000 },
  "womens-college-basketball": { limit: 500, groups: 50, timeout: 25 * 1000 },
};

/** Parameters for one league's scoreboard request (URL + timeout). */
export function scoreboardParams(leagueKey) {
  const league = requireLeague(leagueKey);
  return SCOREBOARD_PARAMS[league.key] ?? { limit: 100 };
}

export function scoreboardUrls(leagueKey, { date, week, seasonType, limit = 100 } = {}) {
  const league = requireLeague(leagueKey);
  const board = SCOREBOARD_PARAMS[league.key];
  const path = `/apis/site/v2/sports/${league.path}/scoreboard${buildQuery({
    limit: board?.limit ?? limit,
    dates: date,
    week,
    seasontype: seasonType,
    groups: board?.groups,
  })}`;
  return withProxyFallback(ESPN_SITE_BASE, ESPN_SITE_PROXY, path);
}

export function standingsUrls(leagueKey, { season } = {}) {
  const league = requireLeague(leagueKey);
  const path = `/apis/v2/sports/${league.path}/standings${buildQuery({ season })}`;
  return withProxyFallback(ESPN_SITE_BASE, ESPN_SITE_PROXY, path);
}

export function leadersUrls(leagueKey) {
  const league = requireLeague(leagueKey);
  const path = `/apis/common/v3/sports/${league.path}/leaders`;
  return withProxyFallback(ESPN_WEB_BASE, ESPN_WEB_PROXY, path);
}

export function teamUrls(leagueKey, teamId) {
  const league = requireLeague(leagueKey);
  const base = `/apis/site/v2/sports/${league.path}/teams/${encodeURIComponent(teamId)}`;
  return {
    info: withProxyFallback(ESPN_SITE_BASE, ESPN_SITE_PROXY, base),
    schedule: withProxyFallback(ESPN_SITE_BASE, ESPN_SITE_PROXY, `${base}/schedule`),
    roster: withProxyFallback(ESPN_SITE_BASE, ESPN_SITE_PROXY, `${base}/roster`),
  };
}

export function athleteUrls(leagueKey, athleteId) {
  const league = requireLeague(leagueKey);
  const path = `/apis/common/v3/sports/${league.path}/athletes/${encodeURIComponent(athleteId)}`;
  return withProxyFallback(ESPN_WEB_BASE, ESPN_WEB_PROXY, path);
}

// ---------------------------------------------------------------------------
// Team + player detail normalisation (best effort, demo data always wins as a
// fallback so the detail pages render even when ESPN is unreachable)
// ---------------------------------------------------------------------------

export function normalizeTeamInfo(payload) {
  const team = payload?.team ?? payload;
  if (!team || typeof team !== "object") return null;
  const recordEntry = asArray(team.record?.items)[0] ?? team.record ?? null;
  const recordSummary =
    (typeof recordEntry === "string" ? recordEntry : recordEntry?.summary ?? recordEntry?.displayValue) ?? null;

  return {
    id: team.id ?? null,
    name: team.displayName ?? team.name ?? null,
    code: team.abbreviation ?? null,
    logo: teamLogo(team),
    record: recordSummary,
    standing: team.standingSummary ?? null,
    location: team.location ?? null,
    color: team.color ?? null,
    links: asArray(team.links).map((link) => link?.href).filter(Boolean),
  };
}

export function normalizeRoster(payload, { sport = "basketball" } = {}) {
  const entries = asArray(payload?.athletes ?? payload?.team?.athletes);
  const sportPath = sport === "football" ? "nfl" : "nba";

  return entries
    .map((athlete) => {
      const name = athlete?.displayName ?? athlete?.fullName ?? athlete?.name;
      if (!name) return null;
      const id = athlete.id ?? null;
      return {
        id,
        key: slugify(name),
        name,
        jersey: athlete.jersey ?? null,
        position: athlete.position?.abbreviation ?? athlete.position?.name ?? "—",
        headshot:
          athlete.headshot?.href ??
          (id ? `https://a.espncdn.com/i/headshots/${sportPath}/players/full/${id}.png` : null),
        height: athlete.displayHeight ?? null,
        age: athlete.age ?? null,
        experience: athlete.experience?.years ?? null,
      };
    })
    .filter(Boolean);
}

export function normalizeAthlete(payload, { sport = "basketball" } = {}) {
  const athlete = payload?.athlete ?? payload;
  if (!athlete || typeof athlete !== "object") return null;
  const sportPath = sport === "football" ? "nfl" : "nba";
  const id = athlete.id ?? null;

  const categories = asArray(
    payload?.statistics?.splits?.categories ?? payload?.statistics?.categories ?? payload?.categories
  );
  const statGroups = categories
    .map((category) => {
      const name = category?.name ?? category?.displayName ?? "Season stats";
      const stats = asArray(category?.stats)
        .map((stat) => ({
          label: stat?.displayName ?? stat?.name ?? stat?.abbreviation,
          value: stat?.displayValue ?? stat?.value,
        }))
        .filter((stat) => stat.label && stat.value !== undefined && stat.value !== null && stat.value !== "");
      return { name, stats: stats.slice(0, 8) };
    })
    .filter((group) => group.stats.length)
    .slice(0, 2);

  return {
    id,
    name: athlete.displayName ?? athlete.fullName ?? null,
    headshot:
      athlete.headshot?.href ??
      (id ? `https://a.espncdn.com/i/headshots/${sportPath}/players/full/${id}.png` : null),
    position: athlete.position?.abbreviation ?? athlete.position?.name ?? null,
    jersey: athlete.jersey ?? null,
    age: athlete.age ?? null,
    height: athlete.displayHeight ?? null,
    weight: athlete.displayWeight ?? null,
    college: athlete.college?.name ?? null,
    team: athlete.team
      ? {
          name: athlete.team.displayName ?? null,
          code: athlete.team.abbreviation ?? null,
          logo: teamLogo(athlete.team),
        }
      : null,
    statGroups,
  };
}

export async function loadTeamDetail(leagueKey, teamId, { force = false } = {}) {
  const league = requireLeague(leagueKey);
  const urls = teamUrls(leagueKey, teamId);
  const [infoResult, scheduleResult, rosterResult] = await Promise.allSettled([
    requestEspn(urls.info, { ttl: DETAIL_TTL, force }),
    requestEspn(urls.schedule, { ttl: DETAIL_TTL, force }),
    requestEspn(urls.roster, { ttl: DETAIL_TTL, force }),
  ]);

  if ([infoResult, scheduleResult, rosterResult].every((result) => result.status === "rejected")) {
    throw new EspnRequestError("ESPN team feed is unreachable");
  }

  return {
    info: infoResult.status === "fulfilled" ? normalizeTeamInfo(infoResult.value) : null,
    games:
      scheduleResult.status === "fulfilled"
        ? normalizeScoreboard(scheduleResult.value, { league })
        : [],
    roster:
      rosterResult.status === "fulfilled"
        ? normalizeRoster(rosterResult.value, { sport: league.sport })
        : [],
  };
}

export async function loadAthleteDetail(leagueKey, athleteId, { force = false } = {}) {
  const league = requireLeague(leagueKey);
  const data = await requestEspn(athleteUrls(leagueKey, athleteId), { ttl: DETAIL_TTL, force });
  return normalizeAthlete(data, { sport: league.sport });
}

// ---------------------------------------------------------------------------
// Scoreboard normalisation
// ---------------------------------------------------------------------------

const ordinal = (value) => {
  const suffixes = ["th", "st", "nd", "rd"];
  const remainder = value % 100;
  return `${value}${suffixes[(remainder - 20) % 10] || suffixes[remainder] || suffixes[0]}`;
};

function periodLabel(sport, period) {
  if (!Number.isFinite(period) || period <= 0) return "";
  if (sport === "football") return period > 4 ? "OT" : ordinal(period);
  return period > 4 ? "OT" : `Q${period}`;
}

// Kickoff labels are rendered in the viewer's device time zone (see utils/dates).
export { formatKickoff };

const COUNTRY_LABELS = {
  USA: "United States",
  "United States": "United States",
  GBR: "United Kingdom",
  ENG: "United Kingdom",
  "United Kingdom": "United Kingdom",
};

function venueCountry(venue, fallback) {
  const raw = venue?.address?.country;
  if (!raw) return fallback;
  return COUNTRY_LABELS[raw] || raw;
}

function competitionFor(event, league, sport) {
  if (sport !== "football") {
    return { id: league.competitionId, name: league.competition };
  }
  const seasonType = toNumber(event?.season?.type, null);
  if (seasonType === 1) return { id: "preseason", name: NFL_COMPETITION_NAMES.preseason };
  if (seasonType === 3) return { id: "playoffs", name: NFL_COMPETITION_NAMES.playoffs };
  return {
    id: league.competitionId,
    name: NFL_COMPETITION_NAMES[league.competitionId] || league.competition,
  };
}

const teamLogo = (team) =>
  team?.logo ?? asArray(team?.logos)[0]?.href ?? null;

function broadcastName(competition) {
  const names = asArray(competition?.broadcasts).flatMap((entry) => asArray(entry?.names));
  if (names.length) return names[0];
  const media = competition?.media;
  return asArray(media?.shortName)[0] ?? media?.shortName ?? null;
}

function normalizeEvent(event, league, sport, index) {
  const competition = asArray(event?.competitions)[0] ?? {};
  const competitors = asArray(competition.competitors);
  if (competitors.length < 2) return null;

  const home =
    competitors.find((entry) => entry.homeAway === "home") ?? competitors[0];
  const away =
    competitors.find((entry) => entry.homeAway === "away") ?? competitors[1];

  const status = competition.status ?? event.status ?? {};
  const type = status.type ?? {};
  const state = type.state ?? "pre";
  const gameStatus =
    state === "in" ? "LIVE" : state === "post" ? "FINAL" : "UPCOMING";

  const period = toNumber(status.period, 0);
  const displayClock = status.displayClock && status.displayClock !== "0:00" ? status.displayClock : "";

  let clock;
  if (gameStatus === "LIVE") {
    const phase = String(type.description ?? "");
    if (displayClock) {
      clock = [periodLabel(sport, period), displayClock].filter(Boolean).join(" · ");
    } else if (/halftime|half-time|half time|intermission/i.test(phase)) {
      clock = phase; // "Halftime" reads better than a bare "Q2"
    } else {
      clock = periodLabel(sport, period) || phase || "Live";
    }
  } else if (gameStatus === "FINAL") {
    clock = period > 4 ? `Final / ${period > 5 ? `${period - 4}OT` : "OT"}` : "Final";
  } else {
    clock = formatKickoff(event.date);
  }

  const scoreOf = (competitor) => {
    if (gameStatus === "UPCOMING") return null;
    const value = toNumber(competitor?.score, null);
    return value === null ? null : Math.round(value);
  };

  const homeTeam = home.team ?? {};
  const awayTeam = away.team ?? {};
  const competitionInfo = competitionFor(event, league, sport);
  const venue = competition.venue ?? {};

  return {
    id: event.id ?? `${league.key}-${index}`,
    competitionId: competitionInfo.id,
    competition: competitionInfo.name,
    country: venueCountry(venue, league.country),
    conference: NFL_CONFERENCES[homeTeam.abbreviation] ?? undefined,
    status: gameStatus,
    clock,
    home: homeTeam.displayName ?? homeTeam.name ?? "TBD",
    away: awayTeam.displayName ?? awayTeam.name ?? "TBD",
    homeCode: homeTeam.abbreviation ?? "—",
    awayCode: awayTeam.abbreviation ?? "—",
    homeLogo: teamLogo(homeTeam),
    awayLogo: teamLogo(awayTeam),
    homeScore: scoreOf(home),
    awayScore: scoreOf(away),
    broadcast: broadcastName(competition),
    venue: venue.fullName ?? "Venue TBD",
    startTime: event.date ?? null,
    league: league.key,
  };
}

/**
 * ESPN scoreboard payload → array of games in the shape `GameCard` expects.
 */
export function normalizeScoreboard(payload, { league = "nba" } = {}) {
  const config = typeof league === "string" ? requireLeague(league) : league;
  const sport = config.sport ?? "basketball";
  return asArray(payload?.events)
    .map((event, index) => normalizeEvent(event, config, sport, index))
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Standings normalisation
// ---------------------------------------------------------------------------

function formatPct(value) {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numeric)) return "—";
  const fixed = numeric.toFixed(3);
  return fixed.startsWith("0.") ? fixed.slice(1) : fixed;
}

function formatGamesBehind(value) {
  if (value === null || value === undefined) return "—";
  const raw = String(value).trim();
  if (!raw || raw === "-" || raw === "0" || raw === "0.0" || raw === "—") return "—";
  return raw;
}

const STAT_ALIASES = {
  p: ["gamesPlayed"],
  w: ["wins"],
  l: ["losses"],
  t: ["ties"],
  pct: ["winPercent", "winPct", "percentage"],
  gb: ["gamesBehind"],
  streak: ["streak"],
  pf: ["pointsFor"],
  pa: ["pointsAgainst"],
};

function statValue(stats, names) {
  for (const name of names) {
    const stat = stats.get(name);
    if (!stat) continue;
    const numeric = toNumber(stat.value, null);
    if (numeric !== null) return numeric;
    const parsed = toNumber(stat.displayValue, null);
    if (parsed !== null) return parsed;
  }
  return null;
}

function statDisplay(stats, names) {
  for (const name of names) {
    const stat = stats.get(name);
    if (!stat) continue;
    if (stat.displayValue !== undefined && stat.displayValue !== "") {
      return String(stat.displayValue);
    }
    if (stat.value !== undefined && stat.value !== null) return String(stat.value);
  }
  return null;
}

function normalizeStandingRow(entry) {
  const team = entry?.team ?? entry;
  const stats = new Map(
    asArray(entry?.stats).map((stat) => [stat.name ?? stat.abbreviation, stat])
  );

  const wins = statValue(stats, STAT_ALIASES.w);
  const losses = statValue(stats, STAT_ALIASES.l);
  const ties = statValue(stats, STAT_ALIASES.t);
  const gamesPlayed =
    statValue(stats, STAT_ALIASES.p) ??
    (wins !== null && losses !== null ? wins + losses + (ties ?? 0) : null);

  const pctValue =
    toNumber(statValue(stats, STAT_ALIASES.pct), null) ??
    (wins !== null && gamesPlayed ? wins / gamesPlayed : null);

  return {
    team: team.displayName ?? team.name ?? "TBD",
    espnId: team.id ?? null,
    code: team.abbreviation ?? "—",
    logo: teamLogo(team),
    p: gamesPlayed ?? "—",
    w: wins ?? "—",
    l: losses ?? "—",
    t: ties ?? 0,
    pct: formatPct(pctValue ?? statDisplay(stats, STAT_ALIASES.pct)),
    gb: formatGamesBehind(statDisplay(stats, STAT_ALIASES.gb)),
    streak: statDisplay(stats, STAT_ALIASES.streak) ?? "—",
    pf: statValue(stats, STAT_ALIASES.pf) ?? "—",
    pa: statValue(stats, STAT_ALIASES.pa) ?? "—",
    _pct: pctValue ?? -1,
  };
}

/**
 * ESPN standings payload → the `{ group, rows }` groups the table renders.
 * Handles both flat roots and conference → division nesting.
 */
export function normalizeStandings(payload, { prefix = "" } = {}) {
  const groups = [];

  const visit = (node) => {
    if (!isPlainObject(node)) return;
    const entries = asArray(
      node.standings?.entries ?? node.standings?.entry ?? node.entries
    );
    if (entries.length) {
      const label = [prefix, node.name].filter(Boolean).join(" · ");
      groups.push({
        group: label || node.abbreviation || "Standings",
        rows: entries
          .map(normalizeStandingRow)
          .filter((row) => row.team !== "TBD")
          .sort((a, b) => b._pct - a._pct)
          .map((row) => {
            const clean = { ...row };
            delete clean._pct;
            return clean;
          }),
      });
    }
    asArray(node.children).forEach(visit);
  };

  visit(payload);

  // De-duplicate groups that sometimes appear twice at different depths.
  const seen = new Set();
  return groups.filter((group) => {
    if (seen.has(group.group)) return false;
    seen.add(group.group);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Leaders normalisation (best effort — endpoint shape is not documented)
// ---------------------------------------------------------------------------

function initials(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function findLeaderLists(node, out = [], depth = 0) {
  if (depth > 5 || !node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((item) => findLeaderLists(item, out, depth + 1));
    return out;
  }
  if (Array.isArray(node.leaders) && node.leaders.length) {
    out.push({ label: node.displayName ?? node.name ?? node.shortName, entries: node.leaders });
  }
  Object.values(node).forEach((value) => {
    if (value && typeof value === "object") findLeaderLists(value, out, depth + 1);
  });
  return out;
}

export function normalizeLeaders(payload, { sport = "basketball" } = {}) {
  const lists = findLeaderLists(payload);
  const sportPath = sport === "football" ? "nfl" : "nba";
  const leaders = [];
  const seenMetrics = new Set();

  lists.forEach(({ label, entries }) => {
    const metric = String(label || "Season leaders").replace(/\s*leaders?$/i, "").trim();
    if (!metric || seenMetrics.has(metric)) return;
    const top = asArray(entries)
      .map((entry) => {
        const athlete = entry.athlete ?? entry.player ?? {};
        const name = athlete.displayName ?? athlete.fullName ?? athlete.name ?? entry.displayName;
        const value = entry.displayValue ?? entry.value;
        if (!name || value === undefined || value === null) return null;
        const team = athlete.team ?? entry.team ?? {};
        const headshot =
          athlete.headshot?.href ??
          (athlete.id ? `https://a.espncdn.com/i/headshots/${sportPath}/players/full/${athlete.id}.png` : null);
        return {
          espnId: athlete.id ?? null,
          name,
          team: team.displayName ?? "—",
          teamAbbr: team.abbreviation ?? null,
          teamLogo: teamLogo(team),
          position: athlete.position?.abbreviation ?? athlete.position?.name ?? null,
          headshot,
          metric,
          value: String(value),
          initials: initials(name),
        };
      })
      .filter(Boolean)[0];
    if (!top) return;
    seenMetrics.add(metric);
    leaders.push(top);
  });

  return leaders.slice(0, 4);
}

export function normalizeNews(payload) {
  return asArray(payload?.articles)
    .map((article) => {
      const headline = article?.headline ?? article?.title;
      if (!headline) return null;
      const image = asArray(article?.images)[0]?.url ?? article?.image ?? null;
      const category = asArray(article?.categories)[0];
      return {
        id: article.id ?? headline,
        headline,
        description: article.description ?? article.summary ?? "",
        published: article.published ?? null,
        image,
        tag: category?.description ?? category?.name ?? "ESPN",
        byline: article?.byline ?? null,
      };
    })
    .filter(Boolean)
    .slice(0, 12);
}

export function normalizeLeaderboard(payload, { limit = 5, sport = "basketball" } = {}) {
  const lists = findLeaderLists(payload);
  const headshotPath = sport === "football" ? "nfl" : "nba";
  const seen = new Set();
  const boards = [];

  lists.forEach(({ label, entries }) => {
    const metric = String(label || "Season leaders").replace(/\s*leaders?$/i, "").trim();
    if (!metric || seen.has(metric)) return;
    const rows = asArray(entries)
      .map((entry) => {
        const athlete = entry?.athlete ?? entry?.player ?? {};
        const name = athlete.displayName ?? athlete.fullName ?? athlete.name ?? entry?.displayName;
        const value = entry?.displayValue ?? entry?.value;
        if (!name || value === undefined || value === null) return null;
        const team = athlete.team ?? entry?.team ?? {};
        const headshot =
          athlete.headshot?.href ??
          (athlete.id ? `https://a.espncdn.com/i/headshots/${headshotPath}/players/full/${athlete.id}.png` : null);
        return {
          name,
          value: String(value),
          headshot,
          team: team.displayName ?? "—",
          teamAbbr: team.abbreviation ?? null,
          teamLogo: teamLogo(team),
          key: slugify(name),
          initials: initials(name),
        };
      })
      .filter(Boolean)
      .slice(0, limit);
    if (!rows.length) return;
    seen.add(metric);
    boards.push({ metric, short: metric.split(/\s+/)[0].slice(0, 5).toUpperCase(), entries: rows });
  });

  return boards.slice(0, 6);
}

// Normalize only what ESPN actually supplies. In particular, NFL summaries use
// drives.previous/current, while basketball summaries generally have plays[].
const summaryValue = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

export function normalizeSummary(payload) {
  const competition = payload?.header?.competitions?.[0] ?? {};
  const competitors = asArray(competition.competitors);
  const teamOf = (entry) => ({
    id: summaryValue(entry?.team?.id ?? entry?.id),
    name: entry?.team?.displayName ?? entry?.team?.name ?? null,
    code: entry?.team?.abbreviation ?? null,
    logo: teamLogo(entry?.team),
    score: summaryValue(entry?.score?.displayValue ?? entry?.score),
    homeAway: entry?.homeAway ?? null,
    linescores: asArray(entry?.linescores).map((row) => summaryValue(row?.displayValue ?? row?.value ?? row)),
  });
  const teams = competitors.map(teamOf).filter((team) => team.name);
  const teamsById = new Map(teams.filter((team) => team.id).map((team) => [team.id, team]));
  const codeFor = (team) => summaryValue(team?.abbreviation) ?? teamsById.get(summaryValue(team?.id))?.code ?? null;

  const rawDrives = Array.isArray(payload?.drives) ? payload.drives : [
    ...asArray(payload?.drives?.previous), ...(payload?.drives?.current ? [payload.drives.current] : []),
  ];
  const seenDrives = new Set();
  const drives = rawDrives.filter((drive) => {
    if (!drive || typeof drive !== "object") return false;
    const id = summaryValue(drive.id);
    if (id && seenDrives.has(id)) return false;
    if (id) seenDrives.add(id);
    return true;
  });
  const driveEntries = drives.flatMap((drive) => asArray(drive.plays).map((play) => ({ play, drive })));
  const rawPlays = asArray(payload?.plays).map((play) => ({ play: play?.play ?? play }));
  const commentary = asArray(payload?.commentary).map((play) => ({ play: play?.play ?? play }));
  const scoring = asArray(payload?.scoringPlays).map((play) => ({ play: play?.play ?? play }));
  // Scoring plays are a subset of the full feed, not additional commentary.
  // Empty placeholder rows must not prevent a valid fallback feed from showing.
  const hasText = (entries) => entries.some(({ play }) => summaryValue(play?.text ?? play?.description));
  const wrapped = hasText(driveEntries) ? driveEntries : hasText(rawPlays) ? rawPlays : hasText(commentary) ? commentary : scoring;
  const seenPlays = new Set();
  const plays = wrapped.flatMap(({ play, drive }) => {
    const text = summaryValue(play?.text ?? play?.description);
    if (!text) return [];
    const id = summaryValue(play?.id);
    if (id && seenPlays.has(id)) return [];
    if (id) seenPlays.add(id);
    const clock = summaryValue(play?.clock?.displayValue ?? play?.clock) ?? "";
    const periodNumber = summaryValue(play?.period?.number);
    const period = summaryValue(play?.period?.displayValue ?? play?.period?.shortDisplayValue)
      ?? (periodNumber ? `Period ${periodNumber}` : null);
    const away = summaryValue(play?.awayScore), home = summaryValue(play?.homeScore);
    const score = home !== null && away !== null ? `${home}-${away}` : null;
    return [{ id, clock, period, team: codeFor(play?.team) ?? codeFor(play?.start?.team) ?? codeFor(drive?.team), text, score,
      type: summaryValue(play?.type?.text), downDistance: summaryValue(play?.start?.downDistanceText ?? play?.start?.shortDownDistanceText),
      scoring: play?.scoringPlay === true }];
  });

  const driveSummaries = drives.flatMap((drive) => {
    const team = codeFor(drive.team);
    const description = summaryValue(drive.description);
    const result = summaryValue(drive.displayResult ?? drive.shortDisplayResult ?? drive.result);
    if (!team && !description && !result) return [];
    return [{ id: summaryValue(drive.id), team, description, result,
      start: summaryValue(drive.start?.shortDownDistanceText ?? drive.start?.possessionText),
      scoring: drive.isScore === true }];
  });

  const statTeams = asArray(payload?.boxscore?.teams);
  const statRows = new Map();
  for (const row of statTeams) {
    const id = summaryValue(row?.team?.id);
    const side = teamsById.get(id)?.homeAway ?? row?.homeAway;
    if (side !== "home" && side !== "away") continue;
    for (const stat of asArray(row.statistics)) {
      const key = summaryValue(stat?.name ?? stat?.label);
      const value = summaryValue(stat?.displayValue ?? stat?.value);
      if (!key || value === null) continue;
      const current = statRows.get(key) ?? { label: summaryValue(stat.label ?? stat.displayName) ?? key, home: null, away: null };
      current[side] = value;
      statRows.set(key, current);
    }
  }
  const playerTables = asArray(payload?.boxscore?.players).flatMap((team) => asArray(team?.statistics).flatMap((group) => {
    const labels = asArray(group?.labels).map((value) => summaryValue(value) ?? "—");
    if (!labels.length) return [];
    const athletes = asArray(group?.athletes).flatMap((row) => {
      const name = summaryValue(row?.athlete?.displayName ?? row?.athlete?.fullName ?? row?.athlete?.name);
      if (!name) return [];
      return [{ id: summaryValue(row?.athlete?.id), name, didNotPlay: row.didNotPlay === true,
        reason: summaryValue(row.reason), stats: labels.map((_, index) => summaryValue(asArray(row.stats)[index]) ?? "—") }];
    });
    if (!athletes.length) return [];
    return [{ team: summaryValue(team?.team?.displayName) ?? codeFor(team?.team) ?? "Team",
      label: summaryValue(group?.displayName ?? group?.name) ?? "Players", labels, athletes }];
  }));
  const statusType = competition?.status?.type ?? {};
  const info = payload?.gameInfo ?? {};
  const broadcast = asArray(competition?.broadcasts).flatMap((item) => asArray(item?.names)).map(summaryValue).filter(Boolean);
  return {
    plays, playsKind: wrapped === scoring ? "scoring" : "full", drives: driveSummaries,
    teamStats: [...statRows.values()], playerTables,
    gameInfo: { attendance: summaryValue(info.attendance), officials: asArray(info.officials).map((row) => summaryValue(row?.fullName ?? row?.displayName)).filter(Boolean), broadcast },
    period: statusType.shortDetail ?? statusType.detail ?? null,
    statusText: statusType.shortDetail ?? statusType.detail ?? null,
    state: statusType.state ?? null,
    venue: competition?.venue?.fullName ?? info?.venue?.fullName ?? null,
    teams,
  };
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

export async function loadScoreboard(leagueKey, { date, week, seasonType, force = false } = {}) {
  const data = await requestEspn(scoreboardUrls(leagueKey, { date, week, seasonType }), {
    ttl: SCOREBOARD_TTL,
    force,
    timeout: scoreboardParams(leagueKey).timeout,
  });
  const league = requireLeague(leagueKey);
  return {
    games: normalizeScoreboard(data, { league }),
    meta: {
      week: toNumber(data?.week?.number, null),
      seasonType: toNumber(data?.season?.type, null),
      seasonYear: toNumber(data?.season?.year, null),
    },
  };
}

export async function loadStandings(leagueKey, { season, force = false } = {}) {
  const data = await requestEspn(standingsUrls(leagueKey, { season }), {
    ttl: STANDINGS_TTL,
    force,
  });
  const league = requireLeague(leagueKey);
  return normalizeStandings(data, {
    sport: league.sport,
    prefix: league.sport === "basketball" ? league.competition : "",
  });
}

export async function loadLeaders(leagueKey, { force = false } = {}) {
  const data = await requestEspn(leadersUrls(leagueKey), {
    ttl: LEADERS_TTL,
    force,
  });
  return normalizeLeaders(data, { sport: requireLeague(leagueKey).sport });
}

/** Full leaderboards (top N per metric) for the Top scorers screen. */
export async function loadLeaderboard(leagueKey, { limit = 5, force = false } = {}) {
  const data = await requestEspn(leadersUrls(leagueKey), { ttl: LEADERS_TTL, force });
  return normalizeLeaderboard(data, { sport: requireLeague(leagueKey).sport, limit });
}

export function newsUrls(leagueKey) {
  const league = requireLeague(leagueKey);
  return withProxyFallback(ESPN_SITE_BASE, ESPN_SITE_PROXY, `/apis/site/v2/sports/${league.path}/news`);
}

export function summaryUrls(leagueKey, eventId) {
  const league = requireLeague(leagueKey);
  const path = `/apis/site/v2/sports/${league.path}/summary${buildQuery({ event: eventId })}`;
  return withProxyFallback(ESPN_SITE_BASE, ESPN_SITE_PROXY, path);
}

export async function loadNews(leagueKey, { force = false } = {}) {
  const data = await requestEspn(newsUrls(leagueKey), { ttl: NEWS_TTL, force });
  return normalizeNews(data);
}

export async function loadMatchSummary(leagueKey, eventId, { force = false } = {}) {
  const data = await requestEspn(summaryUrls(leagueKey, eventId), { ttl: DETAIL_TTL, force });
  return normalizeSummary(data);
}

async function mergeScoreboards(leagueKeys, options) {
  const results = await Promise.allSettled(
    leagueKeys.map((key) => loadScoreboard(key, options))
  );

  const games = [];
  const seen = new Set();
  const meta = {};
  let successes = 0;

  results.forEach((result) => {
    if (result.status !== "fulfilled") return;
    successes += 1;
    // Leagues occasionally repeat an event (a shared preseason or cup fixture),
    // and the same game must never be listed twice.
    result.value.games.forEach((game) => {
      const id = String(game.id);
      if (seen.has(id)) return;
      seen.add(id);
      games.push(game);
    });
    Object.assign(meta, result.value.meta);
  });

  if (!successes) {
    throw new EspnRequestError("ESPN scoreboards are unreachable");
  }

  return { games, meta };
}

/**
 * ESPN buckets a game under the US calendar day it started, but a viewer east of
 * the Atlantic watches it the next morning: a 19:30 ET tip-off is 05:00 in
 * Nairobi, and it is still live. Asking only for the viewer's "today" would hide
 * exactly the games in progress, so the today view also asks for yesterday and
 * keeps the ones that never finished.
 */
async function liveCarryOver(leagues, { date, force, seen = new Set() } = {}) {
  if (!date || date !== toDateKey()) return [];
  try {
    const previous = await mergeScoreboards(leagues, {
      date: shiftDateKey(date, -1),
      force,
    });
    return previous.games
      .filter((game) => game.status === "LIVE" && !seen.has(String(game.id)))
      .slice(0, 12);
  } catch {
    return []; // the current day's board still renders on its own
  }
}

export async function fetchBasketballSnapshot({ date, force = false, season, competition } = {}) {
  const leagues = liveLeaguesFor("basketball", competition);
  const { games, meta } = await mergeScoreboards(leagues, { date, force });

  const carryOver = await liveCarryOver(leagues, {
    date,
    force,
    seen: new Set(games.map((game) => String(game.id))),
  });
  const allGames = [...carryOver, ...games];

  let standings = null;
  // NCAA conference tables come from the bundled demo data; ESPN's college
  // standings endpoints use a different shape, so they are left out for now.
  const standingsLeague = competition === "nba" || !competition ? "nba" : null;
  if (standingsLeague) {
    try {
      // ESPN indexes basketball seasons by their end year (2025 → 2024-25).
      standings = await loadStandings(standingsLeague, { force, season });
    } catch {
      standings = null; // scores still render with the demo standings table
    }
  }

  return { games: allGames, standings, meta };
}

export async function fetchFootballSnapshot({ week, seasonType, force = false, competition } = {}) {
  const { games, meta } = await mergeScoreboards(liveLeaguesFor("football", competition), {
    week,
    seasonType,
    force,
  });

  let standings = null;
  const standingsLeague = competition === "cfb" ? null : "nfl";
  if (standingsLeague) {
    try {
      standings = await loadStandings(standingsLeague, { force });
    } catch {
      standings = null;
    }
  }

  return { games, standings, meta };
}

export const SNAPSHOT_FETCHERS = {
  basketball: fetchBasketballSnapshot,
  football: fetchFootballSnapshot,
};

/** ESPN integration is skipped in unit tests and when explicitly disabled. */
export function isEspnDisabled() {
  if (env.MODE === "test") return true;
  return String(env.VITE_ESPN_DISABLE ?? "") === "1";
}

/** Exported for tests / debugging: human readable status counts. */
export function summarizeGames(games = []) {
  return games.reduce(
    (acc, game) => {
      acc.total += 1;
      if (game.status === "LIVE") acc.live += 1;
      else if (game.status === "UPCOMING") acc.upcoming += 1;
      else if (game.status === "FINAL") acc.final += 1;
      return acc;
    },
    { total: 0, live: 0, upcoming: 0, final: 0 }
  );
}

export { pad2 };
