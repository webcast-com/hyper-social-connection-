import { ESPN_LEAGUES } from './sports-catalog';
import type { EspnEndpointDetails } from './espn-endpoints';

export type MatchReference = { league: string; eventId: string };
export type MatchTeam = { id: string; name: string; side: string | null; score: string | null };
export type MatchPlayer = { id: string; name: string; position: string | null; jersey: string | null; starter: boolean | null; didNotPlay: boolean };
export type MatchStatistics = { name: string; label: string; values: { teamId: string; value: string | null }[] };
export type MatchLineup = { teamId: string; formation: string | null; players: MatchPlayer[] };
export type MatchPlayerStats = { teamId: string; label: string; columns: string[]; players: { id: string; name: string; values: (string | null)[] }[] };
export type MatchUpdate = { id: string; text: string; clock: string | null; period: string | null; team: string | null; participants: string[] };
export type MatchDetails = {
  reference: MatchReference; leagueName: string; title: string; kickoff: string | null; venue: string | null;
  state: string | null; statusText: string | null; teams: MatchTeam[]; statistics: MatchStatistics[];
  lineups: MatchLineup[]; playerStats: MatchPlayerStats[]; updates: MatchUpdate[]; updatesLabel: string;
};
export type MatchBoard = {
  match: MatchDetails | null; status: 'ready' | 'unavailable'; fetchedAt: string;
  source: EspnEndpointDetails & { ok: boolean; error?: string };
};
export class MatchInputError extends Error {
  constructor(message: string, readonly httpStatus: number) { super(message); }
}

export function matchReference(league: string, id: unknown): MatchReference | undefined {
  const eventId = typeof id === 'number' && Number.isSafeInteger(id) ? String(id) : typeof id === 'string' ? id : '';
  return /^[1-9]\d{0,19}$/.test(eventId) ? { league, eventId } : undefined;
}
export function matchHref(reference: MatchReference) {
  return `/sports/matches/${encodeURIComponent(reference.league)}/${encodeURIComponent(reference.eventId)}`;
}
export function resolveMatch(league: string, eventId: string) {
  const meta = ESPN_LEAGUES.find((item) => item.slug === league && item.kind !== 'motorsport');
  if (!meta) throw new MatchInputError('Unknown match competition', 404);
  const reference = matchReference(league, eventId);
  if (!reference) throw new MatchInputError('Invalid ESPN event ID', 400);
  return { meta, reference, url: `https://site.api.espn.com/apis/site/v2/sports/${meta.sport}/${meta.league}/summary?event=${eventId}` };
}

const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const at = (v: unknown, ...keys: string[]): unknown => keys.reduce((value, key) => object(value)[key], v);
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const text = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v.trim().slice(0, 4000) : typeof v === 'number' && Number.isFinite(v) ? String(v) : null;
const display = (v: unknown): string | null => text(v) ?? text(at(v, 'displayValue')) ?? text(at(v, 'value'));

function player(row: unknown): MatchPlayer | null {
  const athlete = at(row, 'athlete');
  const name = text(at(athlete, 'displayName')) ?? text(at(athlete, 'fullName'));
  if (!name) return null;
  return {
    id: text(at(athlete, 'id')) ?? name, name,
    position: text(at(row, 'position', 'abbreviation')) ?? text(at(athlete, 'position', 'abbreviation')),
    jersey: text(at(row, 'jersey')) ?? text(at(athlete, 'jersey')),
    starter: typeof at(row, 'starter') === 'boolean' ? at(row, 'starter') as boolean : null,
    didNotPlay: at(row, 'didNotPlay') === true,
  };
}

/** Normalize Site summary data only; never dereference Core $refs or invent lineups/statistics. */
export function parseMatchDetails(payload: unknown, reference: MatchReference): MatchDetails {
  const { meta } = resolveMatch(reference.league, reference.eventId);
  const header = at(payload, 'header');
  if (text(at(header, 'id')) !== reference.eventId) throw new Error('Invalid ESPN summary: event ID mismatch');
  const competition = array(at(header, 'competitions'))[0];
  if (!competition) throw new Error('Invalid ESPN summary: competition missing');
  const teams = array(at(competition, 'competitors')).flatMap((row): MatchTeam[] => {
    const id = text(at(row, 'team', 'id'));
    const name = text(at(row, 'team', 'displayName')) ?? text(at(row, 'team', 'name'));
    return id && name ? [{ id, name, side: text(at(row, 'homeAway')), score: display(at(row, 'score')) }] : [];
  }).slice(0, 2);
  if (teams.length !== 2 || teams[0].id === teams[1].id) throw new Error('Invalid ESPN summary: two named teams required');
  const teamIds = new Set(teams.map((team) => team.id));
  const statisticMap = new Map<string, MatchStatistics>();
  for (const row of array(at(payload, 'boxscore', 'teams')).slice(0, 2)) {
    const teamId = text(at(row, 'team', 'id'));
    if (!teamId || !teamIds.has(teamId)) continue;
    for (const stat of array(at(row, 'statistics')).slice(0, 100)) {
      const label = text(at(stat, 'label')) ?? text(at(stat, 'displayName')) ?? text(at(stat, 'name'));
      const name = text(at(stat, 'name')) ?? label;
      if (!label || !name) continue;
      const entry = statisticMap.get(name) ?? { name, label, values: [] };
      if (!entry.values.some((value) => value.teamId === teamId)) entry.values.push({ teamId, value: display(at(stat, 'displayValue')) ?? display(at(stat, 'value')) });
      statisticMap.set(name, entry);
    }
  }
  const lineups = new Map<string, MatchLineup>();
  for (const row of array(at(payload, 'rosters')).slice(0, 2)) {
    const teamId = text(at(row, 'team', 'id'));
    if (!teamId || !teamIds.has(teamId)) continue;
    const players = array(at(row, 'roster')).slice(0, 100).map(player).filter((item): item is MatchPlayer => !!item);
    if (players.length) lineups.set(teamId, { teamId, formation: text(at(row, 'formation')) ?? text(at(row, 'formation', 'displayName')), players });
  }
  const rosterTeams = new Set(lineups.keys());
  const playerStats: MatchPlayerStats[] = [];
  const rootPlayers = array(at(payload, 'boxscore', 'players'));
  const playerBlocks = rootPlayers.length ? rootPlayers : array(at(payload, 'boxscore', 'teams')).flatMap((team) =>
    array(at(team, 'players')).map((block) => ({ ...object(block), team: at(block, 'team') ?? at(team, 'team') })));
  for (const row of playerBlocks.slice(0, 20)) {
    const teamId = text(at(row, 'team', 'id'));
    if (!teamId || !teamIds.has(teamId)) continue;
    const listed = new Map<string, MatchPlayer>();
    for (const group of array(at(row, 'statistics')).slice(0, 20)) {
      const columns = (array(at(group, 'labels')).length ? array(at(group, 'labels')) : array(at(group, 'names'))).slice(0, 40).map((value) => text(value));
      const rows: MatchPlayerStats['players'] = [];
      for (const entry of array(at(group, 'athletes')).slice(0, 100)) {
        const person = player(entry);
        if (!person) continue;
        listed.set(person.id, person);
        rows.push({ id: person.id, name: person.name, values: columns.map((_, index) => display(array(at(entry, 'stats'))[index])) });
      }
      if (columns.length && columns.every((label) => !!label) && rows.length) playerStats.push({ teamId,
        label: text(at(group, 'text')) ?? text(at(group, 'displayName')) ?? text(at(group, 'name')) ?? 'Player statistics', columns: columns as string[], players: rows });
    }
    if (!rosterTeams.has(teamId) && listed.size) {
      const merged = new Map((lineups.get(teamId)?.players ?? []).map((person) => [person.id, person]));
      listed.forEach((person, id) => merged.set(id, person));
      lineups.set(teamId, { teamId, formation: null, players: [...merged.values()] });
    }
  }
  // Keep one reported event feed in its original order instead of mixing incompatible clocks.
  const feeds = [['keyEvents', 'Key events'], ['plays', 'Play by play'], ['scoringPlays', 'Scoring plays'], ['commentary', 'Commentary']] as const;
  let updates: MatchUpdate[] = [];
  let updatesLabel = 'Match events';
  for (const [key, label] of feeds) {
    const seen = new Set<string>();
    const parsed = array(at(payload, key)).slice(-200).flatMap((item): MatchUpdate[] => {
      const description = text(at(item, 'text')) ?? text(at(item, 'play', 'text')) ?? text(at(item, 'type', 'text'));
      if (!description) return [];
      const clock = text(at(item, 'clock', 'displayValue')) ?? text(at(item, 'time', 'displayValue')) ?? text(at(item, 'play', 'clock', 'displayValue'));
      const period = text(at(item, 'period', 'number')) ?? text(at(item, 'play', 'period', 'number'));
      const id = text(at(item, 'id')) ?? text(at(item, 'play', 'id')) ?? `${period}:${clock}:${description}`;
      if (seen.has(id)) return [];
      seen.add(id);
      const teamId = text(at(item, 'team', 'id')) ?? text(at(item, 'play', 'team', 'id'));
      const participants = [...new Set([...array(at(item, 'participants')), ...array(at(item, 'athletesInvolved')), ...array(at(item, 'play', 'participants'))].slice(0, 10)
        .map((person) => text(at(person, 'athlete', 'displayName')) ?? text(at(person, 'displayName')) ?? text(at(person, 'athlete', 'fullName'))).filter((name): name is string => !!name))];
      return [{ id, text: description, clock, period, team: teams.find((team) => team.id === teamId)?.name ?? null, participants }];
    });
    if (parsed.length) { updates = parsed; updatesLabel = label; break; }
  }
  const rawDate = text(at(competition, 'date')) ?? text(at(header, 'date'));
  const status = at(competition, 'status', 'type') ?? at(header, 'status', 'type');
  const kickoff = rawDate && Number.isFinite(Date.parse(rawDate)) ? new Date(rawDate).toISOString() : null;
  return {
    reference, leagueName: meta.name, title: `${teams[0].name} vs ${teams[1].name}`,
    kickoff, venue: text(at(payload, 'gameInfo', 'venue', 'fullName')) ?? text(at(competition, 'venue', 'fullName')),
    state: text(at(status, 'state')),
    statusText: text(at(status, 'detail')) ?? text(at(status, 'shortDetail')),
    teams, statistics: [...statisticMap.values()], lineups: [...lineups.values()], playerStats, updates, updatesLabel,
  };
}
