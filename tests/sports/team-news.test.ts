import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterTeamArticles, isTeamNewsBoard, parseSummaryInjuries, teamAliases, MAX_INJURY_PLAYERS } from '../../src/lib/espn-team-news';
import type { SportsNewsArticle } from '../../src/lib/espn-news';

test('summary injuries keep only reported fields and drop nameless or teamless entries', () => {
  const teams = parseSummaryInjuries({
    injuries: [
      {
        team: { id: '2', displayName: 'Boston Celtics' },
        injuries: [
          {
            status: 'Out',
            athlete: { displayName: 'Jayson Tatum', position: { abbreviation: 'SF' } },
            details: { type: 'Achilles', returnDate: '2026-01-15' },
            shortComment: 'Tatum remains out after Achilles surgery.',
          },
          { status: 'Day-To-Day', athlete: { displayName: 'Derrick White' }, details: { type: 'Ankle' } },
          { status: 'Out', athlete: {} }, // nameless → dropped
        ],
      },
      { team: { id: 'bad id' }, injuries: [{ status: 'Out', athlete: { displayName: 'X' } }] }, // invalid team → dropped
      { team: { id: '5', displayName: 'Third Team' }, injuries: [] }, // extra team beyond cap of 2 is never read
    ],
  });
  assert.equal(teams.length, 1);
  assert.equal(teams[0].team, 'Boston Celtics');
  assert.deepEqual(teams[0].players[0], {
    name: 'Jayson Tatum', position: 'SF', status: 'Out', note: 'Tatum remains out after Achilles surgery.',
  });
  assert.deepEqual(teams[0].players[1], { name: 'Derrick White', position: null, status: 'Day-To-Day', note: 'Ankle' });
  assert.equal(teams[0].players.length, 2);
});

test('injury lists are bounded and soccer summaries without the section report none', () => {
  const big = parseSummaryInjuries({
    injuries: [{
      team: { id: '1', displayName: 'Team' },
      injuries: Array.from({ length: 40 }, (_, i) => ({ status: 'Out', athlete: { displayName: `P${i}` } })),
    }],
  });
  assert.equal(big[0].players.length, MAX_INJURY_PLAYERS);
  assert.deepEqual(parseSummaryInjuries({ boxscore: {} }), []);
  assert.deepEqual(parseSummaryInjuries(null), []);
});

const article = (id: string, headline: string, description: string | null = null): SportsNewsArticle => ({
  id, headline, description, published: null, image: null, url: 'https://www.espn.com/story', league: 'epl', leagueName: 'Premier League',
});

test('team aliases use the full name plus a distinctive final word, never generic suffixes', () => {
  assert.deepEqual(teamAliases('Boston Celtics'), ['boston celtics', 'celtics']);
  assert.deepEqual(teamAliases('Manchester United'), ['manchester united']);
  assert.deepEqual(teamAliases('Arsenal'), ['arsenal']);
  assert.deepEqual(teamAliases(''), []);
});

test('articles are kept only when they name either side', () => {
  const articles = [
    article('1', 'Celtics rule out Tatum for January'),
    article('2', 'Heat sign veteran guard', 'Miami Heat bolster their rotation'),
    article('3', 'League announces schedule change'),
    article('4', 'Boston Celtics injury report ahead of Friday'),
  ];
  const kept = filterTeamArticles(articles, ['Boston Celtics', 'Miami Heat']);
  assert.deepEqual(kept.map((a) => a.id), ['1', '2', '4']);
  assert.deepEqual(filterTeamArticles(articles, []), []);
});

test('the board validator accepts a real board and rejects off-ESPN links', () => {
  const board = {
    reference: { league: 'nba', eventId: '401' }, fetchedAt: new Date().toISOString(),
    status: 'ready', message: null,
    injuries: [{ teamId: '2', team: 'Boston Celtics', players: [{ name: 'Jayson Tatum', position: 'SF', status: 'Out', note: null }] }],
    articles: [article('1', 'Celtics news')], sources: [{ kind: 'injuries', ok: true, url: 'https://site.api.espn.com/x', httpStatus: 200 }],
  };
  assert.ok(isTeamNewsBoard(board));
  assert.ok(!isTeamNewsBoard({ ...board, articles: [{ ...article('1', 'x'), url: 'https://espn.com.evil.test/story' }] }));
  assert.ok(!isTeamNewsBoard({ ...board, status: 'surprise' }));
});
