import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AthleteInputError,
  athleteHref,
  MAX_STATS_PER_GROUP,
  MAX_STAT_GROUPS,
  parseAthlete,
  resolveAthlete,
  validAthleteBoard,
} from '../../src/lib/espn-athlete';
import { ESPN_LEAGUES } from '../../src/lib/sports-catalog';

/**
 * Player detail, parsed.
 *
 * ESPN reports players in more than one shape depending on the endpoint and the
 * sport, so all of them are read — and everything it did not report stays
 * absent. A statistic is never padded to zero, a portrait is never invented
 * outside the NBA and NFL, and a payload about somebody else is refused.
 */

const meta = (slug: string) => {
  const found = ESPN_LEAGUES.find((entry) => entry.slug === slug);
  assert.ok(found, `${slug} is configured in the catalog`);
  return found!;
};

const reference = { league: 'nba', athleteId: '3945274' };

const athlete = (over: Record<string, unknown> = {}) => ({
  id: 3945274,
  uid: 's:4000~l:46~a:3945274',
  displayName: 'Luka Dončić',
  shortName: 'L. Dončić',
  firstName: 'Luka',
  lastName: 'Dončić',
  headshot: { href: 'https://a.espncdn.com/i/headshots/nba/players/full/3945274.png' },
  jersey: '77',
  position: { id: 1, name: 'Point Guard', displayName: 'Point Guard', abbreviation: 'PG', leaf: true },
  age: 27,
  dateOfBirth: '1999-02-28',
  displayHeight: '6\'7"',
  displayWeight: '230 lbs',
  college: { id: 1, name: 'Real Madrid' },
  birthPlace: { city: 'Ljubljana', country: 'Slovenia' },
  experience: { years: 8, displayValue: '8 Yrs' },
  status: { description: 'Active', detail: 'Active', state: 'active' },
  isActive: true,
  team: { id: 1001, displayName: 'Los Angeles Lakers', abbreviation: 'LAL', logo: 'https://a.espncdn.com/i/teamlogos/nba/500/lal.png' },
  links: [
    { href: 'https://www.espn.com/nba/player/_/id/3945274', text: 'Luka Doncic stats' },
    { href: 'javascript:alert(1)', text: 'Not a link' },
    { href: 'https://espn.com/unlabelled' },
  ],
  ...over,
});

test('a player page is addressed by a catalog competition and a numeric ESPN id', () => {
  const resolved = resolveAthlete('nba', '3945274');
  assert.equal(resolved.reference.league, 'nba');
  assert.deepEqual(resolved.urls, {
    site: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/athletes/3945274',
    common: 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/3945274',
  });
  assert.equal(athleteHref(resolved.reference), '/sports/athletes/nba/3945274');

  // Every configured competition builds both URLs from the catalog's own path.
  for (const slug of ['epl', 'nfl', 'kenya', 'ncaam', 'afcon']) {
    const entry = resolveAthlete(slug, '42');
    const league = meta(slug);
    assert.equal(entry.urls.site, `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.league}/athletes/42`);
    assert.equal(entry.urls.common, `https://site.web.api.espn.com/apis/common/v3/sports/${league.sport}/${league.league}/athletes/42`);
  }

  assert.throws(() => resolveAthlete('not-a-league', '1'),
    (error: unknown) => error instanceof AthleteInputError && error.httpStatus === 404);
  for (const bad of ['abc', '0042', '0', '', '../../etc/passwd', '1'.repeat(21), 3945274 as unknown as string]) {
    assert.throws(() => resolveAthlete('nba', bad),
      (error: unknown) => error instanceof AthleteInputError && error.httpStatus === 400, `${String(bad)} is refused with a 400`);
  }
});

test('a biography is read from the payload, and only from the payload', () => {
  const player = parseAthlete({ athlete: athlete() }, meta('nba'), reference);
  assert.equal(player.id, '3945274');
  assert.equal(player.name, 'Luka Dončić');
  assert.equal(player.shortName, 'L. Dončić');
  assert.equal(player.headshot, 'https://a.espncdn.com/i/headshots/nba/players/full/3945274.png');
  assert.equal(player.position, 'PG');
  assert.equal(player.jersey, '77');
  assert.equal(player.age, 27);
  assert.equal(player.born, '1999-02-28');
  assert.equal(player.height, '6\'7"');
  assert.equal(player.weight, '230 lbs');
  assert.equal(player.college, 'Real Madrid');
  assert.equal(player.nationality, 'Slovenia');
  assert.equal(player.experience, '8 Yrs');
  assert.equal(player.statusText, 'Active');
  assert.equal(player.active, true);
  assert.deepEqual(player.team, { id: '1001', name: 'Los Angeles Lakers', abbreviation: 'LAL', logo: 'https://a.espncdn.com/i/teamlogos/nba/500/lal.png' });
  assert.deepEqual(player.links, [{ label: 'Luka Doncic stats', url: 'https://www.espn.com/nba/player/_/id/3945274' }]);

  // Split names are read when no display name is reported.
  const splitName = parseAthlete({ athlete: athlete({ displayName: null, shortName: null }) }, meta('nba'), reference);
  assert.equal(splitName.name, 'Luka Dončić');

  // A payload about somebody else is refused, not rendered under this name.
  assert.throws(() => parseAthlete({ athlete: athlete({ id: 3202 }) }, meta('nba'), reference), /not confirmed/);
  assert.throws(() => parseAthlete({ athlete: { id: 3945274 } }, meta('nba'), reference), /name not reported/i);
  assert.throws(() => parseAthlete({}, meta('nba'), reference), /not confirmed/);
  assert.throws(() => parseAthlete(null, meta('nba'), reference), /not confirmed/);

  // Nothing reported stays null; a future or implausible birth date is not shown.
  const sparse = parseAthlete({ athlete: { id: 3945274, displayName: 'Luka Dončić', dateOfBirth: '2099-01-01' } }, meta('nba'), reference);
  assert.equal(sparse.position, null);
  assert.equal(sparse.jersey, null);
  assert.equal(sparse.age, null);
  assert.equal(sparse.born, null, 'a birth date in the future is not reported as fact');
  assert.equal(sparse.height, null);
  assert.equal(sparse.college, null);
  assert.equal(sparse.nationality, null);
  assert.equal(sparse.experience, null);
  assert.equal(sparse.statusText, null);
  assert.equal(sparse.active, null);
  assert.equal(sparse.team, null);
  assert.deepEqual(sparse.statGroups, []);

  // A numeric height, a school reported as a string, and a team list rather than
  // a single team are all shapes ESPN really sends.
  const numeric = parseAthlete({
    athlete: athlete({
      displayHeight: null, height: 79, displayWeight: null, weight: 230,
      college: null, school: 'Duke',
      team: null, teams: [{ id: 2, displayName: 'Former Club', isTeamActive: false }, { id: 1001, displayName: 'Los Angeles Lakers' }],
    }),
  }, meta('nba'), reference);
  assert.equal(numeric.height, '79');
  assert.equal(numeric.weight, '230');
  assert.equal(numeric.college, 'Duke');
  assert.deepEqual(numeric.team, { id: '1001', name: 'Los Angeles Lakers', abbreviation: null, logo: null });
});

test('a portrait comes from the CDN only where this repository has proved the folder', () => {
  // No reported photo: the NBA gets its headshot, a soccer player gets none —
  // ESPN ids are global, so the same id in another league's folder is a
  // different person's face.
  const noPhoto = { athlete: athlete({ headshot: null }) };
  assert.equal(parseAthlete(noPhoto, meta('nba'), reference).headshot, 'https://a.espncdn.com/i/headshots/nba/players/full/3945274.png');
  assert.equal(parseAthlete(noPhoto, meta('nfl'), reference).headshot, 'https://a.espncdn.com/i/headshots/nfl/players/full/3945274.png');
  assert.equal(parseAthlete(noPhoto, meta('epl'), reference).headshot, null);
  assert.equal(parseAthlete(noPhoto, meta('ncaam'), reference).headshot, null);
  assert.equal(parseAthlete(noPhoto, meta('kenya'), reference).headshot, null);

  // A reported photo wins everywhere, and a non-https value is never used.
  assert.equal(parseAthlete({ athlete: athlete({ headshot: { href: 'https://a.espncdn.com/photo/reported.png' } }) }, meta('epl'), reference).headshot,
    'https://a.espncdn.com/photo/reported.png');
  assert.equal(parseAthlete({ athlete: athlete({ headshot: 'data:image/png;base64,AAA' }) }, meta('nba'), reference).headshot,
    'https://a.espncdn.com/i/headshots/nba/players/full/3945274.png');
});

/** ESPN reports statistics as label/value objects, as labels over numeric rows, or as flat totals. */
const statsCategories = (categories: unknown[]) => ({ athlete: athlete(), statistics: { splits: { categories } } });

test('statistics are read in the shapes ESPN sends, with ESPN\u2019s own labels', () => {
  // Labels over a numeric row: the leading identity columns are biography, not
  // statistics, so the player's own name and id are skipped.
  const rows = parseAthlete(statsCategories([{
    name: 'general', displayName: 'General',
    labels: ['RK', 'Player', 'Team', 'POS', 'GP', 'MIN', 'PTS', 'REB', 'AST'],
    statistics: [[1, 'Luka Dončić', 3945274, 'PG', 78, 37.5, 33.9, 9.1, 9.1]],
  }]), meta('nba'), reference);
  assert.deepEqual(rows.statGroups, [{
    name: 'General',
    stats: [
      { label: 'RK', value: '1' }, { label: 'POS', value: 'PG' }, { label: 'GP', value: '78' },
      { label: 'MIN', value: '37.5' }, { label: 'PTS', value: '33.9' }, { label: 'REB', value: '9.1' }, { label: 'AST', value: '9.1' },
    ],
  }]);

  // Label/value objects, including a value ESPN left empty.
  const objects = parseAthlete(statsCategories([{
    displayName: 'Offensive',
    stats: [{ displayName: 'Games played', value: 78 }, { abbreviation: 'PPG', displayValue: '33.9' }, { name: 'Assists', value: null }],
  }]), meta('nba'), reference);
  assert.deepEqual(objects.statGroups, [{
    name: 'Offensive',
    stats: [{ label: 'Games played', value: '78' }, { label: 'PPG', value: '33.9' }],
  }]);

  // Flat totals, as soccer competitions report them.
  const flat = parseAthlete(statsCategories([{ name: 'season', displayName: 'Season', averages: { appearances: 12, goals: 5, assists: 3 } }]), meta('epl'), { league: 'epl', athleteId: '3945274' });
  assert.deepEqual(flat.statGroups, [{
    name: 'Season',
    stats: [{ label: 'appearances', value: '12' }, { label: 'goals', value: '5' }, { label: 'assists', value: '3' }],
  }]);

  // Other holders ESPN uses for the same idea.
  for (const holder of ['statistics', 'categories']) {
    const payload = holder === 'statistics'
      ? { athlete: athlete(), statistics: { categories: [{ displayName: 'Shooting', stats: [{ displayName: 'Goals', value: 5 }] }] } }
      : { athlete: athlete({ statistics: { categories: [{ displayName: 'Shooting', stats: [{ displayName: 'Goals', value: 5 }] }] } }) };
    assert.deepEqual(parseAthlete(payload, meta('nba'), reference).statGroups, [{ name: 'Shooting', stats: [{ label: 'Goals', value: '5' }] }], holder);
  }

  // A category with nothing readable is dropped rather than shown empty, and a
  // category with no name still gets one.
  assert.deepEqual(parseAthlete(statsCategories([{ displayName: 'Empty', stats: [{ displayName: 'Nothing', value: '' }] }]), meta('nba'), reference).statGroups, []);
  assert.deepEqual(parseAthlete(statsCategories([{ stats: [{ displayName: 'Goals', value: 5 }] }]), meta('nba'), reference).statGroups, [{ name: 'Season statistics', stats: [{ label: 'Goals', value: '5' }] }]);
});

test('statistics are bounded, deduplicated and never padded', () => {
  const many = Array.from({ length: MAX_STATS_PER_GROUP + 8 }, (_, index) => ({ displayName: `Stat ${index}`, value: index }));
  const groups = Array.from({ length: MAX_STAT_GROUPS + 4 }, (_, index) => ({ displayName: `Group ${index}`, stats: many }));
  groups.push({ displayName: 'Group 0', stats: [{ displayName: 'Repeat', value: 1 }] });

  const player = parseAthlete(statsCategories(groups), meta('nba'), reference);
  assert.equal(player.statGroups.length, MAX_STAT_GROUPS, 'a page shows a few groups, not every category');
  assert.deepEqual(player.statGroups.map((group) => group.name), ['Group 0', 'Group 1', 'Group 2'], 'a repeated category is not a second group');
  assert.equal(player.statGroups[0].stats.length, MAX_STATS_PER_GROUP);
  assert.deepEqual(player.statGroups[0].stats[0], { label: 'Stat 0', value: '0' }, 'a reported zero is a value, not a gap');
  assert.equal(player.statGroups[0].stats.every((stat) => typeof stat.value === 'string'), true);
});

test('a board is accepted only when it is about the player that was asked for', () => {
  const board = {
    reference, leagueName: 'NBA', sport: 'basketball', portraitsFromCdn: true,
    athlete: parseAthlete(statsCategories([{ displayName: 'General', stats: [{ displayName: 'PPG', value: '33.9' }] }]), meta('nba'), reference),
    status: 'ready', fetchedAt: '2026-11-10T00:00:00.000Z',
    sources: [{ ok: true, url: 'https://site.api.espn.com/x', httpStatus: 200 }],
  };
  assert.equal(validAthleteBoard(board, reference), true);
  assert.equal(validAthleteBoard({ ...board, reference: { league: 'nfl', athleteId: '3945274' } }, reference), false);
  assert.equal(validAthleteBoard({ ...board, athlete: { ...board.athlete, id: '3202' } }, reference), false);
  assert.equal(validAthleteBoard({ ...board, status: 'unavailable' }, reference), false, 'a board with a player is not unavailable');
  assert.equal(validAthleteBoard({ ...board, status: 'partial' }, reference), false);
  assert.equal(validAthleteBoard({ ...board, athlete: null, status: 'unavailable' }, reference), true);
  assert.equal(validAthleteBoard({ ...board, portraitsFromCdn: 'yes' }, reference), false);
  assert.equal(validAthleteBoard({ ...board, athlete: { ...board.athlete, links: [{ label: 'Bad', url: 'javascript:alert(1)' }] } }, reference), false);
  assert.equal(validAthleteBoard({ ...board, athlete: { ...board.athlete, statGroups: [] } }, reference), true);
  assert.equal(validAthleteBoard({ ...board, sources: [{ ok: true, url: 'a' }, { ok: false, url: 'b' }, { ok: false, url: 'c' }] }, reference), false);
  assert.equal(validAthleteBoard(null, reference), false);
});
