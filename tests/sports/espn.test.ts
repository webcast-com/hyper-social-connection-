import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEspnEvents } from '../../src/lib/espn';
import { ESPN_LEAGUES } from '../../src/lib/sports-catalog';

const epl = ESPN_LEAGUES.find((league) => league.slug === 'epl')!;
const f1 = ESPN_LEAGUES.find((league) => league.slug === 'f1')!;
function competition(state = 'pre') {
  return {
    id: 'match', date: '2026-10-22T18:00:00Z', status: { type: { state, shortDetail: 'Scheduled' } },
    competitors: [
      { homeAway: 'away', team: { displayName: 'Away FC', abbreviation: 'AWY' }, score: '2' },
      { homeAway: 'home', team: { displayName: 'Home FC', logos: [{ href: 'https://example.test/home.png' }] }, score: { value: 3, displayValue: '3' } },
    ],
  };
}
test('ESPN uses home/away metadata rather than provider array order, and supports score objects', () => {
  const [event] = parseEspnEvents({ leagues: [{ name: 'English Premier League' }], events: [{ id: '1', competitions: [competition('in')] }] }, epl);
  assert.equal(event.leagueName, 'English Premier League');
  assert.equal(event.home.name, 'Home FC');
  assert.equal(event.home.score, 3);
  assert.equal(event.home.logo, 'https://example.test/home.png');
  assert.equal(event.away.score, 2);
  assert.equal(event.status, 'live');
});
test('ESPN scheduled, in-progress, completed and event-level status fallbacks normalize correctly', () => {
  for (const [state, expected] of [['pre', 'upcoming'], ['in', 'live'], ['post', 'final']]) {
    assert.equal(parseEspnEvents({ events: [{ id: '1', competitions: [competition(state)] }] }, epl)[0].status, expected);
  }
  const comp = { ...competition(), status: undefined };
  assert.equal(parseEspnEvents({ events: [{ id: '1', status: { type: { completed: true } }, competitions: [comp] }] }, epl)[0].status, 'final');
});
test('ESPN unknown scores stay null, never an invented zero', () => {
  const comp = competition();
  comp.competitors[0].score = '';
  comp.competitors[1].score = { value: NaN, displayValue: '' };
  const [event] = parseEspnEvents({ events: [{ id: '1', competitions: [comp] }] }, epl);
  assert.equal(event.home.score, null);
  assert.equal(event.away.score, null);
});
test('malformed scoreboards are failures, but genuine empty schedules are valid', () => {
  assert.throws(() => parseEspnEvents({ error: 'unsupported league' }, epl), /Invalid ESPN scoreboard/);
  assert.throws(() => parseEspnEvents(null, epl), /Invalid ESPN scoreboard/);
  assert.deepEqual(parseEspnEvents({ events: [] }, epl), []);
  const comp = competition();
  comp.date = 'not-a-date';
  assert.deepEqual(parseEspnEvents({ events: [null, { id: '1', competitions: [comp] }] }, epl), []);
  assert.deepEqual(parseEspnEvents({ events: [{ id: '1', competitions: [{ ...competition(), competitors: [] }] }] }, epl), []);
});
test('all competition sessions are parsed with unique identifiers', () => {
  const events = parseEspnEvents({ events: [{ id: '1', competitions: [competition(), { ...competition(), id: 'second' }] }] }, epl);
  assert.equal(events.length, 2);
  assert.equal(new Set(events.map((event) => event.id)).size, 2);
});
test('F1 athlete fields become sorted race positions, not Home vs Away', () => {
  const comp = { ...competition('post'), type: { text: 'Race' }, competitors: [
    { order: 2, athlete: { displayName: 'Driver Two' } },
    { order: 1, athlete: { displayName: 'Driver One' } },
    { order: 3, athlete: { fullName: 'Driver Three' } },
  ] };
  const [event] = parseEspnEvents({ events: [{ id: 'gp', name: 'Review Grand Prix', competitions: [comp] }] }, f1);
  assert.equal(event.race?.title, 'Review Grand Prix · Race');
  assert.equal(event.race?.entries.length, 3);
  assert.deepEqual(event.race?.entries[0], { name: 'Driver One', position: 1 });
  assert.equal(event.home.score, undefined);
  assert.equal(event.status, 'final');
});
test('upcoming races without a reported line-up are retained without fake drivers', () => {
  const [event] = parseEspnEvents({ events: [{ id: 'gp', name: 'Review Grand Prix', competitions: [{ ...competition(), competitors: [] }] }] }, f1);
  assert.equal(event.race?.title, 'Review Grand Prix');
  assert.deepEqual(event.race?.entries, []);
  assert.equal(event.status, 'upcoming');
});
