import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchLine, matchPostText, matchStatusLabel } from '../../src/lib/match-post';
import { SPORT_EMOJI, type SportKind } from '../../src/lib/sports-catalog';
import type { SportsEvent, SportsPrediction } from '../../src/lib/sports';

const match = (over: Partial<SportsEvent> = {}): SportsEvent => ({
  id: 'epl-1', source: 'espn', sport: 'football', league: 'epl', leagueName: 'Premier League',
  status: 'live', detail: "67'", startAt: '2026-11-21T17:30:00Z', venue: 'Emirates Stadium',
  home: { name: 'Arsenal', short: 'ARS', score: 2 }, away: { name: 'Chelsea', short: 'CHE', score: 1 },
  ...over,
});

test('a post made from a match card opens with the sport’s emoji, not a trophy', () => {
  assert.equal(matchPostText(match()).split('\n')[0], '⚽ CHE 1–2 ARS');
  assert.equal(matchPostText(match({ sport: 'basketball' })).split('\n')[0], '🏀 CHE 1–2 ARS');
  assert.equal(matchPostText(match({ sport: 'american-football' })).split('\n')[0], '🏈 CHE 1–2 ARS');
  assert.equal(matchPostText(match({ sport: 'rugby' })).split('\n')[0], '🏉 CHE 1–2 ARS');
});

test('every sport’s post opens with the emoji its card wears, and only the catch-all keeps the trophy', () => {
  for (const sport of Object.keys(SPORT_EMOJI) as SportKind[]) {
    const first = matchPostText(match({ sport })).split('\n')[0];
    assert.ok(first.startsWith(`${SPORT_EMOJI[sport]} `), sport);
    assert.equal(first.startsWith('🏆'), sport === 'other', sport);
  }
});

test('a race post opens with the car and the race’s title, not two sides', () => {
  const race = match({ sport: 'motorsport', leagueName: 'Formula 1', race: { title: 'Italian Grand Prix', entries: [] } });
  assert.equal(matchPostText(race).split('\n')[0], '🏎️ Italian Grand Prix');
});

test('the rest of the post is unchanged: competition, prediction, venue, note and hashtags', () => {
  const prediction = { prediction: 'Arsenal win', winOdds: '1.85' } as SportsPrediction;
  assert.equal(
    matchPostText(match(), '  What a game  ', prediction),
    "⚽ CHE 1–2 ARS\nPremier League · LIVE 67'\n🔮 Prediction: Arsenal win @ 1.85\n📍 Emirates Stadium\n\nWhat a game\n\n#Sports #MatchDay",
  );
  assert.equal(
    matchPostText(match({ venue: null })),
    "⚽ CHE 1–2 ARS\nPremier League · LIVE 67'\n\n#Sports #MatchDay",
  );
});

test('a sample fixture’s post says it is a sample and never claims to be live', () => {
  const text = matchPostText(match({ source: 'demo' }));
  assert.match(text, /Premier League · Sample fixture/);
  assert.doesNotMatch(text, /LIVE/);
  assert.equal(matchStatusLabel(match({ source: 'demo', status: 'final' })), 'Sample fixture');
});

test('an upcoming match reads "vs" and an unreported score is a dash, never a zero', () => {
  assert.equal(matchLine(match({ status: 'upcoming', home: { name: 'Arsenal', short: 'ARS' }, away: { name: 'Chelsea', short: 'CHE' } })), 'CHE vs ARS');
  assert.equal(matchLine(match({ home: { name: 'Arsenal', score: null }, away: { name: 'Chelsea', score: null } })), 'Chelsea ––– Arsenal');
});
