import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DASHBOARD_BOARDS, LEAGUE_ACCENTS, SCORE_CARD_SPORTS,
  broadcastLabel, dashboardMatchHref, kickoffLabel, leagueAccent,
  scoreCardClock, scoreCardLabel, scoreCardTarget, scoreCell, usesScoreCard,
} from '../../src/lib/score-card';
import { parseEspnEvents } from '../../src/lib/espn';
import { ESPN_LEAGUES } from '../../src/lib/sports-catalog';
import type { SportsEvent } from '../../src/lib/sports';
import { mountScoreCard } from './score-card-mount';

/**
 * The dashboard's score card, as the feed draws basketball and American football
 * fixtures.
 *
 * Two things here are load-bearing beyond the layout. A card may only link to a
 * match page that can answer for that fixture — the dashboard's own page for a
 * league it serves, this app's page otherwise, the board for a sample fixture —
 * because a card that looks clickable and lands nowhere teaches a reader not to
 * click. And a fixture this site invented may never wear a live clock: the card
 * is the most score-shaped thing in the feed, so it is the easiest place for a
 * sample to be mistaken for a game in progress.
 */

const event = (over: Partial<SportsEvent> = {}): SportsEvent => ({
  id: 'espn-nba-401584798',
  source: 'espn',
  sourceId: '401584798',
  details: { league: 'nba', eventId: '401584798' },
  sport: 'basketball',
  league: 'nba',
  leagueName: 'NBA',
  status: 'upcoming',
  startAt: '2026-11-10T19:30:00.000Z',
  venue: 'Crypto.com Arena',
  broadcast: null,
  home: { name: 'Los Angeles Lakers', short: 'LAL', score: null, logo: null },
  away: { name: 'Boston Celtics', short: 'BOS', score: null, logo: null },
  ...over,
});

const nfl = (over: Partial<SportsEvent> = {}): SportsEvent => event({
  id: 'espn-nfl-401584800', sourceId: '401584800',
  details: { league: 'nfl', eventId: '401584800' },
  sport: 'american-football', league: 'nfl', leagueName: 'NFL',
  venue: 'Arrowhead Stadium',
  home: { name: 'Kansas City Chiefs', short: 'KC', score: null, logo: null },
  away: { name: 'Buffalo Bills', short: 'BUF', score: null, logo: null },
  ...over,
});

test('the score card is for basketball and American football, and never for a race', () => {
  assert.deepEqual([...SCORE_CARD_SPORTS], ['basketball', 'american-football']);
  assert.equal(usesScoreCard(event()), true, 'an NBA fixture is drawn as the score card');
  assert.equal(usesScoreCard(nfl()), true, 'an NFL fixture is drawn as the score card');
  assert.equal(usesScoreCard(event({ sport: 'football', league: 'epl', leagueName: 'Premier League', details: { league: 'epl', eventId: '1' } })), false, 'football keeps the feed\'s own card');
  assert.equal(usesScoreCard(event({
    sport: 'motorsport', league: 'f1', leagueName: 'Formula 1', details: undefined,
    race: { title: 'Italian Grand Prix', entries: [] },
  })), false, 'a race has no two sides to put either side of a V/S');
});

test('each league links to the board that serves it, and the flagship needs no competition', () => {
  assert.equal(dashboardMatchHref(event()), '/nfl-basketball/basketball/match/401584798');
  assert.equal(dashboardMatchHref(nfl()), '/nfl-basketball/nfl/match/401584800');
  for (const [league, id] of [['wnba', '401584801'], ['ncaam', '401584802'], ['ncaaw', '401584803']] as const) {
    assert.equal(
      dashboardMatchHref(event({ league, details: { league, eventId: id }, sourceId: id })),
      `/nfl-basketball/basketball/match/${id}?competition=${league}`,
      `${league} is not the basketball board's flagship, so the commentary has to be told which feed to ask`,
    );
  }
});

test('a card links to a dashboard match page only for a fixture that has one', () => {
  assert.equal(dashboardMatchHref(event({ source: 'demo' })), null, 'a sample fixture has no match page anywhere');
  assert.equal(dashboardMatchHref(event({ details: undefined })), null, 'a fixture ESPN reported no id for cannot be addressed');
  assert.equal(dashboardMatchHref(event({ details: { league: 'nba', eventId: 'not-an-id' } })), null, 'only a numeric ESPN id may be linked');
  assert.equal(dashboardMatchHref(event({ details: { league: 'nba', eventId: '0' } })), null, 'a zero id is not an event');
  assert.equal(dashboardMatchHref(event({ league: 'euroleague', leagueName: 'EuroLeague', details: { league: 'euroleague', eventId: '401584804' } })), null, 'a competition the dashboard does not serve would ask the wrong feed');
  assert.equal(dashboardMatchHref(event({ sport: 'football', league: 'epl', leagueName: 'Premier League', details: { league: 'epl', eventId: '1' } })), null, 'football is not a score-card sport');
});

test('the card falls back rather than leaving a reader with a dead click', () => {
  assert.equal(scoreCardTarget(event()), '/nfl-basketball/basketball/match/401584798');
  assert.equal(
    scoreCardTarget(event({ league: 'euroleague', leagueName: 'EuroLeague', details: { league: 'euroleague', eventId: '401584804' } })),
    '/sports/matches/euroleague/401584804',
    'a league the dashboard does not serve still has this app\'s own match page',
  );
  assert.equal(scoreCardTarget(event({ source: 'demo', details: undefined })), '/sports', 'a sample fixture goes to the board');
  assert.equal(scoreCardLabel(event()), 'Match commentary: Los Angeles Lakers v Boston Celtics');
});

test('every basketball and American football league in the catalog has somewhere to send a reader', () => {
  const leagues = ESPN_LEAGUES.filter((league) => SCORE_CARD_SPORTS.includes(league.kind));
  assert.ok(leagues.length >= 5, `the board covers these sports: ${leagues.map((league) => league.slug).join(', ')}`);
  for (const league of leagues) {
    const fixture = event({ sport: league.kind, league: league.slug, leagueName: league.name, details: { league: league.slug, eventId: '401584805' } });
    const served = Object.hasOwn(DASHBOARD_BOARDS, league.slug);
    assert.equal(dashboardMatchHref(fixture) !== null, served, `${league.slug}: a dashboard link exactly when the dashboard serves it`);
    assert.notEqual(scoreCardTarget(fixture), '/sports', `${league.slug}: an ESPN-reported fixture must not be a dead click`);
  }
  const catalog = new Set(leagues.map((league) => league.slug));
  for (const key of Object.keys(DASHBOARD_BOARDS)) assert.ok(catalog.has(key), `${key} is a board for a league this app does not report`);
});

test('the clock reads the provider, and a finished fixture reads Final', () => {
  assert.deepEqual(scoreCardClock(event({ status: 'live', detail: 'Q3 4:32' })), { label: 'Q3 4:32', tone: 'live' });
  assert.deepEqual(scoreCardClock(nfl({ status: 'live', detail: '3rd · 08:41' })), { label: '3rd · 08:41', tone: 'live' });
  assert.deepEqual(scoreCardClock(event({ status: 'live', detail: null })), { label: 'Live', tone: 'live' }, 'in play with no clock reported still says live');
  assert.deepEqual(scoreCardClock(event({ status: 'live', detail: '   ' })), { label: 'Live', tone: 'live' });
  assert.deepEqual(scoreCardClock(event({ status: 'final', detail: 'Final/OT' })), { label: 'Final', tone: 'final' }, 'the dashboard card says Final, whatever the provider called it');
  assert.equal(scoreCardClock(event({ startAt: '2026-11-10T19:30:00.000Z' }), { now: new Date('2026-11-10T09:00:00Z'), timeZone: 'UTC' }).tone, 'soon');
});

test('a fixture this site invented never wears a live clock', () => {
  const invented = event({ source: 'demo', status: 'live', detail: 'Q3 4:52', home: { name: 'Los Angeles Lakers', short: 'LAL', score: 78 }, away: { name: 'Boston Celtics', short: 'BOS', score: 74 } });
  const clock = scoreCardClock(invented, { now: new Date('2026-11-10T09:00:00Z'), timeZone: 'UTC' });
  assert.equal(clock.tone, 'soon', 'a sample fixture is not in play, whatever status it was invented with');
  assert.notEqual(clock.label, 'Q3 4:52', 'the invented clock is not shown');
  assert.equal(clock.label, 'Today · 19:30', 'it shows its kickoff like any other fixture still to come');
  assert.equal(scoreCardClock(event({ source: 'demo', status: 'final', detail: 'Final' })).tone, 'soon', 'nor is a sample a result');
});

test('a kickoff is read in the viewer\'s own zone, and a missing one is TBD', () => {
  const now = new Date('2026-11-10T09:00:00Z');
  const at = (iso: string | null | undefined) => kickoffLabel(iso, { now, timeZone: 'UTC' });
  assert.equal(at('2026-11-10T19:30:00.000Z'), 'Today · 19:30');
  assert.equal(at('2026-11-11T20:00:00.000Z'), 'Tomorrow · 20:00');
  assert.equal(at('2026-11-09T18:00:00.000Z'), 'Yesterday · 18:00');
  const later = at('2026-11-19T18:00:00.000Z');
  assert.match(later, /· 18:00$/, 'a fixture further out carries its date');
  assert.ok(!/^(Today|Tomorrow|Yesterday)/.test(later), later);
  assert.match(later, /\b19\b/, 'the day of the month is in the label');
  assert.equal(at(null), 'TBD');
  assert.equal(at(''), 'TBD');
  assert.equal(at('not-a-date'), 'TBD');
  assert.equal(kickoffLabel('2026-11-10T19:30:00.000Z', { now, timeZone: 'Africa/Nairobi' }), 'Today · 22:30', 'the same kickoff reads differently in another zone');
});

test('a broadcaster is what the provider named, and never a guess', () => {
  assert.equal(broadcastLabel(event({ broadcast: 'TNT' })), 'TNT');
  assert.equal(broadcastLabel(event({ broadcast: '  ESPN  ' })), 'ESPN');
  assert.equal(broadcastLabel(event({ broadcast: null })), 'TV TBD');
  assert.equal(broadcastLabel(event({ broadcast: undefined })), 'TV TBD');
  assert.equal(broadcastLabel(event({ broadcast: '' })), 'TV TBD');
  assert.equal(broadcastLabel(event({ broadcast: '—' })), 'TV TBD', 'the dashboard\'s own placeholder means nothing was named');
});

test('a score is what was reported, and zero is a score', () => {
  assert.equal(scoreCell(78), 78);
  assert.equal(scoreCell(0), 0, 'nil is a score, not an absent one');
  assert.equal(scoreCell(null), '—');
  assert.equal(scoreCell(undefined), '—');
});

test('the chip colours are the dashboard catalog\'s, and an unmapped league falls back', () => {
  assert.deepEqual({ ...LEAGUE_ACCENTS }, { nba: '#1d428a', wnba: '#e8590c', ncaam: '#0f4c9c', ncaaw: '#0e7490' });
  assert.equal(leagueAccent('nba'), '#1d428a');
  assert.equal(leagueAccent('nfl'), null, 'the NFL has no colour in that catalog, so the chip uses its own accent');
  assert.equal(leagueAccent('epl'), null);
});

test('a scoreboard\'s broadcaster is parsed the way the dashboard reads it', () => {
  const nba = ESPN_LEAGUES.find((league) => league.slug === 'nba')!;
  const parse = (competition: Record<string, unknown>) =>
    parseEspnEvents({ events: [{ id: '401584798', competitions: [{ id: 'c', date: '2026-11-10T19:30:00Z', competitors: [
      { homeAway: 'home', team: { displayName: 'Los Angeles Lakers', abbreviation: 'LAL' } },
      { homeAway: 'away', team: { displayName: 'Boston Celtics', abbreviation: 'BOS' } },
    ], ...competition }] }] }, nba)[0];

  assert.equal(parse({ broadcasts: [{ names: ['TNT', 'NBA TV'] }] }).broadcast, 'TNT', 'the first named broadcaster');
  assert.equal(parse({ broadcasts: [{ names: [] }, { names: ['Sky Sports'] }] }).broadcast, 'Sky Sports', 'an empty entry does not hide the next');
  assert.equal(parse({ broadcasts: [], media: { shortName: 'ESPN+' } }).broadcast, 'ESPN+', 'the media short name is the fallback');
  assert.equal(parse({ media: { shortName: ['SuperSport', 'Other'] } }).broadcast, 'SuperSport');
  assert.equal(parse({}).broadcast, null, 'nothing named stays null rather than becoming a guess');
  assert.equal(parse({ broadcasts: [{ names: ['   '] }] }).broadcast, null, 'a blank name is not a broadcaster');
  assert.equal(parse({ broadcasts: 'not-a-list' }).broadcast, null, 'a malformed field is not a failure');
});

test('the mounted card reads home first, with both scores, crests and the broadcaster', async () => {
  const mount = await mountScoreCard(nfl({
    status: 'live', detail: '3rd · 08:41', broadcast: null,
    home: { name: 'Kansas City Chiefs', short: 'KC', score: 24, logo: null },
    away: { name: 'Buffalo Bills', short: 'BUF', score: 20, logo: null },
  }));
  assert.ok(mount.card, 'the card renders');
  assert.deepEqual(mount.rows, [
    { name: 'Kansas City Chiefs', score: '24' },
    { name: 'Buffalo Bills', score: '20' },
  ], 'home first, as on the dashboard this card comes from');
  assert.deepEqual(mount.clock, { label: '3rd · 08:41', tone: 'live' });
  assert.deepEqual(mount.crests, ['KC', 'BUF'], 'no logo reported means the code on a crest');
  assert.deepEqual(mount.logos, []);
  assert.equal(mount.broadcast, 'TV TBD');
  assert.equal(mount.competition, 'NFL');
  assert.match(mount.text, /V\/S/);
  await mount.unmount();
});

test('the mounted card shows reported logos, and an upcoming fixture has no score yet', async () => {
  const mount = await mountScoreCard(event({
    status: 'upcoming', broadcast: 'TNT',
    home: { name: 'Los Angeles Lakers', short: 'LAL', score: null, logo: 'https://a.espncdn.com/i/teamlogos/nba/500/lal.png' },
    away: { name: 'Boston Celtics', short: 'BOS', score: null, logo: 'https://a.espncdn.com/i/teamlogos/nba/500/bos.png' },
  }));
  assert.deepEqual(mount.logos, [
    'https://a.espncdn.com/i/teamlogos/nba/500/lal.png',
    'https://a.espncdn.com/i/teamlogos/nba/500/bos.png',
  ], 'home logo first');
  assert.deepEqual(mount.crests, [], 'a logo replaces the crest');
  assert.deepEqual(mount.rows.map((row) => row.score), ['—', '—'], 'a fixture that has not started has no score, and none is invented');
  assert.equal(mount.broadcast, 'TNT');
  assert.equal(mount.competition, 'NBA');
  assert.equal(mount.clock.tone, 'soon');
  await mount.unmount();
});

test('a logo that does not load falls back to the code rather than a broken image', async () => {
  const mount = await mountScoreCard(event({
    home: { name: 'Los Angeles Lakers', short: 'LAL', score: null, logo: 'https://a.espncdn.com/gone.png' },
    away: { name: 'Boston Celtics', short: 'BOS', score: null, logo: 'https://a.espncdn.com/i/teamlogos/nba/500/bos.png' },
  }));
  assert.deepEqual(mount.logos.length, 2);
  await mount.failLogo(0);
  const after = mount.read();
  assert.deepEqual(after.logos, ['https://a.espncdn.com/i/teamlogos/nba/500/bos.png'], 'only the failed logo is dropped');
  assert.deepEqual(after.crests, ['LAL'], 'its code takes its place');
  await mount.unmount();
});

test('a mounted sample fixture shows scores but never claims to be live', async () => {
  const mount = await mountScoreCard(event({
    source: 'demo', status: 'live', detail: 'Q3 4:52', leagueName: 'NBA',
    home: { name: 'Los Angeles Lakers', short: 'LAL', score: 78, logo: null },
    away: { name: 'Boston Celtics', short: 'BOS', score: 74, logo: null },
  }));
  assert.equal(mount.clock.tone, 'soon', 'not the live tone');
  assert.ok(!mount.clock.label.includes('Q3'), `the invented clock is not shown: ${mount.clock.label}`);
  assert.deepEqual(mount.rows.map((row) => row.score), ['78', '74'], 'the scores it was given are still shown');
  await mount.unmount();
});

test('a mounted finished fixture reads Final, in the neutral tone', async () => {
  const mount = await mountScoreCard(event({
    status: 'final', detail: 'Final/OT',
    home: { name: 'Los Angeles Lakers', short: 'LAL', score: 112, logo: null },
    away: { name: 'Boston Celtics', short: 'BOS', score: 108, logo: null },
  }));
  assert.deepEqual(mount.clock, { label: 'Final', tone: 'final' });
  assert.deepEqual(mount.rows.map((row) => row.score), ['112', '108']);
  await mount.unmount();
});
