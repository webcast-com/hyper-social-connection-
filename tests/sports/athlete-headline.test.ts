import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEADLINE_TILES, athleteHeadlines } from '../../src/lib/athlete-headline';

/**
 * The three figures on a player's card: ESPN's own labels and values, the ones
 * a fan looks for first where the sport has them, and never a padded tile.
 */
const player = (over: Record<string, unknown> = {}) => ({
  statGroups: [] as { name: string; stats: { label: string; value: string }[] }[],
  age: 27 as number | null,
  height: '6\'7"' as string | null,
  weight: '230 lbs' as string | null,
  ...over,
});
const labels = (list: { label: string }[]) => list.map((entry) => entry.label);

test('a footballer leads with goals, assists and appearances, under ESPN’s own labels', () => {
  const tiles = athleteHeadlines(player({
    statGroups: [
      { name: 'General', stats: [{ label: 'Appearances', value: '31' }, { label: 'Yellow Cards', value: '4' }, { label: 'Fouls Committed', value: '22' }] },
      { name: 'Offensive', stats: [{ label: 'Shots', value: '98' }, { label: 'Total Goals', value: '27' }, { label: 'Goal Assists', value: '9' }] },
    ],
  }), 'football');
  assert.deepEqual(tiles, [
    { label: 'Total Goals', value: '27', source: 'stat' },
    { label: 'Goal Assists', value: '9', source: 'stat' },
    { label: 'Appearances', value: '31', source: 'stat' },
  ]);
});

test('abbreviated labels are recognised too, and the value is ESPN’s, untouched', () => {
  const tiles = athleteHeadlines(player({
    statGroups: [{ name: 'Stats', stats: [{ label: 'GP', value: '12' }, { label: 'G', value: '7' }, { label: 'A', value: '03' }, { label: 'SH', value: '40' }] }],
  }), 'football');
  assert.deepEqual(tiles.map((tile) => [tile.label, tile.value]), [['G', '7'], ['A', '03'], ['GP', '12']]);
});

test('the most specific label wins: per-game points before a points total', () => {
  const tiles = athleteHeadlines(player({
    statGroups: [{ name: 'General', stats: [
      { label: 'Points', value: '2,640' }, { label: 'GP', value: '78' }, { label: 'Points Per Game', value: '33.9' },
      { label: 'REB', value: '9.2' }, { label: 'AST', value: '9.8' },
    ] }],
  }), 'basketball');
  assert.deepEqual(labels(tiles), ['Points Per Game', 'REB', 'AST']);
});

test('places a sport’s leading figures do not fill go to the next reported statistics, in order', () => {
  // The page's own fixture: a basketball player with games and points only.
  const tiles = athleteHeadlines(player({ statGroups: [{ name: 'General', stats: [{ label: 'GP', value: '78' }, { label: 'PTS', value: '33.9' }] }] }), 'basketball');
  assert.deepEqual(tiles, [
    { label: 'PTS', value: '33.9', source: 'stat' },
    { label: 'GP', value: '78', source: 'stat' },
    { label: 'Age', value: '27', source: 'bio' },
  ]);
});

test('a sport with no obvious three shows the first statistics ESPN listed', () => {
  const stats = [{ label: 'CMP', value: '401' }, { label: 'ATT', value: '597' }, { label: 'YDS', value: '4,183' }, { label: 'TD', value: '26' }];
  assert.deepEqual(labels(athleteHeadlines(player({ statGroups: [{ name: 'Passing', stats }] }), 'american-football')), ['CMP', 'ATT', 'YDS']);
  assert.deepEqual(labels(athleteHeadlines(player({ statGroups: [{ name: 'Race', stats: stats.slice(0, 1) }] }), 'motorsport')), ['CMP', 'Age', 'Height']);
});

test('with no statistics the card shows the biography; with nothing reported, no tile at all', () => {
  assert.deepEqual(athleteHeadlines(player(), 'football'), [
    { label: 'Age', value: '27', source: 'bio' },
    { label: 'Height', value: '6\'7"', source: 'bio' },
    { label: 'Weight', value: '230 lbs', source: 'bio' },
  ]);
  assert.deepEqual(labels(athleteHeadlines(player({ age: null, weight: null }), 'football')), ['Height']);
  assert.deepEqual(athleteHeadlines(player({ age: null, height: null, weight: null }), 'football'), []);
  assert.deepEqual(athleteHeadlines(null, 'football'), []);
  assert.deepEqual(athleteHeadlines(undefined, 'football'), []);
});

test('a figure is never shown twice, and never more than three are', () => {
  const tiles = athleteHeadlines(player({
    statGroups: [
      { name: 'Season', stats: [{ label: 'Goals', value: '27' }, { label: 'Assists', value: '9' }] },
      // The same labels again, split another way: not a second tile.
      { name: 'Career', stats: [{ label: 'goals', value: '310' }, { label: 'ASSISTS', value: '120' }, { label: 'Appearances', value: '420' }, { label: 'Shots', value: '900' }] },
    ],
  }), 'football');
  assert.deepEqual(tiles.map((tile) => [tile.label, tile.value]), [['Goals', '27'], ['Assists', '9'], ['Appearances', '420']]);
  assert.equal(tiles.length, HEADLINE_TILES);
  assert.equal(athleteHeadlines(player(), 'football', 2).length, 2);
  assert.deepEqual(athleteHeadlines(player(), 'football', 0), []);
});

test('a blank value or a label with no letters is not a figure', () => {
  const tiles = athleteHeadlines(player({
    age: null, height: null, weight: null,
    statGroups: [{ name: 'General', stats: [{ label: 'Goals', value: '  ' }, { label: '—', value: '5' }, { label: 'Assists', value: '0' }] }],
  }), 'football');
  // A reported zero is a figure; an empty value is not.
  assert.deepEqual(tiles, [{ label: 'Assists', value: '0', source: 'stat' }]);
});

/**
 * The card's stylesheet is loaded by one route but, like any stylesheet, applies
 * to whatever page is open once it has loaded. Every rule must therefore name
 * the card, so that visiting a player cannot restyle the page visited next.
 */
test('the player card’s stylesheet reaches nothing outside the card', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = (await readFile('src/app/sports/athletes/[league]/[athleteId]/player.css', 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /!important/);

  const selectors: string[] = [];
  let depth = 0;
  let atRule = false;
  let buffer = '';
  for (const char of css) {
    if (char === '{') {
      const head = buffer.trim();
      // A keyframes block holds steps (`from`, `to`), not selectors.
      if (head.startsWith('@')) atRule = head.startsWith('@keyframes') ? true : atRule;
      else if (!atRule && head) selectors.push(...head.split(',').map((part) => part.trim()));
      depth += 1; buffer = '';
    } else if (char === '}') {
      depth -= 1; buffer = '';
      if (depth === 0) atRule = false;
    } else if (char === ';') buffer = '';
    else buffer += char;
  }
  assert.ok(selectors.length >= 8, 'the stylesheet was read');
  for (const selector of selectors) {
    assert.match(selector, /^\.pl-card(\s|$)|:has\(\.pl-card\)$/, `"${selector}" is scoped to the player card`);
  }
  // The one rule outside the card is the page background, and only that.
  assert.deepEqual(selectors.filter((selector) => !selector.startsWith('.pl-card')), ['.dark body.app-page-bg:has(.pl-card)']);
});
