/**
 * The three figures on a player's card.
 *
 * A presentation choice only: it picks from what the player page already holds
 * (`AthleteDetail`, as parsed by `espn-athlete.ts`) and asks for nothing. The
 * endpoints, the parser and the team pages are not involved.
 *
 * The rules:
 *
 *   - a figure is one ESPN reported, shown under ESPN's own label and with
 *     ESPN's own value. Nothing is computed, renamed or rounded;
 *   - the figures a fan looks for first lead where the sport has an obvious
 *     three (goals, assists and appearances in football; points, rebounds and
 *     assists in basketball; goals, assists and points in ice hockey);
 *   - any place left is filled with the next statistics ESPN listed, in ESPN's
 *     order, and after those with the biography (age, height, weight);
 *   - a player with fewer than three reported figures gets fewer tiles. A tile
 *     is never padded with a zero or a dash.
 */
import type { AthleteDetail } from './espn-athlete';
import type { EspnLeague } from './sports-catalog';

export type AthleteHeadline = {
  label: string;
  value: string;
  /** Where it came from: a season statistic, or the player's biography. */
  source: 'stat' | 'bio';
};

export const HEADLINE_TILES = 3;

/** A label as it is compared: lower case, letters and digits only. */
const plain = (label: string): string => label.toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * What each sport leads with: for each tile, the labels ESPN uses for that
 * figure, most specific first. Compared with `plain`, so "Goal Assists",
 * "goalAssists" and "GOAL ASSISTS" are one label.
 */
const LEADS: Partial<Record<EspnLeague['kind'], readonly (readonly string[])[]>> = {
  football: [
    ['goals', 'totalgoals', 'gls', 'g'],
    ['assists', 'goalassists', 'ast', 'a'],
    ['appearances', 'apps', 'app', 'matchesplayed', 'matches', 'gamesplayed', 'games', 'gp', 'mp'],
  ],
  basketball: [
    ['pointspergame', 'avgpoints', 'ppg', 'pts', 'points'],
    ['reboundspergame', 'avgrebounds', 'rpg', 'reb', 'rebounds'],
    ['assistspergame', 'avgassists', 'apg', 'ast', 'assists'],
  ],
  'ice-hockey': [
    ['goals', 'g'],
    ['assists', 'a'],
    ['points', 'pts'],
  ],
};

export function athleteHeadlines(
  athlete: Pick<AthleteDetail, 'statGroups' | 'age' | 'height' | 'weight'> | null | undefined,
  sport: EspnLeague['kind'],
  limit: number = HEADLINE_TILES,
): AthleteHeadline[] {
  if (!athlete || limit <= 0) return [];
  // Every reported statistic once, in ESPN's order. The same label in a second
  // group is the same figure split another way; the first is kept.
  const stats: { key: string; label: string; value: string }[] = [];
  for (const group of athlete.statGroups ?? []) {
    for (const stat of group.stats ?? []) {
      const key = plain(stat.label);
      if (key && stat.value.trim() && !stats.some((held) => held.key === key)) stats.push({ key, label: stat.label, value: stat.value });
    }
  }

  const picked: AthleteHeadline[] = [];
  const used = new Set<string>();
  const take = (stat: { key: string; label: string; value: string }) => {
    if (picked.length >= limit || used.has(stat.key)) return;
    used.add(stat.key);
    picked.push({ label: stat.label, value: stat.value, source: 'stat' });
  };

  for (const names of LEADS[sport] ?? []) {
    // The most specific label wins, not whichever ESPN happened to list first.
    const found = names.map((name) => stats.find((stat) => stat.key === name && !used.has(stat.key))).find(Boolean);
    if (found) take(found);
  }
  for (const stat of stats) take(stat);

  const bio: [string, string | null][] = [
    ['Age', athlete.age !== null && athlete.age !== undefined ? String(athlete.age) : null],
    ['Height', athlete.height ?? null],
    ['Weight', athlete.weight ?? null],
  ];
  for (const [label, value] of bio) {
    if (picked.length >= limit) break;
    if (value && value.trim()) picked.push({ label, value, source: 'bio' });
  }
  return picked;
}
