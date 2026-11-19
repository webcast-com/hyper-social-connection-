import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  featuredStreamMatch, filterStreamMatches, httpsUrl, isWatchable, orderStreamMatches, parseStreamDetail, parseStreamMatches,
  parseStreamSources, parseStreamSports, payloadShape, streamClock, streamDate, streamDateLabel, streamInstant, streamMatchIcs, streamMatchId,
  streamScore, streamSportId, streamStatus,
} from '../../src/lib/sportsrc';
import {
  ARSENAL_ID, BARCA_ID, DONE_ID, LATER_ID, NOW, OFF_ID, SOON_ID, detailPayload, matchesPayload, servedDetailPayload, servedMatchesPayload,
  sportsPayload, streamPayload,
} from './sportsrc-fixture';

/**
 * SportSRC's responses as the live-stream screen reads them: what is listed,
 * what a clock and a score may say, which player addresses may be framed, and
 * when pressing play can lead anywhere.
 */

const now = new Date(NOW);
const board = () => parseStreamMatches(matchesPayload());
const find = (id: string) => board().matches.find((match) => match.id === id)!;

test('matches are listed once each, under their league, and only when they can be asked for', () => {
  const { leagues, matches } = board();
  assert.deepEqual(matches.map((match) => match.id), [ARSENAL_ID, SOON_ID, BARCA_ID, DONE_ID, LATER_ID, OFF_ID]);
  assert.deepEqual(leagues.map((league) => [league.name, league.country, league.matches]), [
    ['Premier League', 'England', 2], ['La Liga', 'Spain', 2], ['Ligue 1', 'France', 2],
  ]);
  assert.equal(find(ARSENAL_ID).league, 'Premier League');
  assert.equal(find(ARSENAL_ID).leagueKey, leagues[0].key);
  assert.equal(find(ARSENAL_ID).round, 'Round 9');
  assert.equal(find(ARSENAL_ID).startAt, new Date(NOW - 70 * 60_000).toISOString());
});

test('a status is one of SportSRC’s strings, and anything else is never taken for live', () => {
  assert.deepEqual(
    ['inprogress', 'notstarted', 'finished', 'suspended', 'interrupted', 'postponed', 'canceled', '', 'LIVE!!'].map(streamStatus),
    ['live', 'upcoming', 'finished', 'other', 'other', 'other', 'other', 'other', 'other'],
  );
  assert.deepEqual(board().matches.map((match) => match.status), ['live', 'upcoming', 'live', 'finished', 'upcoming', 'other']);
});

test('a fixture that has not started has no score, and a score that was not reported is not a zero', () => {
  assert.deepEqual(find(SOON_ID).score, { home: null, away: null });
  assert.equal(streamScore(find(SOON_ID)), 'vs');
  assert.deepEqual(find(OFF_ID).score, { home: null, away: null });
  assert.equal(streamScore(find(ARSENAL_ID)), '2 - 1');
  assert.equal(streamScore(find(BARCA_ID)), '1 - 0');
});

test('only https images are drawn; a side without a code gets one from its name', () => {
  assert.equal(find(ARSENAL_ID).home.badge, 'https://cdn.sportsrc.org/badges/ars.png');
  assert.equal(find(BARCA_ID).home.badge, null);
  assert.equal(find(BARCA_ID).home.code, 'BAR');
  assert.equal(find(BARCA_ID).leagueLogo, null);
  assert.equal(httpsUrl('http://example.com/a.png'), null);
  assert.equal(httpsUrl('https://user:pw@example.com/a.png'), null);
  assert.equal(httpsUrl('//example.com/a.png'), null);
});

test('the clock is what SportSRC reported: its minute, else the period, never a guess', () => {
  assert.equal(streamClock(find(BARCA_ID)), "24'");
  // No minute in the free list: the period, not a minute worked out from kickoff.
  assert.equal(streamClock(find(ARSENAL_ID)), '2H');
  assert.equal(streamClock({ status: 'live', rawStatus: 'inprogress', statusDetail: 'Halftime', timer: '' }), 'HT');
  assert.equal(streamClock({ status: 'live', rawStatus: 'inprogress', statusDetail: '', timer: '' }), 'Live');
  assert.equal(streamClock(find(DONE_ID)), 'FT');
  assert.equal(streamClock(find(OFF_ID)), 'Postp.');
  // A kickoff is a time of day in the reader's zone: left to the browser.
  assert.equal(streamClock(find(SOON_ID)), null);
});

test('play leads somewhere for a match in play, or one starting within half an hour', () => {
  assert.equal(isWatchable(find(ARSENAL_ID), now), true);
  assert.equal(isWatchable(find(SOON_ID), now), true);
  assert.equal(isWatchable(find(LATER_ID), now), false);
  assert.equal(isWatchable(find(DONE_ID), now), false);
  assert.equal(isWatchable(find(OFF_ID), now), false);
  assert.equal(isWatchable({ ...find(ARSENAL_ID), hasStream: false }, now), false);
});

test('the list is live first, then by kickoff, with finished fixtures last', () => {
  assert.deepEqual(orderStreamMatches(board().matches).map((match) => match.id), [ARSENAL_ID, BARCA_ID, SOON_ID, LATER_ID, OFF_ID, DONE_ID]);
});

test('the player opens on a match in play, and on the next one to start when none is', () => {
  assert.equal(featuredStreamMatch(board().matches, now)?.id, ARSENAL_ID);
  const quiet = board().matches.filter((match) => match.status !== 'live');
  assert.equal(featuredStreamMatch(quiet, now)?.id, SOON_ID);
  assert.equal(featuredStreamMatch([], now), null);
});

test('tabs, a league, a club and the search box each narrow the same list', () => {
  const { matches, leagues } = board();
  const ids = (filter: Parameters<typeof filterStreamMatches>[1]) => filterStreamMatches(matches, filter).map((match) => match.id);
  assert.deepEqual(ids({ tab: 'all' }).length, 6);
  assert.deepEqual(ids({ tab: 'live' }), [ARSENAL_ID, BARCA_ID]);
  assert.deepEqual(ids({ tab: 'upcoming' }), [SOON_ID, LATER_ID]);
  assert.deepEqual(ids({ tab: 'finished' }), [DONE_ID]);
  assert.deepEqual(ids({ tab: 'all', league: leagues[1].key }), [BARCA_ID, DONE_ID]);
  assert.deepEqual(ids({ tab: 'all', club: 'real madrid' }), [BARCA_ID]);
  assert.deepEqual(ids({ tab: 'all', query: ' ARSEN ' }), [ARSENAL_ID]);
  assert.deepEqual(ids({ tab: 'all', query: 'spain' }), [BARCA_ID, DONE_ID]);
  assert.deepEqual(ids({ tab: 'bookmarks', bookmarks: new Set([LATER_ID]) }), [LATER_ID]);
  assert.deepEqual(ids({ tab: 'bookmarks' }), []);
});

test('a match’s sources are framed only from https, once each, with a readable label', () => {
  const detail = parseStreamDetail(detailPayload())!;
  assert.deepEqual(detail.sources.map((source) => [source.label, source.hd, source.language]), [['LOLA', true, null], ['HDTV', false, 'English']]);
  assert.ok(detail.sources.every((source) => source.embedUrl.startsWith('https://embed.example.com/')));
  assert.equal(detail.venue?.stadium, 'Emirates Stadium');
  assert.equal(detail.venue?.capacity, 60383);
  assert.equal(detail.referee, 'Michael Oliver');
  assert.deepEqual(detail.managers, { home: 'Mikel Arteta', away: 'Enzo Maresca' });
  assert.equal(detail.season, '2026/2027');
  assert.equal(parseStreamDetail({ success: true, data: { id: ARSENAL_ID } })?.sources.length, 0);
  assert.equal(parseStreamDetail({ success: true }), null);
  assert.equal(parseStreamDetail({ success: true, data: { id: '../etc' } }), null);
});

test('football is always offered, and other sports appear when SportSRC lists them', () => {
  assert.deepEqual(parseStreamSports(sportsPayload()).map((sport) => sport.id), ['football']);
  assert.deepEqual(parseStreamSports(null).map((sport) => sport.id), ['football']);
  assert.deepEqual(
    parseStreamSports({ data: [{ id: 'basketball', name: 'Basketball', total: 12 }, { id: 'Bad Id!' }] }).map((sport) => sport.name),
    ['Football', 'Basketball'],
  );
});

test('what is sent on to SportSRC is checked first', () => {
  assert.equal(streamMatchId(ARSENAL_ID), ARSENAL_ID);
  for (const bad of ['', 'a', 'a b', 'a/b', 'a?b=c', 'a&type=odds', '../x', 'x'.repeat(401), null, 7]) assert.equal(streamMatchId(bad), null, String(bad));
  assert.equal(streamSportId('Football'), 'football');
  assert.equal(streamSportId('foot ball'), null);
  assert.equal(streamDate('2026-11-19'), '2026-11-19');
  for (const bad of ['2026-02-30', '19-11-2026', '2026-11-19T00:00', '']) assert.equal(streamDate(bad), null, bad);
});

test('a calendar entry carries the fixture, its kickoff in UTC, and the way back', () => {
  const ics = streamMatchIcs(find(LATER_ID), 'https://hyper.co.ke/sports/live', now)!;
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /SUMMARY:PSG vs Benfica\r\n/);
  assert.match(ics, /DTSTART:20261119T210000Z\r\n/);
  assert.match(ics, /DTEND:20261119T230000Z\r\n/);
  assert.match(ics, /URL:https:\/\/hyper\.co\.ke\/sports\/live\r\n/);
  assert.match(ics, /END:VCALENDAR$/);
  assert.equal(streamMatchIcs({ ...find(LATER_ID), startAt: null }, 'https://hyper.co.ke/sports/live'), null);
});

test('the date pill says Today for today and the weekday otherwise', () => {
  assert.equal(streamDateLabel('2026-10-04', '2026-10-04'), 'Today, Oct 4');
  assert.equal(streamDateLabel('2026-10-05', '2026-10-04'), 'Mon, Oct 5');
});

/* ── The answers as the service sends them, where they differ from its documentation ── */

test('a kick-off sent in milliseconds is the same moment as one sent in seconds', () => {
  const seconds = Math.floor(NOW / 1000);
  assert.equal(streamInstant(seconds)!.toISOString(), '2026-11-19T18:00:00.000Z');
  assert.equal(streamInstant(NOW)!.toISOString(), '2026-11-19T18:00:00.000Z');
  assert.equal(streamInstant(String(NOW))!.toISOString(), '2026-11-19T18:00:00.000Z');
  for (const bad of [0, -5, NaN, '', 'soon', null, undefined, {}]) assert.equal(streamInstant(bad), null);

  const served = parseStreamMatches(servedMatchesPayload()).matches;
  const documented = board().matches;
  for (const id of [ARSENAL_ID, SOON_ID, DONE_ID]) {
    assert.equal(served.find((match) => match.id === id)!.startAt, documented.find((match) => match.id === id)!.startAt, id);
  }
  // Read as seconds, these kick-offs land tens of thousands of years away, and
  // a match twenty minutes off never becomes one that can be opened.
  assert.ok(served.every((match) => match.startAt!.startsWith('2026-11-19T')));
  assert.equal(isWatchable(served.find((match) => match.id === SOON_ID)!, now), true);
});

test('a score nested under `current`, or given only as "2 - 1", is still the score', () => {
  const served = parseStreamMatches(servedMatchesPayload()).matches;
  const of = (id: string) => served.find((match) => match.id === id)!;
  assert.deepEqual(of(ARSENAL_ID).score, { home: 2, away: 1 });
  assert.equal(streamScore(of(ARSENAL_ID)), '2 - 1');
  assert.deepEqual(of(DONE_ID).score, { home: 3, away: 0 });
  // No score object at all before kick-off: still "vs", not "0 - 0".
  assert.deepEqual(of(SOON_ID).score, { home: null, away: null });
  assert.equal(streamScore(of(SOON_ID)), 'vs');
});

test('a match’s sources are read whether its fields sit under `data` or under `data.match_info`', () => {
  const detail = parseStreamDetail(servedDetailPayload())!;
  assert.equal(detail.id, ARSENAL_ID);
  assert.equal(detail.title, 'Arsenal vs Chelsea');
  assert.equal(detail.status, 'live');
  assert.deepEqual(detail.sources.map((source) => [source.label, source.hd, source.language]), [['LOLA', true, 'English'], ['HDTV', false, null]]);
  assert.equal(detail.venue?.stadium, 'Emirates Stadium');
  assert.equal(detail.season, '2026/2027');
  assert.equal(detail.round, 'Round 9');

  // An answer that does not repeat the id is about the match that was asked for.
  const bare = { success: true, data: { sources: servedDetailPayload().data.sources } };
  assert.equal(parseStreamDetail(bare), null);
  assert.equal(parseStreamDetail(bare, ARSENAL_ID)!.sources.length, 2);
  assert.equal(parseStreamDetail(bare, '<script>'), null);
  // Still nothing from an answer with no `data` at all.
  assert.equal(parseStreamDetail({ success: true }, ARSENAL_ID), null);
  assert.equal(parseStreamDetail({ success: true, data: [] }, ARSENAL_ID), null);
});

test('the sources-only answer is read the same way: https only, once each', () => {
  assert.deepEqual(parseStreamSources(streamPayload()).map((source) => [source.label, source.hd, source.embedUrl]), [
    ['ECHO', true, `https://embed.example.com/?id=${ARSENAL_ID}&source=echo`],
  ]);
  assert.equal(parseStreamSources({ success: true, data: { sources: detailPayload().data.sources } }).length, 2);
  for (const nothing of [null, 'x', {}, { data: null }, { data: 'x' }, { data: [null, 5, 'x'] }]) assert.deepEqual(parseStreamSources(nothing), []);
});

test('an answer that could not be read can be described by its field names alone', () => {
  const shape = payloadShape({ success: true, data: { match_info: { id: ARSENAL_ID, score: null }, sources: [{ embedUrl: 'https://secret.example/x', hd: true }, {}] } });
  assert.equal(shape, '{success:boolean,data:{match_info:{id:string,score:null},sources:[{embedUrl:string,hd:boolean}]×2}}');
  assert.ok(!shape.includes('secret.example') && !shape.includes(ARSENAL_ID), 'no values, only names and types');
  assert.equal(payloadShape([]), '[]');
  assert.ok(payloadShape({ a: { b: { c: { d: { e: 1 } } } } }).includes('{…}'), 'depth is bounded');
});
