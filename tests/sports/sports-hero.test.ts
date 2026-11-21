import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { sportsHeroFigures } from '../../src/lib/sports-hero';
import SportsScoreHero from '../../src/components/SportsScoreHero';

/**
 * The sports page's head and hero follow the ScoreHub layout, whose original is
 * a static mock-up. These pin what must not come across with the layout: its
 * made-up numbers, its made-up match and its links to pages that do not exist.
 */
const catalog = { sports: 7, competitions: 121 };
const event = (status: 'live' | 'upcoming' | 'final', source: 'espn' | 'demo' = 'espn') => ({ status, source });

test('the hero counts live and loaded matches from what ESPN reported', () => {
  const figures = sportsHeroFigures({ mode: 'live', events: [event('live'), event('live'), event('upcoming'), event('final')] }, catalog, false);
  assert.deepEqual(figures, { live: 2, matches: 4, sports: 7, competitions: 121, headline: '2 Matches Live Now', inPlay: true });
  assert.equal(sportsHeroFigures({ mode: 'partial', events: [event('live'), event('final')] }, catalog, false).headline, '1 Match Live Now');
});

test('nothing in play is said as such, and only once ESPN has answered', () => {
  const quiet = sportsHeroFigures({ mode: 'live', events: [event('upcoming'), event('final')] }, catalog, false);
  assert.deepEqual([quiet.live, quiet.matches, quiet.headline, quiet.inPlay], [0, 2, 'No matches live right now', false]);
  // An empty but successful board is an answer too.
  assert.equal(sportsHeroFigures({ mode: 'live', events: [] }, catalog, false).live, 0);

  // Still loading: not zero, not "none live".
  const loading = sportsHeroFigures({ mode: 'partial', events: [] }, catalog, true);
  assert.deepEqual([loading.live, loading.matches, loading.headline, loading.inPlay], [null, null, 'Loading live scores…', false]);
  // Retained scores are not counted as current while a first load is pending.
  assert.equal(sportsHeroFigures({ mode: 'live', events: [event('live')] }, catalog, true).live, null);
});

test('a sample board and a board whose every feed failed report no counts at all', () => {
  const sample = sportsHeroFigures({ mode: 'demo', events: [event('live', 'demo'), event('upcoming', 'demo')] }, catalog, false);
  assert.deepEqual([sample.live, sample.matches, sample.headline, sample.inPlay], [null, null, 'Live scores unavailable right now', false]);

  const failed = sportsHeroFigures({ mode: 'partial', events: [], sources: [{ ok: false }, { ok: false }] }, catalog, false);
  assert.deepEqual([failed.live, failed.matches, failed.headline], [null, null, 'Live scores unavailable right now']);
  // One feed that answered is enough to say what it reported.
  const partial = sportsHeroFigures({ mode: 'partial', events: [], sources: [{ ok: false }, { ok: true }] }, catalog, false);
  assert.deepEqual([partial.live, partial.matches, partial.headline], [0, 0, 'No matches live right now']);
  // A sample fixture mixed into a partial board is never counted.
  assert.equal(sportsHeroFigures({ mode: 'partial', events: [event('live', 'demo'), event('live')] }, catalog, false).live, 1);
  // The catalog sizes are known whatever the feeds do.
  assert.deepEqual([failed.sports, failed.competitions], [7, 121]);
});

function render(over: Partial<Parameters<typeof SportsScoreHero>[0]> = {}) {
  const html = renderToStaticMarkup(createElement(SportsScoreHero, {
    figures: sportsHeroFigures({ mode: 'live', events: [event('live'), event('upcoming')] }, catalog, false),
    feedLabel: 'Live feeds', feedTone: 'live', refreshing: false, onRefresh: () => {}, status: 'all', onStatus: () => {},
    sportFilter: createElement('div', { role: 'group', 'aria-label': 'Filter by sport' }),
    ...over,
  }));
  return new JSDOM(html).window.document;
}
const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

test('the head lists only sections that exist, and marks this one as current', () => {
  const document = render({ predictions: 4 });
  const links = [...document.querySelectorAll('nav[aria-label="Sports sections"] a')].map((a) => [text(a), a.getAttribute('href')]);
  assert.deepEqual(links, [
    ['Scores', '/sports'], ['Live Streams', '/sports/live'], ['Highlights', '/sports/highlights'], ['Predictions4', '/sports/predictions'],
    ['ScoreHub dashboard', '/scorehub'], ['Basketball & NFL dashboard', '/nfl-basketball/'],
  ]);
  assert.deepEqual([...document.querySelectorAll('[aria-current="page"]')].map(text), ['Scores']);
  // ScoreHub's own News, Teams and Stats links have no page here.
  for (const absent of ['News', 'Teams', 'Stats', 'More']) assert.ok(!links.some(([label]) => label === absent), absent);
  assert.doesNotMatch(document.body.innerHTML, /href="#/);
  // No predictions, no badge.
  assert.equal(text(render().querySelector('a[href="/sports/predictions"]')), 'Predictions');
});

test('the hero has the layout’s headline and the page’s own figures, with none of the mock-up’s', () => {
  const document = render();
  assert.equal(document.querySelectorAll('h1').length, 1);
  assert.equal(text(document.querySelector('h1')), 'Every Score.Every Moment.');
  assert.match(text(document.body), /Worldwide scores and fixtures from ESPN/);
  assert.match(text(document.body), /1 Match Live Now/);
  const tiles = [...document.querySelectorAll('dl[aria-label="At a glance"] > div')].map((tile) => `${text(tile.querySelector('dt'))} ${text(tile.querySelector('dd'))}`);
  assert.deepEqual(tiles, ['Live 1', 'Sports 7', 'Leagues 121', 'Matches 2']);
  // The original's numbers, match and placeholders.
  assert.doesNotMatch(text(document.body), /\b54\b|2\.4M|Users|Arsenal|Chelsea|Watch Live|Log ?in/i);
  // The site is dark-only and its own header has the account controls.
  assert.equal(document.querySelector('#themeToggle, [aria-label="Toggle theme"]'), null);
  assert.equal(document.querySelector('input'), null);
});

test('an unknown count is a dash, never a zero', () => {
  const document = render({ figures: sportsHeroFigures({ mode: 'demo', events: [event('live', 'demo')] }, catalog, false), feedLabel: 'Sample board', feedTone: 'demo' });
  const tiles = [...document.querySelectorAll('dl[aria-label="At a glance"] > div')].map((tile) => `${text(tile.querySelector('dt'))} ${text(tile.querySelector('dd'))}`);
  assert.deepEqual(tiles, ['Live —', 'Sports 7', 'Leagues 121', 'Matches —']);
  assert.match(text(document.body), /Live scores unavailable right now/);
  assert.match(text(document.body), /Sample board/);
  // Nothing here reads as "1 live" on a sample board.
  assert.doesNotMatch(text(document.body), /\d+ Match(es)? Live Now/);
});

test('the controls keep their names, and the featured match appears only when the board has one', () => {
  const document = render({ status: 'live' });
  const buttons = [...document.querySelectorAll('button')].map((button) => [text(button), button.getAttribute('aria-pressed')]);
  assert.deepEqual(buttons, [['Refresh scores', null], ['Live Scores', 'true'], ['Upcoming Fixtures', 'false']]);
  assert.deepEqual([...render({ refreshing: true }).querySelectorAll('button')].map((button) => [text(button), button.hasAttribute('disabled')])[0], ['Refreshing scores…', true]);
  // The sport strip is the board's own filter, placed once.
  assert.equal(document.querySelectorAll('[aria-label="Filter by sport"]').length, 1);

  assert.equal(document.querySelector('[data-featured]'), null);
  const withMatch = render({ featured: createElement('section', { 'aria-label': 'Featured match', 'data-featured': '1' }) });
  assert.equal(withMatch.querySelectorAll('section[aria-label="Featured match"]').length, 1);
});

test('the board hands the hero its own filter and featured match instead of drawing them twice', async () => {
  const board = await readFile('src/components/SportsBoard.tsx', 'utf8');
  // One sport filter and one featured card in the source, each placed by page type.
  assert.equal(board.match(/aria-label="Filter by sport"/g)?.length, 1);
  assert.match(board, /\{!leaguePage && <SportsScoreHero/);
  assert.match(board, /\{leaguePage && featured && <SportsFeaturedMatch/);
  assert.match(board, /\{leaguePage && <div[^>]*>\{sportFilter\}<\/div>\}/);
  // The hero's photograph is a file of this site, not a hotlink.
  const hero = await readFile('src/components/SportsScoreHero.tsx', 'utf8');
  assert.match(hero, /url\(\/sports\/hero-scores\.webp\)/);
  assert.doesNotMatch(hero, /https?:\/\//);
  assert.ok((await readFile('public/sports/hero-scores.webp')).length > 10_000);
});
