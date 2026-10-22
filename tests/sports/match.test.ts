import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchHref, matchReference, parseMatchDetails, resolveMatch } from '../../src/lib/espn-match';
import { ESPN_LEAGUES } from '../../src/lib/sports-catalog';
import { parseEspnEvents } from '../../src/lib/espn';
import { mapOddsEvent, ODDS_LEAGUES } from '../../src/lib/espn-odds';
import { summaryFixture } from './match-fixture';
import { oddsEvent } from './odds-fixture';

const reference = { league: 'epl', eventId: '401234567' };
test('football summaries align teams/stats by ID, preserve true zero and keep unknown values missing', () => {
  const match = parseMatchDetails(summaryFixture(), reference);
  assert.equal(match.teams[0].side, 'away');
  assert.equal(match.teams[1].score, '0');
  assert.equal(match.statistics[0].values.find((row) => row.teamId === '100')?.value, '0');
  assert.equal(match.statistics[1].values.find((row) => row.teamId === '200'), undefined);
  assert.equal(match.venue, 'Review Match Stadium');
  assert.equal(match.kickoff, '2026-10-23T18:00:00.000Z');
});
test('reported formation, starters, non-starters and unknown status remain distinct', () => {
  const match = parseMatchDetails(summaryFixture(), reference);
  assert.equal(match.lineups[0].formation, '4-3-3');
  assert.deepEqual(match.lineups[0].players.map((person) => person.starter), [true, false, null]);
  assert.equal(match.lineups[0].players[1].didNotPlay, true);
  assert.equal(match.lineups[0].players[0].position, 'FW');
});
test('basketball boxscores provide player stats and reported starters without fabricated formations', () => {
  const match = parseMatchDetails(summaryFixture('basketball'), { ...reference, league: 'nba' });
  assert.equal(match.playerStats[0].players[0].values[1], '0');
  assert.equal(match.playerStats[0].players[1].values[8], null);
  assert.equal(match.lineups[0].formation, null);
  assert.equal(match.lineups[0].players[0].starter, true);
  assert.equal(match.updatesLabel, 'Play by play');
  assert.equal(match.updates[0].clock, '11:20');
});
test('nested boxscore team player blocks are supported as well as root player blocks', () => {
  const fixture = summaryFixture('basketball');
  const nested = { ...fixture, boxscore: { teams: fixture.boxscore.teams.map((team) => ({ ...team, players: [fixture.boxscore.players[0]] })) } };
  const match = parseMatchDetails(nested, { ...reference, league: 'nba' });
  assert.ok(match.playerStats.length > 0);
  assert.equal(match.playerStats[0].players[0].name, 'Reported Starter');
});
test('key-event updates are deduplicated without blending conflicting event clocks', () => {
  const match = parseMatchDetails(summaryFixture(), reference);
  assert.equal(match.updatesLabel, 'Key events');
  assert.equal(match.updates.length, 2);
  assert.equal(match.updates[0].team, 'Very Long International Away Club Name');
  assert.ok(!match.updates.some((row) => row.text.includes('basket')));
});
test('scheduled summaries do not invent stats, players or match events', () => {
  const base = summaryFixture();
  const sparse = { header: base.header };
  const match = parseMatchDetails(sparse, reference);
  assert.deepEqual(match.statistics, []); assert.deepEqual(match.lineups, []);
  assert.deepEqual(match.playerStats, []); assert.deepEqual(match.updates, []);
  assert.equal(match.venue, null);
});
test('invalid, mismatched and reference-only summaries are failures rather than synthetic details', () => {
  for (const payload of [null, {}, { header: { id: 'wrong' } }, { header: { id: reference.eventId, competitions: [{ competitors: [{ team: { $ref: 'http://private.test' } }] }] } }]) {
    assert.throws(() => parseMatchDetails(payload, reference), /Invalid ESPN summary/);
  }
});
test('all six team sports use trusted Site v2 summary routes and numeric event IDs only', () => {
  const seen = new Set<string>();
  for (const league of ESPN_LEAGUES.filter((item) => item.kind !== 'motorsport')) {
    const resolved = resolveMatch(league.slug, reference.eventId);
    assert.equal(resolved.url, `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.league}/summary?event=401234567`);
    seen.add(league.kind);
  }
  assert.equal(seen.size, 6);
  for (const id of ['../secret', '123?bad=1', 'http://private', '0', 'NaN', '1'.repeat(21)]) assert.throws(() => resolveMatch('epl', id), /Invalid ESPN event/);
  assert.throws(() => resolveMatch('unknown', reference.eventId), /Unknown/);
  assert.throws(() => resolveMatch('f1', reference.eventId), /Unknown/);
  assert.equal(matchReference('epl', 'demo-event'), undefined);
  assert.equal(matchHref(reference), '/sports/matches/epl/401234567');
});
test('score and odds parsing attach stable real-event references, never a demo/race reference', () => {
  const source = summaryFixture();
  const event = { id: reference.eventId, competitions: source.header.competitions };
  const meta = ESPN_LEAGUES.find((item) => item.slug === 'epl')!;
  assert.deepEqual(parseEspnEvents({ events: [event] }, meta)[0].details, reference);
  const row = oddsEvent(reference.eventId);
  assert.deepEqual(mapOddsEvent(row, ODDS_LEAGUES.find((item) => item.slug === 'epl')!)?.details, reference);
  assert.equal(parseEspnEvents({ events: [{ ...event, id: 'demo' }] }, meta)[0].details, undefined);
});

test('reported event participants are named without dereferencing athlete references or inventing scorers', () => {
  const fixture = summaryFixture();
  const payload = { ...fixture, keyEvents: [{ type: { text: 'Goal' }, participants: [{ athlete: { displayName: 'Reported Scorer' } }, { athlete: { $ref: 'http://private.test' } }], athletesInvolved: [{ displayName: 'Reported Scorer' }] }] };
  const match = parseMatchDetails(payload, reference);
  assert.deepEqual(match.updates[0].participants, ['Reported Scorer']);
  assert.equal(match.updates[0].text, 'Goal');
  assert.equal(match.updates[0].clock, null);
});
