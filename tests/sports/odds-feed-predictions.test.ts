import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oddsFeedPredictions, MAX_FEED_PREDICTIONS } from '../../src/lib/odds-feed-predictions';
import type { OddsBoard, OddsMatch } from '../../src/lib/espn-odds';

const match = (id: string, odds: Partial<OddsMatch['odds']>, overrides: Partial<OddsMatch> = {}): OddsMatch => ({
  id, sport: 'football', path: 'soccer/eng.1', league: 'Premier League',
  home_team: 'Arsenal', away_team: 'Chelsea', home_logo: null, away_logo: null,
  kickoff: '2026-11-26T15:00:00.000Z', venue: null, is_premium: false,
  odds: { home: null, away: null, draw: null, over_under: null, spread: null, provider: null, ...odds },
  ...overrides,
});

const board = (matches: OddsMatch[]): OddsBoard => ({
  matches, sources: [], fetchedAt: new Date().toISOString(), status: 'ready', truncated: false,
});

test('feed predictions pick the shortest-priced outcome, with market and labels from the quote', () => {
  const [soccer] = oddsFeedPredictions(board([match('espn-odds:1', { home: 1.65, draw: 3.9, away: 5.2 })]));
  assert.equal(soccer.id, 'espn-odds:1');
  assert.equal(soccer.source, 'espn');
  assert.equal(soccer.prediction, 'Arsenal to win');
  assert.equal(soccer.winOdds, '1.65');
  assert.equal(soccer.market, '1X2');
  assert.equal(soccer.federation, 'Football');
  assert.equal(soccer.competition, 'Premier League');
  assert.equal(soccer.startAt, '2026-11-26T15:00:00.000Z');

  const [nba] = oddsFeedPredictions(board([
    match('espn-odds:2', { home: 2.4, away: 1.55 }, { sport: 'basketball', league: 'NBA', home_team: 'Celtics', away_team: 'Heat' }),
  ]));
  assert.equal(nba.prediction, 'Heat to win');
  assert.equal(nba.market, 'Money line');
  assert.equal(nba.federation, 'Basketball');
});

test('a draw can be the pick, matches without win prices are skipped, and output is bounded', () => {
  const [draw] = oddsFeedPredictions(board([match('espn-odds:3', { home: 3.4, draw: 2.1, away: 3.6 })]));
  assert.equal(draw.prediction, 'Draw');
  assert.deepEqual(oddsFeedPredictions(board([match('espn-odds:4', { over_under: 2.5 })])), []);
  const many = board(Array.from({ length: 30 }, (_, i) => match(`espn-odds:${i}`, { home: 1.5 })));
  assert.equal(oddsFeedPredictions(many).length, MAX_FEED_PREDICTIONS);
  assert.deepEqual(oddsFeedPredictions(null), []);
});
