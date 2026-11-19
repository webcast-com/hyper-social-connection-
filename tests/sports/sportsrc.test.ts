import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  featuredStreamMatch, filterStreamMatches, httpsUrl, isWatchable, orderStreamMatches, parseStreamDetail, parseStreamMatches,
  parseStreamSports, streamClock, streamDate, streamDateLabel, streamMatchIcs, streamMatchId, streamScore, streamSportId, streamStatus,
} from '../../src/lib/sportsrc';
import { ARSENAL_ID, BARCA_ID, DONE_ID, LATER_ID, NOW, OFF_ID, SOON_ID, detailPayload, matchesPayload, sportsPayload } from './sportsrc-fixture';

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
