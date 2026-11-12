/**
 * ESPN athlete detail, normalised: biography, team and season statistics.
 *
 * Part of the same separate stack as `espn-team.ts` — its own parser, feed,
 * endpoints and page — and it borrows that module's entity primitives
 * (`validEntityId`, `athletePortrait`, `entityLinks`) so a team page and a
 * player page can never disagree about what an id or a portrait is.
 *
 * The same four rules hold: provider-reported images only, portraits
 * synthesised from the CDN for the NBA and NFL alone, validated ids before any
 * URL, and nothing invented — a statistic ESPN did not report is absent rather
 * than zero, and a player's status is ESPN's own wording.
 */
import type { EspnLeague } from './sports-catalog';
import { ESPN_LEAGUES } from './sports-catalog';
import type { EspnEndpointDetails } from './espn-endpoints';
import { athletePortrait, cdnPortraits, entityLinks, safeExternalUrl, teamCrest, validEntityId, type TeamLink } from './espn-team';

export class AthleteInputError extends Error {
  constructor(message: string, readonly httpStatus: number) {
    super(message);
    this.name = 'AthleteInputError';
  }
}

export type AthleteReference = { league: string; athleteId: string };

export function athleteHref(reference: AthleteReference): string {
  return `/sports/athletes/${encodeURIComponent(reference.league)}/${encodeURIComponent(reference.athleteId)}`;
}

const PATH_SEGMENT = /^[a-z][a-z0-9-]*\/[a-z0-9][a-z0-9._-]*$/;

/**
 * The two endpoints behind a player page.
 *
 * The site endpoint is what ESPN.com itself reads and answers across every
 * sport; the common v3 endpoint is the one this repository already uses for
 * leaders and carries the richer statistics splits. The feed tries them in that
 * order and reports both, so a competition served by only one still renders.
 */
export function resolveAthlete(league: string, athleteId: string): {
  meta: EspnLeague;
  reference: AthleteReference;
  urls: { site: string; common: string };
} {
  const meta = ESPN_LEAGUES.find((entry) => entry.slug === league);
  if (!meta) throw new AthleteInputError('Unknown player competition', 404);
  if (!validEntityId(athleteId)) throw new AthleteInputError('A numeric ESPN player id is required', 400);
  const path = `${meta.sport}/${meta.league}`;
  if (!PATH_SEGMENT.test(path)) throw new AthleteInputError('Invalid ESPN player path', 400);
  return {
    meta,
    reference: { league: meta.slug, athleteId },
    urls: {
      site: `https://site.api.espn.com/apis/site/v2/sports/${path}/athletes/${athleteId}`,
      common: `https://site.web.api.espn.com/apis/common/v3/sports/${path}/athletes/${athleteId}`,
    },
  };
}

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

export type AthleteStat = { label: string; value: string };
export type AthleteStatGroup = { name: string; stats: AthleteStat[] };

export const MAX_STAT_GROUPS = 3;
export const MAX_STATS_PER_GROUP = 12;

/** A value worth showing: a number or short text, never the player's own identity. */
function statValue(raw: unknown, skip: string[]): string | null {
  const value = typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : text(raw, 24);
  if (value === null) return null;
  if (skip.some((ignored) => ignored.toLowerCase() === value.toLowerCase())) return null;
  // A labels/statistics row carries the athlete's own id in its leading columns;
  // those are biography, not statistics, and no season statistic is that wide.
  return /^\d{5,}$/.test(value) ? null : value;
}

/**
 * One statistics category → a labelled group.
 *
 * ESPN reports statistics in three shapes depending on the endpoint and sport:
 * `stats[]` objects with their own labels, `labels[]` paired with numeric
 * `statistics[]` rows, or a flat object of totals (`{ appearances: 12 }`). All
 * three are read; whatever does not fit is dropped rather than guessed at.
 */
function statGroup(category: Record<string, unknown>, athleteName: string | null, athleteId: string): AthleteStatGroup | null {
  const name = text(category.displayName) ?? text(category.name) ?? text(category.title) ?? 'Season statistics';
  const skip = [athleteName ?? '', athleteId].filter(Boolean);
  const stats: AthleteStat[] = [];

  const push = (label: unknown, value: unknown) => {
    if (stats.length >= MAX_STATS_PER_GROUP) return;
    const shown = statValue(value, skip);
    const key = text(label, 60);
    if (key && shown !== null && !stats.some((stat) => stat.label === key)) stats.push({ label: key, value: shown });
  };

  for (const entry of list(category.stats)) {
    const stat = object(entry);
    push(stat.displayName ?? stat.name ?? stat.abbreviation ?? stat.label, stat.displayValue ?? stat.value);
  }

  if (!stats.length) {
    const labels = list(category.labels).map((label) => text(label, 60));
    const rows = list(category.statistics);
    const row = Array.isArray(rows[0]) ? (rows[0] as unknown[]) : rows;
    if (labels.length && row.length) labels.forEach((label, index) => push(label, row[index]));
  }

  if (!stats.length) {
    for (const holder of ['averages', 'totals', 'seasonStatistics', 'general']) {
      const flat = object(category[holder]);
      for (const [key, value] of Object.entries(flat)) push(key, value);
      if (stats.length) break;
    }
  }

  return stats.length ? { name, stats } : null;
}

function statGroupsOf(payload: Record<string, unknown>, athlete: Record<string, unknown>, athleteId: string): AthleteStatGroup[] {
  const statistics = object(payload.statistics);
  const holders = [
    ...list(object(statistics.splits).categories),
    ...list(statistics.categories),
    ...list(payload.categories),
    ...list(object(athlete.statistics).categories),
  ];
  const name = text(athlete.displayName) ?? text(athlete.fullName);
  const groups: AthleteStatGroup[] = [];
  for (const entry of holders) {
    if (groups.length >= MAX_STAT_GROUPS) break;
    const group = statGroup(object(entry), name, athleteId);
    if (group && !groups.some((existing) => existing.name === group.name)) groups.push(group);
  }
  return groups;
}

export type AthleteTeam = { id: string | null; name: string; abbreviation: string | null; logo: string | null };

export type AthleteDetail = {
  id: string;
  name: string;
  shortName: string | null;
  headshot: string | null;
  position: string | null;
  jersey: string | null;
  age: number | null;
  born: string | null;
  height: string | null;
  weight: string | null;
  college: string | null;
  nationality: string | null;
  experience: string | null;
  /** ESPN's own wording for availability, e.g. "Active" or "Day-To-Day". */
  statusText: string | null;
  active: boolean | null;
  team: AthleteTeam | null;
  statGroups: AthleteStatGroup[];
  links: TeamLink[];
};

const bornDate = (value: unknown): string | null => {
  const raw = text(value, 40);
  if (!raw) return null;
  const stamp = Date.parse(raw);
  if (!Number.isFinite(stamp)) return null;
  const date = new Date(stamp);
  return date.getTime() > Date.now() || date.getUTCFullYear() < 1850 ? null : date.toISOString().slice(0, 10);
};

/**
 * An athlete response → the player page's data.
 *
 * Throws when the payload is not about the player that was asked for, or when no
 * name was reported: an anonymous profile is not rendered, and the feed turns
 * the throw into an honest `unavailable` board.
 */
export function parseAthlete(payload: unknown, meta: EspnLeague, reference: AthleteReference): AthleteDetail {
  const root = object(payload);
  const athlete = object(root.athlete ?? root);
  const rawId = text(athlete.id);
  if (!rawId || rawId !== reference.athleteId || !validEntityId(rawId)) throw new Error('Player identity not confirmed');
  const name = text(athlete.displayName) ?? text(athlete.fullName)
    ?? ([text(athlete.firstName), text(athlete.lastName)].filter(Boolean).join(' ') || null);
  if (!name) throw new Error('Player name not reported');

  const teams = list(athlete.teams).map((entry) => object(entry));
  const teamHolder = object(athlete.team ?? teams.find((entry) => entry.isTeamActive !== false) ?? teams[0] ?? null);
  const teamName = text(teamHolder.displayName) ?? text(teamHolder.name);
  const teamId = text(teamHolder.id);
  const status = object(athlete.status);
  const experience = object(athlete.experience);

  return {
    id: rawId,
    name,
    shortName: text(athlete.shortName),
    headshot: athletePortrait(meta, athlete.headshot, rawId),
    position: text(object(athlete.position).abbreviation ?? object(athlete.position).displayName ?? object(athlete.position).name, 40),
    jersey: text(athlete.jersey, 8),
    age: Number.isInteger(athlete.age) && (athlete.age as number) > 0 && (athlete.age as number) < 100 ? (athlete.age as number) : null,
    born: bornDate(athlete.dateOfBirth ?? athlete.birthDate),
    height: text(athlete.displayHeight) ?? digits(athlete.height),
    weight: text(athlete.displayWeight) ?? digits(athlete.weight),
    college: text(object(athlete.college).name) ?? text(athlete.school),
    nationality: text(object(athlete.birthPlace).country) ?? text(object(athlete.birthPlace).countryFullName),
    experience: text(experience.displayValue) ?? (digits(experience.years) ? `${digits(experience.years)} Yrs` : null),
    statusText: text(status.description) ?? text(status.detail) ?? text(status.type),
    active: typeof athlete.isActive === 'boolean' ? athlete.isActive : null,
    team: teamName
      ? { id: teamId && validEntityId(teamId) ? teamId : null, name: teamName, abbreviation: text(teamHolder.abbreviation, 12), logo: teamCrest(teamHolder) }
      : null,
    statGroups: statGroupsOf(root, athlete, rawId),
    links: entityLinks(athlete),
  };
}

/** `error` is present only when the endpoint did not report the player. */
/**
 * One endpoint attempt's report. `transport` says which route answered — the
 * reader's own browser or this site's server — because both ask the same ESPN
 * URL and the difference is worth recording. The server feed leaves it unset.
 */
export type AthleteSource = EspnEndpointDetails & {
  ok: boolean;
  error?: string;
  transport?: 'browser' | 'server';
};

/**
 * One board from the attempts that were made — the single place the player
 * board's shape and status are decided, so the server feed and the browser
 * transport cannot drift apart. A player ESPN reported nowhere is `unavailable`,
 * never a sample biography.
 */
export function athleteBoardOf(
  meta: EspnLeague,
  reference: AthleteReference,
  athlete: AthleteDetail | null,
  sources: AthleteSource[],
): AthleteBoard {
  return {
    reference,
    leagueName: meta.name,
    sport: meta.kind,
    portraitsFromCdn: cdnPortraits(meta),
    athlete,
    status: athlete ? 'ready' : 'unavailable',
    fetchedAt: new Date().toISOString(),
    sources,
  };
}

export type AthleteBoard = {
  reference: AthleteReference;
  leagueName: string;
  sport: EspnLeague['kind'];
  /** True only where a portrait may come from ESPN's headshot CDN (NBA, NFL). */
  portraitsFromCdn: boolean;
  athlete: AthleteDetail | null;
  status: 'ready' | 'unavailable';
  fetchedAt: string;
  sources: AthleteSource[];
};

/** The shape a client accepts from `/api/sports/athletes/...`. */
export function validAthleteBoard(value: unknown, reference: AthleteReference): boolean {
  const board = object(value);
  if (!['ready', 'unavailable'].includes(String(board.status))) return false;
  if (typeof board.fetchedAt !== 'string') return false;
  const boardReference = object(board.reference);
  if (boardReference.league !== reference.league || boardReference.athleteId !== reference.athleteId) return false;
  if (typeof board.portraitsFromCdn !== 'boolean') return false;
  if (!Array.isArray(board.sources) || board.sources.length > 2
    || !board.sources.every((raw) => typeof object(raw).ok === 'boolean' && typeof object(raw).url === 'string')) return false;
  if (board.status === 'unavailable' && board.athlete !== null) return false;
  const athlete = object(board.athlete);
  if (board.athlete === null) return true;
  if (athlete.id !== reference.athleteId || typeof athlete.name !== 'string') return false;
  if (!Array.isArray(athlete.statGroups) || athlete.statGroups.length > MAX_STAT_GROUPS) return false;
  if (!Array.isArray(athlete.links) || !athlete.links.every((raw) => safeExternalUrl(object(raw).url) === object(raw).url)) return false;
  return athlete.statGroups.every((raw) => typeof object(raw).name === 'string'
    && Array.isArray(object(raw).stats)
    && list(object(raw).stats).length <= MAX_STATS_PER_GROUP
    && list(object(raw).stats).every((stat) => typeof object(stat).label === 'string' && typeof object(stat).value === 'string'));
}
