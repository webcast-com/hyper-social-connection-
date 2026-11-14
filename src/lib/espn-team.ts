/**
 * ESPN team detail, normalised: identity, record, fixtures and squad.
 *
 * A **separate** stack, in the same sense as the league video news reader: its
 * own parser, its own server feed, its own endpoints and its own pages. It
 * shares only the repository's generic helpers — `ESPN_LEAGUES` for provider
 * paths, `ESPN_REQUEST_HEADERS`/`EspnEndpointError` for transport, and
 * `safeProviderImage` for the one image rule — and nothing here reads or writes
 * the match highlights board, the match details feed or the standings board.
 *
 * Four rules it does not bend:
 *
 *   1. **Only provider-reported images.** A crest is used when ESPN reports one;
 *      one is never inferred from an abbreviation or an id. Player portraits may
 *      fall back to ESPN's headshot CDN, but only for the NBA and the NFL, where
 *      this repository has established the folder actually holds that player —
 *      ESPN athlete ids are global, so the same id under another league's folder
 *      is a different person's face.
 *   2. **Validated ids only.** A team or player id reaches a URL or a CDN path
 *      only after it matches `/^[1-9]\d{0,19}$/`, the rule the match history
 *      feed already uses.
 *   3. **Nothing invented.** A missing field stays `null` and the page says ESPN
 *      did not report it. No `"—"` placeholders are baked into data, no age is
 *      computed from a birth date, and no winner is inferred from a scoreline
 *      that ESPN did not mark.
 *   4. **No sample teams.** When ESPN does not answer, the board is
 *      `unavailable` and the page says so. There is no bundled demo squad here.
 */
import { safeProviderImage } from './espn-image';
import { ESPN_LEAGUES, type EspnLeague } from './sports-catalog';
import type { EspnEndpointDetails } from './espn-endpoints';

/** Raised for a bad URL segment, so a route can answer 404/400 instead of 500. */
export class TeamInputError extends Error {
  constructor(message: string, readonly httpStatus: number) {
    super(message);
    this.name = 'TeamInputError';
  }
}

export type TeamReference = { league: string; teamId: string };

/** ESPN's own entity ids: digits, no leading zero, bounded. */
const ENTITY_ID = /^[1-9]\d{0,19}$/;

export const validEntityId = (value: unknown): value is string =>
  typeof value === 'string' && ENTITY_ID.test(value);

/**
 * The same rule, reading an id ESPN may have sent as a number.
 *
 * `validEntityId` narrows a value that is already a string; a payload field can
 * arrive as `1234` instead, and a scoreboard's team id does. Both spellings
 * share `ENTITY_ID` so no reader can accept an id another refuses — an id this
 * site stores is later used to address `/sports/teams/{competition}/{teamId}`,
 * and a disagreement between two parsers would send a reader to the wrong team.
 * Returns null rather than coercing: an id we did not confirm must stay absent.
 */
export const entityIdFrom = (value: unknown): string | null => {
  const raw = typeof value === 'number' && Number.isFinite(value) ? String(value)
    : typeof value === 'string' ? value.trim() : null;
  return raw !== null && ENTITY_ID.test(raw) ? raw : null;
};

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown, max = 300): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max)
    : typeof value === 'number' && Number.isFinite(value) ? String(value)
    : null;
const digits = (value: unknown): string | null => {
  const raw = text(value);
  return raw !== null && /^\d{1,5}$/.test(raw) ? raw : null;
};
const booleanOf = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);

export function teamHref(reference: TeamReference): string {
  return `/sports/teams/${encodeURIComponent(reference.league)}/${encodeURIComponent(reference.teamId)}`;
}

/**
 * The team reference a stored row names, or nothing when it does not name one.
 *
 * A stored clip carries the league slug and each side's ESPN team id, which is
 * exactly what a team URL is built from — but only if both halves are real. The
 * competition has to be one the team route actually serves and the id has to pass
 * the same gate the route's own resolver uses, because a submitted URL that 404s
 * costs the crawl budget it was meant to earn, and a 404 a crawler meets is
 * remembered longer than a page it never found. Mirrors `storedMatchReference`.
 */
export function storedTeamReference(
  league: string | null | undefined,
  teamId: string | null | undefined,
): TeamReference | undefined {
  const slug = typeof league === 'string' ? league.trim() : '';
  const id = entityIdFrom(teamId ?? null);
  if (!slug || !id) return undefined;
  if (!ESPN_LEAGUES.some((entry) => entry.slug === slug)) return undefined;
  return { league: slug, teamId: id };
}

const PATH_SEGMENT = /^[a-z][a-z0-9-]*\/[a-z0-9][a-z0-9._-]*$/;

/**
 * The three ESPN endpoints behind a team page, built from the catalog's own path
 * segments. `resolveTeam` is the only place a team id becomes part of a URL.
 */
export function resolveTeam(league: string, teamId: string): {
  meta: EspnLeague;
  reference: TeamReference;
  urls: { info: string; schedule: string; roster: string };
} {
  const meta = ESPN_LEAGUES.find((entry) => entry.slug === league);
  if (!meta) throw new TeamInputError('Unknown team competition', 404);
  if (!validEntityId(teamId)) throw new TeamInputError('A numeric ESPN team id is required', 400);
  const path = `${meta.sport}/${meta.league}`;
  if (!PATH_SEGMENT.test(path)) throw new TeamInputError('Invalid ESPN team path', 400);
  const base = `https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${teamId}`;
  return {
    meta,
    reference: { league: meta.slug, teamId },
    urls: { info: base, schedule: `${base}/schedule`, roster: `${base}/roster` },
  };
}

/**
 * ESPN's headshot CDN folder, for the two leagues where this repository has
 * established that `{id}.png` under that folder is that player. Everywhere else
 * a portrait is whatever ESPN reported, or initials.
 */
const HEADSHOT_CDN: Readonly<Record<string, 'nba' | 'nfl'>> = Object.freeze({
  'basketball/nba': 'nba',
  'football/nfl': 'nfl',
});

/**
 * Whether portraits for this competition may come from that CDN folder. Exported
 * so a page can say what it is showing instead of re-deriving the rule, and so
 * the answer is the same one the parser used.
 */
export const cdnPortraits = (meta: Pick<EspnLeague, 'sport' | 'league'>): boolean =>
  Object.hasOwn(HEADSHOT_CDN, `${meta.sport}/${meta.league}`);

/** The reported photo, else the CDN portrait for NBA/NFL only, else null. */
export function athletePortrait(meta: Pick<EspnLeague, 'sport' | 'league'>, reported: unknown, id: string | null): string | null {
  const photo = safeProviderImage(typeof reported === 'string' ? reported : text(object(reported).href));
  if (photo) return photo;
  const folder = HEADSHOT_CDN[`${meta.sport}/${meta.league}`];
  return folder && id && validEntityId(id) ? `https://a.espncdn.com/i/headshots/${folder}/players/full/${id}.png` : null;
}

/** A crest is only ever provider-reported; it is never synthesised from a code. */
export const teamCrest = (team: Record<string, unknown>): string | null => {
  const logos = list(team.logos).map((entry) => text(object(entry).href)).find((href): href is string => !!href);
  return safeProviderImage(logos ?? team.logo);
};

/** ESPN reports colours as bare hex; anything else is dropped, not guessed. */
const colour = (value: unknown): string | null => {
  const raw = text(value, 8);
  return raw !== null && /^[0-9a-f]{3,8}$/i.test(raw) ? `#${raw.toLowerCase()}` : null;
};

export type TeamLink = { label: string; url: string };

/**
 * A provider-reported hyperlink: https, bounded, no embedded credentials. A link
 * is not an image, so it gets its own guard rather than borrowing the image one.
 */
export function safeExternalUrl(value: unknown): string | null {
  // Rejected rather than truncated when over-long: a cut URL is a different URL.
  const raw = typeof value === 'string' ? value.trim() : null;
  if (!raw || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/** External links ESPN attached to the entity: https only, labelled, capped. */
export function entityLinks(holder: Record<string, unknown>, limit = 6): TeamLink[] {
  const links: TeamLink[] = [];
  for (const entry of list(holder.links)) {
    if (links.length >= limit) break;
    const link = object(entry);
    const url = safeExternalUrl(link.href);
    const label = text(link.text, 80);
    if (url && label && !links.some((existing) => existing.url === url)) links.push({ label, url });
  }
  return links;
}

export type TeamIdentity = {
  id: string;
  name: string;
  shortName: string | null;
  location: string | null;
  abbreviation: string | null;
  slug: string | null;
  logo: string | null;
  colours: { primary: string | null; secondary: string | null };
  /** The overall record ESPN reports, e.g. "12-3-2". Null when unreported. */
  record: string | null;
  standing: string | null;
  venue: string | null;
  active: boolean | null;
  links: TeamLink[];
};

/** One `teams/{id}` response → the team's identity. */
export function parseTeamInfo(payload: unknown, reference: TeamReference): TeamIdentity {
  const team = object(object(payload).team ?? payload);
  const id = text(team.id);
  // Confirm the payload is about the team that was asked for: an id mismatch is
  // a provider error, not something to render under this team's name.
  if (!id || id !== reference.teamId || !validEntityId(id)) throw new Error('Team identity not confirmed');
  const name = text(team.displayName) ?? text(team.name);
  if (!name) throw new Error('Team name not reported');

  const recordItems = list(object(team.record).items);
  const recordEntry = object(recordItems[0] ?? team.record);
  const overall = recordItems.length
    ? object(recordItems.find((entry) => text(object(entry).type) === 'total') ?? recordItems[0])
    : recordEntry;

  return {
    id,
    name,
    shortName: text(team.shortDisplayName),
    location: text(team.location),
    abbreviation: text(team.abbreviation, 12),
    slug: text(team.slug, 60),
    logo: teamCrest(team),
    colours: { primary: colour(team.color ?? team.teamColor), secondary: colour(team.alternateColor) },
    record: text(overall.summary) ?? text(overall.displayValue),
    standing: text(team.standingSummary) ?? text(overall.standingSummary),
    venue: text(object(team.venue).fullName),
    active: booleanOf(team.isActive),
    links: entityLinks(team),
  };
}

export type TeamSide = {
  id: string | null;
  name: string;
  abbreviation: string | null;
  logo: string | null;
  score: string | null;
  winner: boolean | null;
};

export type TeamFixture = {
  id: string;
  date: string;
  /** ESPN's reported state — never inferred from the clock or the scoreline. */
  state: 'pre' | 'in' | 'post' | null;
  statusText: string | null;
  competition: string | null;
  season: number | null;
  venue: string | null;
  home: TeamSide | null;
  away: TeamSide | null;
  /** Which side this team was, when ESPN reported it. */
  side: 'home' | 'away' | null;
  opponent: TeamSide | null;
};

const side = (raw: unknown): TeamSide | null => {
  const row = object(raw);
  const team = object(row.team);
  const name = text(team.displayName) ?? text(team.name);
  if (!name) return null;
  const id = text(team.id);
  const scoreValue = text(object(row.score).displayValue) ?? text(object(row.score).value) ?? text(row.score);
  return {
    id: id && validEntityId(id) ? id : null,
    name,
    abbreviation: text(team.abbreviation, 12),
    logo: teamCrest(team),
    // A score is reported text; "-" and friends are not scores.
    score: scoreValue !== null && !['-', '--', '—'].includes(scoreValue) ? scoreValue : null,
    winner: booleanOf(row.winner),
  };
};

/**
 * One `teams/{id}/schedule` response → fixtures and results.
 *
 * Upcoming and finished are separated by the state ESPN reports (`pre`/`in`/
 * `post`), not by comparing a date with the clock, so a postponed or abandoned
 * fixture is not silently relabelled as a result.
 */
export function parseTeamFixtures(payload: unknown, reference: TeamReference, limit = 60): TeamFixture[] {
  const root = object(payload);
  const confirmed = text(object(root.team).id);
  if (confirmed !== null && confirmed !== reference.teamId) throw new Error('Schedule team not confirmed');
  if (!Array.isArray(root.events)) throw new Error('Schedule events not reported');

  const fixtures: TeamFixture[] = [];
  const seen = new Set<string>();
  for (const entry of list(root.events)) {
    if (fixtures.length >= limit) break;
    const event = object(entry);
    const competition = object(list(event.competitions)[0]);
    const id = text(event.id);
    const rawDate = text(competition.date) ?? text(event.date);
    const stamp = rawDate ? Date.parse(rawDate) : Number.NaN;
    if (!id || !validEntityId(id) || seen.has(id) || !Number.isFinite(stamp)) continue;

    const statusType = object(object(competition.status ?? event.status).type);
    const rawState = text(statusType.state)?.toLowerCase();
    const state: TeamFixture['state'] = rawState === 'pre' || rawState === 'in' || rawState === 'post' ? rawState : null;
    const competitors = list(competition.competitors);
    const sides = competitors.map((row) => ({ reported: side(row), homeAway: text(object(row).homeAway)?.toLowerCase() ?? null }));
    const home = sides.find((entry) => entry.homeAway === 'home')?.reported ?? sides[0]?.reported ?? null;
    const away = sides.find((entry) => entry.homeAway === 'away')?.reported ?? sides[1]?.reported ?? null;
    if (!home && !away) continue;

    const mine = sides.find((entry) => entry.reported?.id === reference.teamId)?.reported ?? null;
    // The opponent is only named when this team's own side was confirmed by id:
    // guessing it could label the team as its own opponent.
    const opponent = mine && home && away ? (home.id === mine.id ? away : away.id === mine.id ? home : null) : null;
    const seasonYear = Number(object(event.season).year);

    seen.add(id);
    fixtures.push({
      id,
      date: new Date(stamp).toISOString(),
      state,
      statusText: text(statusType.detail) ?? text(statusType.shortDetail) ?? text(statusType.description),
      competition: text(object(competition.league).name) ?? text(object(event.league).name) ?? text(object(root.league).name),
      season: Number.isInteger(seasonYear) && seasonYear >= 1900 && seasonYear <= 2100 ? seasonYear : null,
      venue: text(object(competition.venue).fullName),
      home,
      away,
      side: mine ? (home?.id === mine.id ? 'home' : away?.id === mine.id ? 'away' : null) : null,
      opponent: opponent && opponent.id !== reference.teamId ? opponent : null,
    });
  }
  return fixtures;
}

export type TeamRosterEntry = {
  id: string | null;
  name: string;
  position: string | null;
  jersey: string | null;
  headshot: string | null;
  height: string | null;
  weight: string | null;
  age: number | null;
  /** ESPN's own wording, e.g. "3 Yrs" — never a computed number. */
  experience: string | null;
  nationality: string | null;
  /** Reported birth date, when ESPN gives one and no age. */
  born: string | null;
};

const bornDate = (value: unknown): string | null => {
  const raw = text(value, 40);
  if (!raw) return null;
  const stamp = Date.parse(raw);
  if (!Number.isFinite(stamp)) return null;
  const date = new Date(stamp);
  // A future or implausible birth date is not reported, not corrected.
  return date.getTime() > Date.now() || date.getUTCFullYear() < 1850 ? null : date.toISOString().slice(0, 10);
};

/**
 * One `teams/{id}/roster` response → the squad.
 *
 * ESPN nests players differently by sport (`roster[]`, `athletes[].athlete`,
 * `team.athletes[]`), so all of them are read. A player with no reported name is
 * dropped rather than shown as a blank row, and the list is bounded.
 */
export function parseTeamRoster(payload: unknown, meta: EspnLeague, limit = 60): TeamRosterEntry[] {
  const root = object(payload);
  const confirmed = text(object(root.team).id);
  const holders = [
    ...list(root.roster),
    ...list(root.athletes),
    ...list(object(root.team).athletes),
    ...list(object(root.team).roster),
  ];

  const roster: TeamRosterEntry[] = [];
  const seen = new Set<string>();
  for (const entry of holders) {
    if (roster.length >= limit) break;
    const wrapper = object(entry);
    const athlete = object(wrapper.athlete ?? wrapper.player ?? (text(wrapper.displayName) || text(wrapper.fullName) ? wrapper : null));
    const name = text(athlete.displayName) ?? text(athlete.fullName)
      ?? ([text(athlete.firstName), text(athlete.lastName)].filter(Boolean).join(' ') || null);
    if (!name) continue;

    const rawId = text(athlete.id);
    const id = rawId && validEntityId(rawId) ? rawId : null;
    // The same player can arrive in two holders; keep the first reported entry.
    const key = id ?? `${name}:${text(athlete.jersey) ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const position = object(athlete.position).abbreviation ?? object(athlete.position).displayName ?? object(athlete.position).name
      ?? object(wrapper.position).abbreviation ?? object(wrapper.position).name;
    const experience = object(athlete.experience);

    roster.push({
      id,
      name,
      position: text(position, 40),
      jersey: text(athlete.jersey, 8),
      headshot: athletePortrait(meta, athlete.headshot, id),
      height: text(athlete.displayHeight) ?? digits(athlete.height),
      weight: text(athlete.displayWeight) ?? digits(athlete.weight),
      age: Number.isInteger(athlete.age) && (athlete.age as number) > 0 && (athlete.age as number) < 100 ? (athlete.age as number) : null,
      experience: text(experience.displayValue) ?? (digits(experience.years) ? `${digits(experience.years)} Yrs` : null),
      nationality: text(object(athlete.birthPlace).country) ?? text(object(athlete.birthPlace).countryFullName),
      born: bornDate(athlete.dateOfBirth ?? athlete.birthDate),
    });
  }
  return roster;
}

/** `error` is present only when a part was not reported, as `espnFailureDetails` returns it. */
/**
 * One part's report. `transport` says which route answered it — the reader's own
 * browser talking to ESPN directly, or this site's server — because the ESPN URL
 * is the same either way and a page should not be mysterious about it. The
 * server feed leaves it unset; the browser transport sets it on every part.
 */
export type TeamSource = EspnEndpointDetails & {
  ok: boolean;
  part: 'info' | 'schedule' | 'roster';
  error?: string;
  transport?: 'browser' | 'server';
};

/** One settled part: what ESPN said, and what it is worth on the page. */
export type TeamPart<T> = { source: TeamSource; value: T };

/**
 * One board from three settled parts — the single place the team board's shape
 * and status are decided, so the server feed and the browser transport cannot
 * drift apart. The status counts the parts ESPN answered: `ready` when all three
 * did, `partial` when some did, `unavailable` when none did. There is no fourth
 * value and no sample team behind any of them.
 */
export function teamBoardOf(
  meta: EspnLeague,
  reference: TeamReference,
  parts: {
    info: TeamPart<TeamIdentity | null>;
    schedule: TeamPart<TeamFixture[]>;
    roster: TeamPart<TeamRosterEntry[]>;
  },
): TeamBoard {
  const sources = [parts.info.source, parts.schedule.source, parts.roster.source];
  const answered = sources.filter((source) => source.ok).length;
  return {
    reference,
    leagueName: meta.name,
    sport: meta.kind,
    portraitsFromCdn: cdnPortraits(meta),
    team: parts.info.value,
    fixtures: parts.schedule.value,
    roster: parts.roster.value,
    status: answered === 0 ? 'unavailable' : answered === sources.length ? 'ready' : 'partial',
    fetchedAt: new Date().toISOString(),
    sources,
  };
}

export type TeamBoard = {
  reference: TeamReference;
  leagueName: string;
  sport: EspnLeague['kind'];
  /** True only where a portrait may come from ESPN's headshot CDN (NBA, NFL). */
  portraitsFromCdn: boolean;
  team: TeamIdentity | null;
  fixtures: TeamFixture[];
  roster: TeamRosterEntry[];
  status: 'ready' | 'partial' | 'unavailable';
  fetchedAt: string;
  sources: TeamSource[];
};

/**
 * The shape a client accepts from `/api/sports/teams/...`, checked before it
 * replaces the data on screen — the same guard the match details page applies,
 * so a proxy or a stale cache cannot inject arbitrary markup into the page.
 */
export function validTeamBoard(value: unknown, reference: TeamReference): boolean {
  const board = object(value);
  if (!['ready', 'partial', 'unavailable'].includes(String(board.status))) return false;
  if (typeof board.fetchedAt !== 'string') return false;
  const boardReference = object(board.reference);
  if (boardReference.league !== reference.league || boardReference.teamId !== reference.teamId) return false;
  if (!Array.isArray(board.sources) || board.sources.length > 3
    || !board.sources.every((raw) => typeof object(raw).ok === 'boolean' && typeof object(raw).url === 'string')) return false;
  if (!Array.isArray(board.fixtures) || !Array.isArray(board.roster)) return false;
  if (typeof board.portraitsFromCdn !== 'boolean') return false;
  if (board.status === 'unavailable' && board.team !== null) return false;
  if (board.team !== null && object(board.team).id !== reference.teamId) return false;
  return board.fixtures.every((raw) => validEntityId(object(raw).id) && typeof object(raw).date === 'string')
    && board.roster.every((raw) => typeof object(raw).name === 'string' && (object(raw).id === null || validEntityId(object(raw).id)));
}
