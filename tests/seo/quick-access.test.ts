import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import QuickAccess from '../../src/components/QuickAccess';

/**
 * The "Catch up fast" shortcuts live on the Groups page, not the home page.
 * Three of them point at sections of the home feed, so the rule that matters is
 * that every shortcut still lands somewhere that exists.
 */
const home = readFileSync('src/app/page.tsx', 'utf8');
const groups = readFileSync('src/app/groups/page.tsx', 'utf8');

test('the quick-access shortcuts point at the sports board, the home feed sections and the group list', () => {
  const html = renderToStaticMarkup(createElement(QuickAccess, { groupsHref: '#group-list' }));
  const links = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[2].replace(/<[^>]+>/g, '').trim(), m[1]]);
  assert.deepEqual(links, [
    ['Sports scores', '/sports'],
    ['Sports', '/sports'],
    ['Trending', '/#trending-now'],
    ['Groups', '#group-list'],
    ['People', '/#people-you-may-know'],
    ['Contacts', '/#contacts'],
  ]);
  assert.match(html, /Catch up fast/);
  // The Groups page has its own title: the section adds no heading above it.
  assert.doesNotMatch(html, /<h[1-6]/);
});

test('every home-feed section a shortcut opens still exists on the home page', () => {
  for (const id of ['trending-now', 'people-you-may-know', 'contacts']) {
    assert.ok(home.includes(`id="${id}"`), `home page has no #${id}`);
  }
  assert.ok(groups.includes('id="group-list"'));
  assert.ok(groups.includes('<QuickAccess groupsHref="#group-list" />'));
});

test('the home page no longer shows the section and keeps exactly one page heading', () => {
  assert.doesNotMatch(home, /Catch up fast|Quick access/);
  assert.equal(home.match(/<h1[\s>]/g)?.length, 1);
});
