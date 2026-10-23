import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESPN_LEAGUES } from '../../src/lib/sports-catalog';
import { INSIGHT_KINDS, insightUrls, parseInsight, isInsightsBoard } from '../../src/lib/espn-insights';
import { parseMatchDetails } from '../../src/lib/espn-match';
import { insightSummary, insightPayload, insightsBoard } from './insights-fixture';
const match = parseMatchDetails(insightSummary(), { league: 'epl', eventId: '401234567' });
test('all five catalog paths use trusted competition IDs, not event-ID substitution', () => {
  const urls = insightUrls(match);
  assert.equal(urls.predictions, 'https://sports.core.api.espn.com/v3/sports/soccer/eng.1/predictions?eventId=401234567&limit=50');
  for (const kind of INSIGHT_KINDS.slice(1)) assert.match(urls[kind]!, /\/events\/401234567\/competitions\/401111111\//);
  for (const meta of ESPN_LEAGUES.filter((league) => league.kind !== 'motorsport')) {
    const url = insightUrls({ ...match, reference: { league: meta.slug, eventId: '1' } }).predictor!;
    assert.equal(url, `https://sports.core.api.espn.com/v2/sports/${meta.sport}/leagues/${meta.league}/events/1/competitions/401111111/predictor`);
  }
  assert.deepEqual(Object.values(insightUrls({ ...match, competitionId: null })).slice(1), [null, null, null, null]);
  assert.deepEqual(Object.values(insightUrls({ ...match, competitionId: '../bad' })).slice(1), [null, null, null, null]);
  assert.throws(() => insightUrls({ ...match, reference: { league: 'f1', eventId: '1' } }));
});
test('each adapter returns separately labeled data; zero is retained and no complementary chances are inferred', () => {
  for (const kind of INSIGHT_KINDS) assert.equal(parseInsight(kind, insightPayload(kind), match).status, 'ready');
  const projection = parseInsight('predictor', { homeTeam: { team: { id: '100' }, gameProjection: 0 } }, match);
  assert.deepEqual(projection.values, [{ label: match.teams.find((t) => t.id === '100')!.name, value: '0%', teamId: '100' }]);
  assert.equal(parseInsight('probabilities', insightPayload('probabilities'), match).values[0].value, '72%');
  assert.equal(parseInsight('predictor', insightPayload('predictor'), match).values[0].value, '63.4%');
  assert.equal(parseInsight('odds', insightPayload('odds'), match).values.find((v) => v.label.includes('Spread'))?.value, '0');
});
test('bad scales, impossible sums and mismatched identities are rejected', () => {
  assert.throws(() => parseInsight('probabilities', { homeWinPercentage: 72 }, match));
  assert.throws(() => parseInsight('probabilities', { homeWinPercentage: 0.8, awayWinPercentage: 0.9 }, match));
  assert.throws(() => parseInsight('predictor', { homeTeam: { team: { id: '100' }, gameProjection: 101 } }, match));
  assert.throws(() => parseInsight('predictor', { homeTeam: { team: { id: '999' }, gameProjection: 40 } }, match));
  assert.throws(() => parseInsight('odds', { eventId: '99' }, match));
  assert.throws(() => parseInsight('predictor', { league: { slug: 'nba' } }, match));
  assert.throws(() => parseInsight('powerindex', { competitionId: '99' }, match));
  assert.throws(() => parseInsight('probabilities', { homeTeam: { id: '999' }, homeWinPercentage: 0.5 }, match));
});
test('league predictions require one explicit matching event, regardless of URL filters', () => {
  const other = parseInsight('predictions', { items: [{ eventId: '99', ...insightPayload('predictor') as object }] }, match);
  assert.equal(other.status, 'empty'); assert.deepEqual(other.values, []);
  assert.equal(parseInsight('predictions', insightPayload('predictor'), match).status, 'unsupported');
  const duplicate = { eventId: match.reference.eventId, predictor: insightPayload('predictor') };
  assert.equal(parseInsight('predictions', { items: [duplicate, duplicate] }, match).status, 'unsupported');
});
test('play snapshots use explicit timestamps, not provider array order; absent scales/refs are unsupported', () => {
  const result = parseInsight('probabilities', { count: 20, items: [
    { homeWinPercentage: 0.8, lastModified: '2026-10-23T18:20:00Z' },
    { homeWinPercentage: 0.2, lastModified: '2026-10-23T18:10:00Z' },
  ] }, match);
  assert.equal(result.values[0].value, '80%'); assert.equal(result.truncated, true);
  assert.equal(parseInsight('probabilities', { items: [{ homeWinPercentage: 0.8 }, { homeWinPercentage: 0.2 }] }, match).status, 'unsupported');
  for (const kind of INSIGHT_KINDS) {
    assert.equal(parseInsight(kind, { items: [{ $ref: 'https://attacker.test' }] }, match).status, 'unsupported');
    assert.equal(parseInsight(kind, { items: [] }, match).status, 'empty');
    assert.equal(parseInsight(kind, {}, match).status, 'unsupported');
  }
});
test('power metrics require named match teams and stay bounded; bookmaker rows are not mixed', () => {
  assert.equal(parseInsight('powerindex', { teams: [{ team: { id: '999' }, stats: [{ name: 'rating', value: 80 }] }] }, match).status, 'unsupported');
  const ratings = parseInsight('powerindex', { teams: [100, 200].map((id) => ({ team: { id: String(id) }, stats: Array.from({ length: 40 }, (_, i) => ({ name: `stat-${i}`, value: i })) })) }, match);
  assert.equal(ratings.values.length, 40);
  const odds = parseInsight('odds', { items: [{ provider: { name: 'First' }, homeTeamOdds: { moneyLine: -110 } }, { provider: { name: 'Second' }, awayTeamOdds: { moneyLine: 130 } }] }, match);
  assert.equal(odds.values.length, 1); assert.match(odds.values[0].label, /First/);
});
test('client guard validates ordered sections, reference and nested renderable values/links', () => {
  const board = insightsBoard(); assert.equal(isInsightsBoard(board, match.reference), true);
  assert.equal(isInsightsBoard(board, { ...match.reference, eventId: '2' }), false);
  assert.equal(isInsightsBoard({ ...board, sections: board.sections.slice(1) }, match.reference), false);
  const bad = structuredClone(board); bad.sections[0].url = 'javascript:alert(1)'; assert.equal(isInsightsBoard(bad, match.reference), false);
  const wrong = structuredClone(board); (wrong.sections[0].values[0] as unknown as { value: unknown }).value = {}; assert.equal(isInsightsBoard(wrong, match.reference), false);
});
