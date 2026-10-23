import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTeamSchedule, historyOutcome, recentGames, isMatchHistoryBoard } from '../../src/lib/espn-match-history';
import { parseMatchDetails, validMatchMetadata } from '../../src/lib/espn-match';
import { summaryFixture } from './match-fixture';
import { historyEvent, scheduleFixture } from './history-fixture';
const cutoff = '2026-10-23T18:00:00Z';
const parse = (events: ReturnType<typeof historyEvent>[]) => parseTeamSchedule(scheduleFixture('100', 2026, events), '100', 2026, cutoff, '401234567');
test('recent form uses only completed matches strictly before kickoff; scores preserve zero', () => {
  const live = historyEvent('2'); live.competitions[0].status.type.completed = false;
  const cancelled = historyEvent('3'); cancelled.competitions[0].status.type.name = 'STATUS_CANCELED';
  const games = parse([historyEvent(), live, cancelled, historyEvent('4', cutoff), historyEvent('5', '2026-10-24'), historyEvent('401234567'), historyEvent('6', 'invalid'), historyEvent('7', '2026-10-20', ['300', '400'])]);
  assert.equal(games.length, 1); assert.equal(games[0].teams[1].score, '0');
  assert.equal(historyOutcome(games[0], '100'), 'W'); assert.equal(historyOutcome(games[0], '200'), 'L');
});
test('team schedule identity and requested season must be confirmed, with no reference traversal', () => {
  assert.throws(() => parseTeamSchedule(scheduleFixture('200', 2026), '100', 2026, cutoff, '1'));
  assert.throws(() => parseTeamSchedule(scheduleFixture('100', 2025), '100', 2026, cutoff, '1'));
  assert.throws(() => parseTeamSchedule({ team: { id: '100' }, events: [] }, '100', 2026, cutoff, '1'));
  assert.throws(() => parseTeamSchedule({}, '100', 2026, cutoff, '1'));
  assert.deepEqual(parseTeamSchedule({ team: { id: '100' }, season: { year: 2026 }, events: [{ $ref: 'https://attacker.test' }] }, '100', 2026, cutoff, '1'), []);
});
test('draws, penalties, winner flags and shootout scores are represented honestly', () => {
  const game = parse([historyEvent()])[0];
  game.teams.forEach((team) => { team.score = '1'; team.winner = null; });
  assert.equal(historyOutcome(game, '100'), 'D');
  game.status = 'Final (Penalties)'; assert.equal(historyOutcome(game, '100'), null);
  game.teams[1].winner = true; assert.equal(historyOutcome(game, '100'), 'L');
  game.teams[1].winner = null; game.teams[0].shootout = '5'; game.teams[1].shootout = '4';
  assert.equal(historyOutcome(game, '100'), 'W'); assert.equal(historyOutcome(game, '200'), 'L');
  assert.equal(historyOutcome(game, 'unknown'), null);
});
test('deduplication, dates, five-result cap and both-team matching apply independently', () => {
  const games = parse(Array.from({ length: 8 }, (_, i) => historyEvent(String(10 + i), `2026-10-${String(i + 1).padStart(2, '0')}T18:00:00Z`, ['100', i === 0 ? '200' : '300'])));
  const recent = recentGames([...games, ...games], ['100']);
  assert.equal(recent.length, 5); assert.equal(recent[0].id, '17');
  const meetings = recentGames(games, ['100', '200']); assert.equal(meetings.length, 1); assert.equal(meetings[0].id, '10');
  const conflict = structuredClone(games[0]); conflict.teams[0].score = '99';
  assert.equal(recentGames([...games, conflict], ['100', '200']).length, 0);
});
test('summary provides reported stage, zero attendance and role-qualified officials without extra requests', () => {
  const fixture = summaryFixture();
  const match = parseMatchDetails({ ...fixture, header: { ...fixture.header, round: { displayName: 'Quarter-finals' } }, gameInfo: { attendance: 0, officials: [{ fullName: 'Reported Referee', position: { name: 'Referee' } }, { displayName: 'Assistant' }, { $ref: 'unsafe' }] } }, { league: 'epl', eventId: '401234567' });
  assert.deepEqual(match.information, { stage: 'Quarter-finals', attendance: '0', officials: [{ name: 'Reported Referee', role: 'Referee' }, { name: 'Assistant', role: null }] });
  assert.equal(validMatchMetadata(match), true);
  assert.deepEqual(parseMatchDetails({ header: fixture.header }, match.reference).information, { stage: null, attendance: null, officials: [] });
  assert.equal(parseMatchDetails({ ...fixture, gameInfo: { attendance: -1 } }, match.reference).information?.attendance, null);
});
test('metadata guards support older responses and reject malformed nested data on refresh', () => {
  assert.equal(validMatchMetadata({}), true);
  assert.equal(validMatchMetadata({ information: { stage: {}, attendance: null, officials: [] } }), false);
  assert.equal(validMatchMetadata({ information: { stage: null, attendance: null, officials: [{}] } }), false);
  assert.equal(validMatchMetadata({ season: { year: 2026, label: {} } }), false);
});
test('client history guard checks both teams, pre-kickoff dates and nested data', () => {
  const fixture = summaryFixture(); const match = parseMatchDetails({ ...fixture, header: { ...fixture.header, season: { year: 2026 } } }, { league: 'epl', eventId: '401234567' });
  const games = parse([historyEvent()]);
  const board = { reference: match.reference, cutoff: match.kickoff, seasonYears: [2026, 2025], status: 'ready', fetchedAt: cutoff, message: null,
    teams: match.teams.map((team) => ({ teamId: team.id, name: team.name, games, sources: [{ ok: true, season: 2026, url: 'https://site.api.espn.com', httpStatus: 200 }] })), headToHead: games };
  assert.equal(isMatchHistoryBoard(board, match), true);
  assert.equal(isMatchHistoryBoard({ ...board, cutoff: '2026-10-24' }, match), false);
  assert.equal(isMatchHistoryBoard({ ...board, teams: [board.teams[0], board.teams[0]] }, match), false);
  const broken = structuredClone(board); broken.headToHead[0].kickoff = '2026-10-24'; assert.equal(isMatchHistoryBoard(broken, match), false);
  const wrong = structuredClone(board); wrong.headToHead[0].teams[1].id = '999'; assert.equal(isMatchHistoryBoard(wrong, match), false);
});
test('explicitly different competitions are excluded and penalty/extra-time status names retain their meaning', () => {
  const event = historyEvent();
  const other = { ...event, league: { slug: 'esp.1' } };
  assert.deepEqual(parseTeamSchedule(scheduleFixture('100', 2026, [other]), '100', 2026, cutoff, '1', 'eng.1'), []);
  assert.throws(() => parseTeamSchedule({ ...scheduleFixture('100', 2026), league: { slug: 'esp.1' } }, '100', 2026, cutoff, '1', 'eng.1'));
  event.competitions[0].status.type.name = 'STATUS_FINAL_PEN';
  const penalty = parse([event])[0]; assert.match(penalty.status!, /Penalties/);
  penalty.teams.forEach((team) => { team.score = '0'; team.winner = null; });
  assert.equal(historyOutcome(penalty, '100'), null);
  event.competitions[0].status.type.name = 'STATUS_FINAL_AET';
  assert.match(parse([event])[0].status!, /extra time/);
});
test('complex sport scorelines remain reported text and do not acquire invented numeric outcomes', () => {
  const event = historyEvent();
  const payload = { ...event, competitions: [{ ...event.competitions[0], competitors: event.competitions[0].competitors.map((row, index) => ({ ...row, score: { displayValue: index ? '249/8' : '250/7' }, winner: index === 0 })) }] };
  const game = parseTeamSchedule({ team: { id: '100' }, season: { year: 2026 }, events: [payload] }, '100', 2026, cutoff, '1')[0];
  assert.equal(game.teams[0].score, '250/7'); assert.equal(historyOutcome(game, '100'), 'W');
  game.teams.forEach((team) => { team.winner = null; }); assert.equal(historyOutcome(game, '100'), null);
  game.status = 'Match drawn'; assert.equal(historyOutcome(game, '100'), 'D');
  game.teams[0].score = '300'; game.teams[1].score = '250'; assert.equal(historyOutcome(game, '100'), 'D');
});
