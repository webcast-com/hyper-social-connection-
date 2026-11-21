import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combineNews, espnArticleUrl, MAX_NEWS_ARTICLES, NewsInputError, newsUrl, parseNews, resolveNewsLeagues } from '../../src/lib/espn-news';
import { getSportsNews, resetSportsNewsCache } from '../../src/lib/espn-news-feed';
import { parseScorers, resolveScorers, ScorersInputError } from '../../src/lib/espn-scorers';
import { getSportsScorers, resetSportsScorersCache } from '../../src/lib/espn-scorers-feed';
import { ESPN_LEAGUES } from '../../src/lib/sports-catalog';

/**
 * League news and top scorers for the ScoreHub dashboard.
 *
 * Both readers obey the site's rule: what ESPN did not report is absent, and a
 * feed that did not answer yields an empty, `unavailable` board. There is no
 * sample article or sample player anywhere in them.
 */

const epl = ESPN_LEAGUES.find((league) => league.slug === 'epl')!;
const ucl = ESPN_LEAGUES.find((league) => league.slug === 'ucl')!;

async function withFetch(run: (calls: string[]) => Promise<void>, respond: (url: string) => Response | Promise<Response>) {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: unknown) => { const url = String(input); calls.push(url); return respond(url); }) as typeof fetch;
  try { await run(calls); } finally { globalThis.fetch = original; resetSportsNewsCache(); resetSportsScorersCache(); }
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const story = (id: number, extra: Record<string, unknown> = {}) => ({
  id, type: 'Story', headline: `Headline ${id}`, description: `Summary ${id}`, published: `2026-11-0${id}T10:00:00Z`,
  images: [{ url: `https://a.espncdn.com/photo/${id}.jpg` }], links: { web: { href: `https://www.espn.com/soccer/story/_/id/${id}` } }, ...extra,
});

test('news: an article needs a headline and a page on espn.com; the rest stays null when unreported', () => {
  const articles = parseNews({ articles: [
    story(1),
    story(2, { description: undefined, images: [{ url: 'http://insecure.test/a.jpg' }, { url: 'javascript:alert(1)' }], published: 'not a date' }),
    story(3, { headline: '   ' }),
    story(4, { links: { web: { href: 'https://espn.com.evil.test/story' } } }),
    story(5, { links: { web: { href: 'http://www.espn.com/story' } } }),
    story(6, { links: {} }),
    story(1),
    story(7, { description: 'headline 7' }),
    null, 'text', 7,
  ] }, epl);
  assert.deepEqual(articles.map((article) => article.headline), ['Headline 1', 'Headline 2', 'Headline 7']);
  assert.deepEqual(articles[0], {
    id: 'espn-news-epl-1', headline: 'Headline 1', description: 'Summary 1', published: '2026-11-01T10:00:00.000Z',
    image: 'https://a.espncdn.com/photo/1.jpg', url: 'https://www.espn.com/soccer/story/_/id/1', league: 'epl', leagueName: 'Premier League',
  });
  assert.equal(articles[1].description, null);
  assert.equal(articles[1].image, null);
  assert.equal(articles[1].published, null);
  // A summary that only repeats the headline is not shown twice.
  assert.equal(articles[2].description, null);
  for (const bad of [null, {}, { articles: 'no' }, []]) assert.deepEqual(parseNews(bad, epl), []);
});

test('news: only https pages on espn.com or its subdomains are linked', () => {
  assert.equal(espnArticleUrl('https://www.espn.com/a'), 'https://www.espn.com/a');
  assert.equal(espnArticleUrl('https://espn.com/a'), 'https://espn.com/a');
  for (const bad of ['http://www.espn.com/a', 'https://espn.com.evil.test/a', 'https://notespn.com/a', 'https://user:pw@www.espn.com/a', 'javascript:alert(1)', '//www.espn.com/a', '', null, 5]) {
    assert.equal(espnArticleUrl(bad), null, String(bad));
  }
});

test('news: several competitions merge newest first, each article once, undated ones last, bounded', () => {
  const a = parseNews({ articles: [story(2), story(1)] }, epl);
  const b = parseNews({ articles: [story(3), story(2), story(4, { published: undefined })] }, ucl);
  const merged = combineNews([a, b]);
  assert.deepEqual(merged.map((article) => article.headline), ['Headline 3', 'Headline 2', 'Headline 1', 'Headline 4']);
  assert.equal(merged[1].league, 'epl');
  const many = Array.from({ length: 30 }, (_, index) => ({ ...a[0], url: `https://www.espn.com/${index}` }));
  assert.equal(combineNews([many]).length, MAX_NEWS_ARTICLES);
});

test('news: the leagues value is catalog slugs only, bounded, with a football default', () => {
  assert.deepEqual(resolveNewsLeagues(null).map((league) => league.slug), ['epl', 'ucl', 'laliga']);
  assert.deepEqual(resolveNewsLeagues('ucl,ucl,epl').map((league) => league.slug), ['ucl', 'epl']);
  assert.equal(newsUrl(epl), 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/news?limit=8');
  const status = (raw: string) => { try { resolveNewsLeagues(raw); return 0; } catch (error) { assert.ok(error instanceof NewsInputError); return error.httpStatus; } };
  assert.equal(status('nope'), 404);
  assert.equal(status('../etc'), 400);
  assert.equal(status('epl,'), 400);
  assert.equal(status('epl,ucl,laliga,seriea,mls'), 400);
});

test('news feed: one request per competition, cached; a competition that fails does not blank the others', async () => {
  await withFetch(async (calls) => {
    const board = await getSportsNews([epl, ucl]);
    assert.equal(board.status, 'ready');
    assert.deepEqual(board.articles.map((article) => article.headline), ['Headline 1']);
    assert.deepEqual(board.sources.map((source) => [source.league, source.ok]), [['epl', true], ['ucl', false]]);
    assert.equal(board.sources[1].httpStatus, 503);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((url) => url.startsWith('https://site.api.espn.com/apis/site/v2/sports/soccer/')));
    await getSportsNews([epl]);
    assert.equal(calls.length, 2, 'a cached competition is not asked again');
    await getSportsNews([epl], true);
    assert.equal(calls.length, 3, 'refresh asks again');
  }, (url) => (url.includes('/eng.1/') ? json({ articles: [story(1)] }) : json({}, 503)));
});

test('news feed: with no answer the board is unavailable and empty, never sample news', async () => {
  await withFetch(async () => {
    const board = await getSportsNews([epl, ucl]);
    assert.equal(board.status, 'unavailable');
    assert.deepEqual(board.articles, []);
    assert.ok(board.sources.every((source) => !source.ok && source.error));
  }, () => { throw new TypeError('fetch failed'); });
  await withFetch(async () => {
    assert.equal((await getSportsNews([epl])).status, 'unavailable', 'a reply without an article list is not an empty feed');
  }, () => json({ header: 'x' }));
  await withFetch(async () => {
    assert.equal((await getSportsNews([epl])).status, 'empty');
  }, () => json({ articles: [] }));
});

const leader = (id: number, goals: number, extra: Record<string, unknown> = {}, athlete: Record<string, unknown> = {}) => ({
  displayValue: `Matches: ${10 + id}, Goals: ${goals}`, value: goals,
  athlete: { id: String(id), displayName: `Player ${id}`, headshot: { href: `https://a.espncdn.com/i/headshots/soccer/players/full/${id}.png` }, team: { displayName: `Club ${id}`, logos: [{ href: `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png` }] }, ...athlete },
  ...extra,
});
const statistics = (leaders: unknown[]) => ({ stats: [
  { name: 'assistsLeaders', displayName: 'Top Assists', leaders: [leader(90, 14)] },
  { name: 'goalsLeaders', displayName: 'Top Scorers', leaders },
] });

test('scorers: the goals table is read in ESPN order, with only what ESPN reported', () => {
  const scorers = parseScorers(statistics([
    leader(1, 21),
    leader(2, 18, { displayValue: '18' }, { headshot: 'javascript:alert(1)', team: undefined }),
    leader(3, 17, { value: undefined, displayValue: 'M: 20, G: 17' }),
    leader(4, 0, { value: 'lots', displayValue: 'unknown' }),
    leader(1, 21),
    { value: 12, athlete: { id: 'abc', displayName: 'Odd Id' } },
    { value: 11 }, null,
  ]));
  assert.deepEqual(scorers.map((row) => [row.name, row.goals]), [['Player 1', '21'], ['Player 2', '18'], ['Player 3', '17'], ['Odd Id', '12']]);
  assert.deepEqual(scorers[0], {
    athleteId: '1', name: 'Player 1', team: 'Club 1', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/1.png',
    headshot: 'https://a.espncdn.com/i/headshots/soccer/players/full/1.png', goals: '21', matches: '11',
  });
  // Unreported stays null: no club, no photo, no appearance count is guessed.
  assert.deepEqual([scorers[1].team, scorers[1].teamLogo, scorers[1].headshot, scorers[1].matches], [null, null, null, null]);
  assert.equal(scorers[2].matches, '20');
  // An id that is not ESPN's shape never reaches a URL.
  assert.equal(scorers[3].athleteId, null);
});

test('scorers: the assists table is never mistaken for goals, and a reply without a goals table is empty', () => {
  assert.deepEqual(parseScorers({ stats: [{ name: 'assistsLeaders', displayName: 'Top Assists', leaders: [leader(1, 9)] }] }), []);
  assert.deepEqual(parseScorers({ stats: [{ name: 'goalsAgainst', displayName: 'Goals Against', leaders: [leader(1, 9)] }] }), []);
  assert.equal(parseScorers({ stats: [{ name: 'scoring', displayName: 'Top Scorers', leaders: [leader(1, 9)] }] }).length, 1);
  for (const bad of [null, {}, [], { stats: 'x' }, { stats: [{ name: 'goalsLeaders' }] }]) assert.deepEqual(parseScorers(bad), []);
  assert.equal(parseScorers(statistics(Array.from({ length: 40 }, (_, index) => leader(index + 1, 40 - index)))).length, 10);
});

test('scorers: football competitions only, by catalog slug', () => {
  assert.equal(resolveScorers('epl').url, 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/statistics');
  const status = (slug: string) => { try { resolveScorers(slug); return 0; } catch (error) { assert.ok(error instanceof ScorersInputError); return error.httpStatus; } };
  assert.equal(status('nba'), 404);
  assert.equal(status('nope'), 404);
  assert.equal(status('../x'), 400);
});

test('scorers feed: cached per competition; no answer is unavailable and empty, never sample players', async () => {
  await withFetch(async (calls) => {
    const board = await getSportsScorers('epl');
    assert.equal(board.status, 'ready');
    assert.equal(board.leagueName, 'Premier League');
    assert.deepEqual(board.scorers.map((row) => row.name), ['Player 1']);
    await getSportsScorers('epl');
    assert.equal(calls.length, 1);
  }, () => json(statistics([leader(1, 21)])));
  await withFetch(async () => {
    const board = await getSportsScorers('epl');
    assert.equal(board.status, 'unavailable');
    assert.deepEqual(board.scorers, []);
    assert.equal(board.source.ok, false);
  }, () => json({}, 500));
  await withFetch(async () => {
    assert.equal((await getSportsScorers('epl')).status, 'empty');
  }, () => json({ stats: [] }));
  await assert.rejects(async () => getSportsScorers('nba'), ScorersInputError);
});
