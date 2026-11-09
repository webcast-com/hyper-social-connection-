import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import nextConfig from '../../next.config';

// Layout and styling remain the original ScoreHub snapshot; script.js is ESPN-connected.
const files: Record<string, string> = {
  'README.md': '473047536796fa8e53772b1ec2260790024ab780f64362254c587876cd5af998',
  'index.htm': '0aecb1ec1db0fd75740c59d5a5f8fe626877b66478cd4a25edc302f84078d40e',
  'style.css': 'f418aeb13debbec04bc4281b4809a05b2c716efd9f50bada3b377491d30c7785',
};

test('ScoreHub layout and styles match the selected main-branch source', async () => {
  for (const [name, hash] of Object.entries(files)) {
    assert.equal(createHash('sha256').update(await readFile(`public/scorehub/${name}`)).digest('hex'), hash, name);
  }
});

test('ScoreHub opens at the original document location and the demo is noindex', async () => {
  const redirects = await nextConfig.redirects!();
  assert.ok(redirects.some((rule) => rule.source === '/scorehub' && rule.destination === '/scorehub/index.htm'));
  const headers = await nextConfig.headers!();
  assert.ok(headers.some((rule) => rule.source === '/scorehub/:path*' && rule.headers.some((header) => header.key === 'X-Robots-Tag' && header.value === 'noindex, nofollow')));
});

// jsdom exercises the actual unchanged document and the browser script with mocked
// same-origin APIs; no ESPN network access or invented live data is required.
const { JSDOM } = require('jsdom') as { JSDOM: any };
const flush = () => new Promise((resolve) => setTimeout(resolve, 25));
async function browser(fetcher: (url: string) => unknown) {
  const html = await readFile('public/scorehub/index.htm', 'utf8');
  const script = await readFile('public/scorehub/script.js', 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.test/scorehub/index.htm', runScripts: 'outside-only' });
  dom.window.fetch = async (url: string) => fetcher(url);
  dom.window.eval(script);
  await flush();
  return dom;
}
const event = { id: 'espn-ncaaw-123', source: 'espn', sport: 'basketball', league: 'ncaaw', leagueName: 'NCAA Women', status: 'live', startAt: '2026-11-08T12:00:00Z', detail: 'Q2', home: { name: 'Home', score: 30 }, away: { name: 'Away', score: 25 }, details: { league: 'ncaaw', eventId: '123' } };
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });

test('ScoreHub uses same-origin feeds, displays real scores and standings, and filters without changing layout', async () => {
  const urls: string[] = [];
  const dom = await browser((url) => {
    urls.push(url);
    if (url === '/api/sports') return response({ mode: 'partial', events: [event, { ...event, id: 'demo', source: 'demo', home: { name: 'Fake' } }] });
    if (url.startsWith('/api/sports/standings/')) return response({ status: 'ready', groups: [{ rows: [{ rank: '1', team: '<img src=x>', values: { gamesPlayed: '5', points: '12' } }] }] });
    if (url.startsWith('/api/sports/matches/')) return response({ status: 'ready', match: { teams: [{ id: 'a', side: 'away' }, { id: 'h', side: 'home' }], statistics: [{ name: 'shots', label: 'Shots', values: [{ teamId: 'a', value: '7' }, { teamId: 'h', value: '8' }] }] } });
    throw Error(url);
  });
  try {
    const doc = dom.window.document;
    assert.ok(urls.includes('/api/sports'));
    assert.ok(urls.includes('/api/sports/standings/epl'));
    assert.ok(urls.includes('/api/sports/matches/ncaaw/123'));
    assert.equal(doc.querySelectorAll('.match-card').length, 1);
    assert.match(doc.querySelector('#matchList').textContent, /Away[\s\S]*25 - 30[\s\S]*Home/);
    assert.doesNotMatch(doc.querySelector('#matchList').textContent, /Fake/);
    assert.match(doc.querySelector('.matches-panel h2').textContent, /partial/);
    assert.equal(doc.querySelector('.standings tbody td:nth-child(2)').textContent, '<img src=x>');
    assert.equal(doc.querySelector('.standings tbody img'), null);
    assert.match(doc.querySelector('.stat-bars').textContent, /Shots[\s\S]*7[\s\S]*8/);
    assert.match(doc.querySelector('.news-section h2').textContent, /sample/i);
    doc.querySelector('[href="#football"]').click(); assert.equal(doc.querySelectorAll('.match-card').length, 0);
    doc.querySelector('[href="#basketball"]').click(); assert.equal(doc.querySelectorAll('.match-card').length, 1);
    doc.querySelector('.star').click(); doc.querySelector('[data-filter="favorites"]').click(); assert.equal(doc.querySelectorAll('.match-card').length, 1);
    doc.querySelectorAll('.league-tabs button')[1].click(); await flush(); assert.ok(urls.includes('/api/sports/standings/laliga'));
  } finally { dom.window.close(); }
});

test('unavailable providers never expose demo scores or stale sample standings as live', async () => {
  const dom = await browser((url) => url === '/api/sports' ? response({mode:'demo', events:[{...event, source:'demo'}]}) : response({status:'unavailable'}));
  try {
    const doc = dom.window.document;
    assert.equal(doc.querySelectorAll('.match-card').length, 0);
    assert.match(doc.querySelector('.matches-panel h2').textContent, /unavailable/i);
    assert.match(doc.querySelector('.standings tbody').textContent, /unavailable/i);
    assert.doesNotMatch(doc.querySelector('.featured-match').textContent, /Arsenal|Chelsea/);
    assert.match(doc.querySelector('.statistics').textContent, /unavailable/i);
  } finally { dom.window.close(); }
});
