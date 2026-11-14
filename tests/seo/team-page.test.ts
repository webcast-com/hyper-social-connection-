/**
 * The rules a team page is built from: what the clips this site already stores say
 * about one team, and what the page is allowed to claim from that.
 *
 * The reason these rules exist at all is that a team page is addressed by a numeric
 * ESPN id and this site stores no team table — so the only server-side way to name
 * the team, and to say anything true about it, is the stored clips that mention it.
 * Everything here is pure, so it runs under plain node:test without a database.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { SportsHighlightClip } from '../../src/lib/espn-highlights';
import {
  MAX_NAMED_OPPONENTS, teamBreadcrumbFor, teamPageDescription, teamPageFacts, teamPageTitle,
} from '../../src/lib/team-page';

const TEAM_ID = '4993';
const RIVAL_ID = '4994';

const clip = (over: Partial<SportsHighlightClip> = {}): SportsHighlightClip => ({
  id: '50476535', title: 'Perreault lights the lamp', description: null, duration: 48,
  thumbnail: 'https://espn.test/50476535.jpg', mp4: 'https://espn.test/50476535.mp4', hls: null,
  page: 'https://www.espn.com/video/clip/_/id/50476535', playable: true,
  eventId: 'espn-nhl-401892706', eventName: 'Vancouver Canucks vs New York Rangers',
  sport: 'ice-hockey', league: 'nhl', leagueName: 'National Hockey League',
  home: 'Vancouver Canucks', away: 'New York Rangers', homeLogo: null, awayLogo: null,
  startAt: '2026-11-14T02:00:00.000Z', status: 'final',
  homeId: TEAM_ID, awayId: RIVAL_ID, ...over,
});

const ORIGIN = 'https://hyper.co.ke';

test('a team with no stored clips has no facts, so the page stays the shell it was', () => {
  assert.equal(teamPageFacts([], TEAM_ID, 'Vancouver Canucks'), null);
});

test('clips without a name are not enough: a page that cannot name its team is not worth crawling', () => {
  const clips = [clip()];
  // The name comes from the stored rows, and when they do not yield one there is
  // nothing to say — however many clips sit behind the page.
  assert.equal(teamPageFacts(clips, TEAM_ID, null), null);
  assert.equal(teamPageFacts(clips, TEAM_ID, ''), null);
  assert.equal(teamPageFacts(clips, TEAM_ID, '   '), null);
});

test('a malformed team id yields no facts rather than matching by accident', () => {
  for (const bad of ['abc', '0', '-5', '1.5', '1e3', '0x10', '12abc', '']) {
    assert.equal(teamPageFacts([clip()], bad, 'Vancouver Canucks'), null, `id ${JSON.stringify(bad)} must not resolve`);
  }
  // A padded id is normalised, not rejected: `entityIdFrom` trims, the same way the
  // leaders parser reads a provider id, so two readers cannot disagree about what
  // one id is. (The page never sees one anyway — `resolveTeam` gates the URL with
  // the stricter `validEntityId` and 404s a padded segment first.)
  assert.equal(teamPageFacts([clip()], ' 4993 ', 'Vancouver Canucks')?.teamName, 'Vancouver Canucks');
  // A number is accepted too, because ESPN sends some ids as numbers.
  assert.equal(teamPageFacts([clip()], 4993 as unknown as string, 'Vancouver Canucks')?.teamName, 'Vancouver Canucks');
  assert.equal(teamPageFacts([clip()], 4993.5 as unknown as string, 'Vancouver Canucks'), null);
});

test('the opponent is whichever side is NOT this team, home or away', () => {
  const asHome = teamPageFacts([clip()], TEAM_ID, 'Vancouver Canucks');
  assert.deepEqual(asHome?.opponents, ['New York Rangers']);

  // Same team, same fixture, but stored as the away side. Guessing "the home side
  // is always us" would name the wrong opponent for every away fixture.
  const asAway = teamPageFacts([clip({ home: 'New York Rangers', away: 'Vancouver Canucks', homeId: RIVAL_ID, awayId: TEAM_ID })], TEAM_ID, 'Vancouver Canucks');
  assert.deepEqual(asAway?.opponents, ['New York Rangers']);
});

test('a clip that reports no team id is skipped, never guessed at', () => {
  const facts = teamPageFacts(
    [clip({ homeId: null, awayId: null, eventName: 'Unattributed fixture' }), clip()],
    TEAM_ID, 'Vancouver Canucks',
  );
  // Only the clip that actually names this team contributes an opponent.
  assert.deepEqual(facts?.opponents, ['New York Rangers']);
  // The count is still every clip the reader was given: the page lists them.
  assert.equal(facts?.clips, 2);
});

test('opponents are deduplicated, newest first, and capped', () => {
  const many = Array.from({ length: MAX_NAMED_OPPONENTS + 4 }, (_, index) => clip({
    id: `clip-${index}`,
    away: `Rival ${index}`,
    awayId: String(5000 + index),
  }));
  const facts = teamPageFacts([...many, many[0]], TEAM_ID, 'Vancouver Canucks');
  assert.equal(facts?.opponents.length, MAX_NAMED_OPPONENTS, 'bounded so the copy cannot grow without limit');
  assert.deepEqual(facts?.opponents, ['Rival 0', 'Rival 1', 'Rival 2', 'Rival 3', 'Rival 4', 'Rival 5']);
  assert.equal(new Set(facts?.opponents).size, facts?.opponents.length, 'a repeat fixture names its opponent once');
});

test('the facts carry the competition as stored, so the page never re-derives it from the URL', () => {
  const facts = teamPageFacts([clip()], TEAM_ID, 'Vancouver Canucks');
  assert.equal(facts?.leagueName, 'National Hockey League');
  assert.equal(facts?.league, 'nhl');
  assert.equal(facts?.sport, 'ice-hockey');
  assert.equal(facts?.teamName, 'Vancouver Canucks');
});

test('the title names the team and its competition, and falls back to the shell title without facts', () => {
  const facts = teamPageFacts([clip()], TEAM_ID, 'Vancouver Canucks');
  assert.equal(teamPageTitle(facts, 'NHL'), 'Vancouver Canucks — National Hockey League highlights, record and squad');
  assert.equal(teamPageTitle(null, 'NHL'), 'NHL team details');
  // When the catalog name is already the stored one, saying it twice reads as filler.
  assert.equal(teamPageTitle(teamPageFacts([clip()], TEAM_ID, 'Vancouver Canucks'), 'National Hockey League'),
    'Vancouver Canucks — highlights, record and squad');
});

test('the description claims a count and opponents, and never a score, result or date', () => {
  const facts = teamPageFacts([clip()], TEAM_ID, 'Vancouver Canucks');
  assert.equal(
    teamPageDescription(facts, 'NHL'),
    'Vancouver Canucks in the National Hockey League: 1 highlight clip stored from fixtures involving this team, against New York Rangers, plus the ESPN-reported record, fixtures and squad on Hyper.',
  );
  const copy = teamPageDescription(teamPageFacts([clip(), clip({ id: 'b', away: 'Boston Bruins', awayId: '7' })], TEAM_ID, 'Vancouver Canucks'), 'NHL');
  assert.match(copy, /2 highlight clips stored/);
  // A stored clip proves a fixture happened and that highlights exist for it. It
  // does not prove who won, by how much, or to a reader-facing date — and a
  // description that said so would be inventing a result.
  for (const forbidden of ['won', 'beat', 'defeated', 'lost', 'victory', '2026', 'November']) {
    assert.equal(copy.toLowerCase().includes(forbidden.toLowerCase()), false, `must not claim ${forbidden}`);
  }
  assert.equal(teamPageDescription(null, 'NHL'), 'ESPN-reported record, fixtures and squad for this NHL team on Hyper.');
});

test('the breadcrumb is four crumbs and the last one carries no item', () => {
  const facts = teamPageFacts([clip()], TEAM_ID, 'Vancouver Canucks');
  const trail = teamBreadcrumbFor(facts, ORIGIN, 'NHL');
  assert.equal(trail['@type'], 'BreadcrumbList');
  const items = trail.itemListElement as Array<Record<string, unknown>>;
  assert.equal(items.length, 4);
  assert.deepEqual(items.map((entry) => entry.name), ['Home', 'Sports', 'National Hockey League', 'Vancouver Canucks']);
  assert.equal(items[0].item, `${ORIGIN}/`);
  assert.equal(items[2].item, `${ORIGIN}/sports?league=nhl`);
  assert.equal('item' in items[3], false, 'schema.org wants the current page without an item');
  // Without facts the trail still resolves, naming the competition instead.
  const bare = teamBreadcrumbFor(null, ORIGIN, 'NHL').itemListElement as Array<Record<string, unknown>>;
  assert.deepEqual(bare.map((entry) => entry.name), ['Home', 'Sports', 'NHL', 'NHL team']);
  assert.equal(bare[2].item, `${ORIGIN}/sports`);
});
