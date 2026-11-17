import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESPN_LEAGUES, SPORT_EMOJI, SPORT_LABELS } from '../../src/lib/sports-catalog';
import type { SportsEvent } from '../../src/lib/sports';

const root = join(__dirname, '..', '..');
const feedCard = readFileSync(join(root, 'src/components/SportsFeedCard.tsx'), 'utf8');

const fixture = (overrides: Partial<SportsEvent> = {}): SportsEvent => ({
  id: 'epl-1', source: 'espn', sport: 'football', league: 'epl', leagueName: 'Premier League',
  status: 'upcoming', startAt: '2026-11-21T17:30:00Z', venue: 'Anfield',
  details: { league: 'epl', eventId: '401234567' },
  home: { name: 'Liverpool', short: 'LIV' }, away: { name: 'Everton', short: 'EVE' },
  ...overrides,
});

/** The match face as a server would send it, with the server's clock in `timeZone`. */
async function serverMarkup(event: SportsEvent, timeZone: string) {
  const before = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    const React = await import('react');
    const { renderToString } = await import('react-dom/server');
    const Face = (await import('../../src/components/SportsMatchFace')).default;
    return renderToString(React.createElement(Face, { event, tone: 'upcoming', linked: true }));
  } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
}

test('a football match in the feed is drawn with the sports board’s own card', () => {
  assert.match(feedCard, /import SportsMatchFace, \{ MATCH_CARD, MATCH_FRAME, matchFaceTone \} from '.\/SportsMatchFace'/);
  assert.match(feedCard, /<div className=\{MATCH_FRAME\}>\s*<SportsMatchFace event=\{event\} tone=\{matchFaceTone\(event\)\}/);
  // The feed's old layout of its own is gone, not kept beside the board's card.
  assert.doesNotMatch(feedCard, /TeamBadge/);
  assert.doesNotMatch(feedCard, /SportsRaceSummary/);
});

test('basketball and American football keep the dashboard score card', () => {
  assert.match(feedCard, /\{scoreCard \? <SportsScoreCard event=\{event\} \/> : \(/);
});

test('the card is one link to the match page, with no link inside a link', () => {
  assert.doesNotMatch(feedCard, /View match details/);
  // Same rule as the board's card for which fixtures have a match page.
  assert.match(feedCard, /event\.source === 'espn' && event\.sport !== 'motorsport' && !event\.race && event\.details/);
  assert.match(feedCard, /scoreCard \? scoreCardTarget\(event\) : matchPage \?\? '\/sports'/);
});

test('the server never writes a kickoff time: it does not know the reader’s time zone', async () => {
  const nairobi = await serverMarkup(fixture(), 'Africa/Nairobi');
  const tokyo = await serverMarkup(fixture(), 'Asia/Tokyo');
  const losAngeles = await serverMarkup(fixture(), 'America/Los_Angeles');
  // 17:30 UTC is 20:30, 02:30 and 09:30 in those zones; none of them is sent.
  assert.equal(nairobi, tokyo);
  assert.equal(nairobi, losAngeles);
  for (const time of ['17:30', '5:30', '20:30', '8:30', '02:30', '2:30', '09:30', '9:30']) {
    assert.ok(!nairobi.includes(time), `${time} is not in the server markup`);
  }
  assert.match(nairobi, /Everton/);
  assert.match(nairobi, /Liverpool/);
  assert.match(nairobi, /Anfield/);
});

test('every sport has an emoji of its own, and the two footballs are not confused', () => {
  assert.deepEqual(Object.keys(SPORT_EMOJI).sort(), Object.keys(SPORT_LABELS).sort());
  assert.equal(SPORT_EMOJI.football, '⚽');
  assert.equal(SPORT_EMOJI.basketball, '🏀');
  assert.equal(SPORT_EMOJI['american-football'], '🏈');
  assert.equal(SPORT_EMOJI.rugby, '🏉');
  assert.equal(SPORT_EMOJI.baseball, '⚾');
  assert.equal(SPORT_EMOJI['ice-hockey'], '🏒');
  assert.equal(SPORT_EMOJI.tennis, '🎾');
  const values = Object.values(SPORT_EMOJI);
  assert.equal(new Set(values).size, values.length, 'no two sports share an emoji');
});

test('no competition the board covers falls back to the trophy', () => {
  for (const league of ESPN_LEAGUES) {
    assert.notEqual(SPORT_EMOJI[league.kind], SPORT_EMOJI.other, `${league.name} has its sport’s emoji`);
  }
});

test('a feed match card wears its sport’s emoji instead of one trophy for every game', () => {
  assert.match(feedCard, /\{SPORT_EMOJI\[event\.sport\] \?\? SPORT_EMOJI\.other\}/);
  assert.doesNotMatch(feedCard, /<Trophy/);
  // The words beside it name the sport, so the emoji is hidden from assistive technology.
  assert.match(feedCard, /aria-hidden="true" data-sport-emoji=\{event\.sport\}/);
});
