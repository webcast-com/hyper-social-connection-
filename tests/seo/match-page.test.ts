/**
 * The rules a fixture page is built from: what its own stored clips say about it,
 * what the page is allowed to claim from that, and how a stored event id becomes a
 * match URL at all.
 *
 * None of these touch a database, so they run under plain node:test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { SportsHighlightClip } from '../../src/lib/espn-highlights';
import { storedMatchReference } from '../../src/lib/espn-match';
import {
  matchBreadcrumbFor, matchPageDescription, matchPageFacts, matchPageTitle, sportsEventObjectFor,
} from '../../src/lib/match-page';

const clip = (over: Partial<SportsHighlightClip> = {}): SportsHighlightClip => ({
  id: '50476535', title: 'Perreault lights the lamp', description: null, duration: 48,
  thumbnail: 'https://espn.test/50476535.jpg', mp4: 'https://espn.test/50476535.mp4', hls: null,
  page: 'https://www.espn.com/video/clip/_/id/50476535', playable: true,
  eventId: 'espn-nhl-401892706', eventName: 'Vancouver Canucks vs New York Rangers',
  sport: 'ice-hockey', league: 'nhl', leagueName: 'National Hockey League',
  home: 'Vancouver Canucks', away: 'New York Rangers', homeLogo: null, awayLogo: null,
  startAt: '2026-11-14T02:00:00.000Z', status: 'final', ...over,
});

const ORIGIN = 'https://hyper.co.ke';

test('a stored event id names a match only when it is this site own namespaced form', () => {
  assert.deepEqual(storedMatchReference('nhl', 'espn-nhl-401892706'), { league: 'nhl', eventId: '401892706' });
  // A scoreboard reporting more than one competition appends to the id; the ESPN
  // event id is still the run of digits that follows the prefix.
  assert.deepEqual(storedMatchReference('nhl', 'espn-nhl-401892706-7'), { league: 'nhl', eventId: '401892706' });
  // A league slug with dashes of its own must still reverse cleanly.
  assert.deepEqual(storedMatchReference('league-one', 'espn-league-one-401880754'), { league: 'league-one', eventId: '401880754' });
});

test('anything that is not a namespaced id is refused rather than guessed at', () => {
  for (const [league, eventId] of [
    ['nhl', '401892706'],           // no prefix at all
    ['nhl', 'espn-nba-401892706'],  // namespaced for a different competition
    ['nhl', 'espn-nhl-'],           // no digits after the prefix
    ['nhl', 'espn-nhl-abc'],        // digits that are not digits
    ['nhl', 'not-namespaced'],
    ['', 'espn-nhl-401892706'],     // a URL needs both halves
    ['nhl', null as unknown as string],
    ['nhl', '   '],
  ]) {
    assert.equal(storedMatchReference(league, eventId), undefined, `${league}/${eventId}`);
  }
});

test('a fixture with no stored clips is not a fixture this site can describe', () => {
  assert.equal(matchPageFacts([]), null);
});

test('the fixture facts are the newest report of each fact, not the first row whole', () => {
  const facts = matchPageFacts([
    // Newest first, as the index returns them: this clip names no fixture.
    clip({ id: '2', eventName: null as unknown as string, startAt: '2026-11-14T03:00:00.000Z' }),
    // The older one does, so the fixture still gets named.
    clip({ id: '1' }),
  ]);
  assert.ok(facts);
  assert.equal(facts.eventName, 'Vancouver Canucks vs New York Rangers');
  assert.equal(facts.startAt, '2026-11-14T03:00:00.000Z', 'the newest reported instant wins');
  assert.equal(facts.clips, 2);
  assert.equal(facts.league, 'nhl');
});

test('a fixture the site holds clips for is titled by the fixture and its competition', () => {
  const facts = matchPageFacts([clip()]);
  assert.equal(matchPageTitle(facts, 'NHL'), 'Vancouver Canucks vs New York Rangers — National Hockey League highlights and match stats');
  // A fixture no clip names still says what competition it belongs to, which is the
  // catalog entry and therefore true.
  assert.equal(matchPageTitle(matchPageFacts([clip({ eventName: null as unknown as string })]), 'NHL'), 'NHL match details');
  assert.equal(matchPageTitle(null, 'NHL'), 'NHL match details');
});

test('the description counts what is stored and does not claim what was fetched', () => {
  const facts = matchPageFacts([clip()]);
  assert.equal(
    matchPageDescription(facts, 'NHL'),
    'Vancouver Canucks vs New York Rangers in the National Hockey League: 1 highlight clip stored from this fixture, plus ESPN-reported statistics, lineups and match events on Hyper.',
  );
  // The plural is honest at two, and a fixture with no clip named is described by
  // its competition alone.
  assert.ok(matchPageDescription(matchPageFacts([clip({ id: '1' }), clip({ id: '2' })]), 'NHL').includes('2 highlight clips stored'));
  assert.ok(matchPageDescription(matchPageFacts([clip({ eventName: null as unknown as string })]), 'NHL').startsWith('NHL: '));
  assert.equal(matchPageDescription(null, 'NHL'), 'ESPN-reported match statistics, lineups, player stats and match events on Hyper.');
});

test('SportsEvent is only claimed when the fixture, its start and both sides were reported', () => {
  const object = sportsEventObjectFor(matchPageFacts([clip()]), ORIGIN, '/sports/matches/nhl/401892706');
  assert.ok(object);
  assert.equal(object['@type'], 'SportsEvent');
  assert.equal(object.startDate, '2026-11-14T02:00:00.000Z');
  assert.deepEqual(object.competitor, [
    { '@type': 'SportsTeam', name: 'Vancouver Canucks' },
    { '@type': 'SportsTeam', name: 'New York Rangers' },
  ]);
  assert.equal(object.url, 'https://hyper.co.ke/sports/matches/nhl/401892706');
  // Missing any one of those and the page is still a real page — it simply does not
  // claim to be structured data.
  assert.equal(sportsEventObjectFor(matchPageFacts([clip({ away: null as unknown as string })]), ORIGIN, '/x'), null);
  assert.equal(sportsEventObjectFor(matchPageFacts([clip({ startAt: null as unknown as string })]), ORIGIN, '/x'), null);
  assert.equal(sportsEventObjectFor(matchPageFacts([clip({ eventName: null as unknown as string })]), ORIGIN, '/x'), null);
  assert.equal(sportsEventObjectFor(null, ORIGIN, '/x'), null);
});

test('the breadcrumb ends on the fixture and omits its own item, as schema.org asks', () => {
  const facts = matchPageFacts([clip()]);
  const trail = matchBreadcrumbFor(facts, ORIGIN, 'NHL', '/sports/matches/nhl/401892706');
  const items = trail.itemListElement as { position: number; name: string; item?: string }[];
  assert.deepEqual(items.map((entry) => entry.name), ['Home', 'Sports', 'National Hockey League', 'Vancouver Canucks vs New York Rangers']);
  assert.deepEqual(items.map((entry) => entry.position), [1, 2, 3, 4]);
  assert.equal(items[3].item, undefined);
  assert.equal(items[2].item, 'https://hyper.co.ke/sports?league=nhl');
  // With no stored fixture the trail still describes the page as a competition match,
  // because the competition is known from the catalog rather than from a clip.
  const bare = matchBreadcrumbFor(null, ORIGIN, 'NHL', '/sports/matches/nhl/401892706');
  assert.deepEqual((bare.itemListElement as { name: string }[]).map((entry) => entry.name), ['Home', 'Sports', 'NHL', 'NHL match']);
});
