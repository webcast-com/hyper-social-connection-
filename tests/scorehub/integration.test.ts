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
async function browser(fetcher: (url: string) => unknown, setup?: (window: any) => void) {
  const html = await readFile('public/scorehub/index.htm', 'utf8');
  const script = await readFile('public/scorehub/script.js', 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.test/scorehub/index.htm', runScripts: 'outside-only' });
  dom.window.fetch = async (url: string) => fetcher(url);
  setup?.(dom.window);
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

const stat = (name: string, label: string, a: string | null, h: string | null) => ({ name, label, values: [{ teamId: 'a', value: a }, { teamId: 'h', value: h }] });
const summary = (stats: unknown[]) => ({ status: 'ready', match: { teams: [{ id: 'h', side: 'home' }, { id: 'a', side: 'away' }], statistics: stats } });
const matchStats = [
  stat('possessionPct', 'Possession', '55%', '45%'), stat('totalShots', 'Shots', '8', '6'),
  stat('shotsOnTarget', 'Shots on Target', '4', '2'), stat('wonCorners', 'Corners', '4', '3'),
  stat('foulsCommitted', 'Fouls', '7', '8'), stat('yellowCards', 'Yellow Cards', '2', '1'),
];

test('provider crests and the original four card statistics are mapped to the correct teams', async () => {
  const withLogos = { ...event, away: { ...event.away, logo: 'https://a.espncdn.com/away.png' }, home: { ...event.home, logo: 'https://a.espncdn.com/home.png' } };
  let calls = 0;
  const dom = await browser((url) => {
    if (url === '/api/sports') return response({ mode: 'live', events: [withLogos] });
    if (url.startsWith('/api/sports/standings/')) return response({ status: 'empty' });
    if (url.startsWith('/api/sports/matches/')) { calls++; return response(summary(matchStats)); }
    throw Error(url);
  });
  try {
    const doc = dom.window.document;
    const card = doc.querySelector('.match-card');
    assert.equal(card.querySelectorAll('.team-name img').length, 2);
    assert.equal(card.querySelectorAll('.team-name img')[0].src, 'https://a.espncdn.com/away.png');
    assert.equal(card.querySelectorAll('.team-name img')[1].src, 'https://a.espncdn.com/home.png');
    assert.equal(doc.querySelectorAll('.team-large img').length, 2);
    assert.equal(doc.querySelectorAll('.ticker-card img').length, 2);
    const lines = card.querySelectorAll('.match-stats > span');
    assert.match(lines[0].textContent, /55%.*8.*4.*2/);
    assert.match(lines[1].textContent, /45%.*6.*2.*1/);
    assert.equal(lines[0].querySelectorAll('[aria-label]').length, 4);
    assert.equal(doc.querySelectorAll('.possession > b')[0].textContent, '55%');
    assert.equal(doc.querySelectorAll('.possession > b')[1].textContent, '45%');
    assert.equal(doc.querySelector('.stat-bars div i').style.getPropertyValue('--left'), `${8 / 14 * 100}%`);
    assert.match(doc.querySelector('.stat-bars').textContent, /Corners[\s\S]*4[\s\S]*3/);
    assert.equal(calls, 1, 'card and panel share one summary request');
    const img = card.querySelector('.team-name img'); img.dispatchEvent(new dom.window.Event('error'));
    assert.equal(card.querySelector('.team-name i').textContent, 'A');
  } finally { dom.window.close(); }
});

test('missing and unsafe crests and unavailable statistics use honest placeholders', async () => {
  const bad = { ...event, away: { ...event.away, logo: 'javascript:alert(1)' }, home: { ...event.home, logo: 'http://example.test/crest.png' } };
  const dom = await browser(url => url === '/api/sports' ? response({ mode: 'live', events: [bad] }) : url.startsWith('/api/sports/matches/') ? response({ status: 'unavailable' }) : response({ status: 'empty' }));
  try {
    const doc = dom.window.document;
    assert.equal(doc.querySelectorAll('.match-card img').length, 0);
    assert.equal(doc.querySelector('.team-name i').textContent, 'A');
    assert.match(doc.querySelector('.match-stats').textContent, /◉ —.*♧ —.*▤ —.*▣ —/);
    assert.equal(doc.querySelector('.donut span').textContent, 'Unavailable');
    assert.match(doc.querySelector('.stat-bars').textContent, /Shots[\s\S]*—[\s\S]*—/);
  } finally { dom.window.close(); }
});

test('details button selects the right match statistics without navigating away', async () => {
  const other = { ...event, id: 'espn-epl-456', league: 'epl', leagueName: 'Premier League', sport: 'football', home: { name: 'Second home', score: 2 }, away: { name: 'Second away', score: 1 }, details: { league: 'epl', eventId: '456' } };
  const dom = await browser(url => {
    if (url === '/api/sports') return response({ mode: 'live', events: [event, other] });
    if (url.includes('/matches/ncaaw/')) return response(summary(matchStats));
    if (url.includes('/matches/epl/')) return response(summary([stat('possession', 'Possession', '62%', '38%'), stat('totalShots', 'Shots', '10', '1')]));
    return response({ status: 'empty' });
  });
  try {
    const doc = dom.window.document;
    doc.querySelectorAll('.match-actions button:not(.star)')[1].click(); await flush();
    assert.match(doc.querySelector('.stats-score').textContent, /Second away|Second home/);
    assert.equal(doc.querySelectorAll('.possession > b')[0].textContent, '62%');
    assert.equal(doc.querySelectorAll('.possession > b')[1].textContent, '38%');
    assert.equal(doc.querySelector('.statistics .table-link').getAttribute('href'), '/sports/matches/epl/456');
    assert.equal(dom.window.location.pathname, '/scorehub/index.htm');
    assert.match(doc.querySelector('.stat-bars').textContent, /Shots[\s\S]*10[\s\S]*1/);
  } finally { dom.window.close(); }
});

test('card summary loading is lazy for off-screen matches and bounded', async () => {
  const events = Array.from({ length: 12 }, (_, i) => ({ ...event, id: `espn-epl-${100 + i}`, league: 'epl', details: { league: 'epl', eventId: String(100 + i) } }));
  const observed: any[] = [], calls: string[] = []; let callback: (entries: any[]) => void = () => {}; let active = 0, peak = 0;
  const dom = await browser(url => {
    if (url === '/api/sports') return response({mode:'live', events});
    if (url.includes('/matches/')) { calls.push(url); active++; peak = Math.max(peak, active); return new Promise(resolve => setTimeout(() => { active--; resolve(response(summary(matchStats))); }, 15)); }
    return response({status:'empty'});
  }, window => { window.IntersectionObserver = class { constructor(fn: typeof callback) { callback = fn; } observe(node: any) { observed.push(node); } unobserve() {} disconnect() {} }; });
  try {
    assert.equal(observed.length, 12);
    assert.equal(calls.length, 1, 'only the featured match loads before cards are visible');
    callback(observed.map(target => ({target, isIntersecting:true})));
    await new Promise(resolve => setTimeout(resolve, 160));
    assert.equal(calls.length, 12);
    assert.ok(peak <= 4);
    assert.match(observed[11].querySelector('.match-stats').textContent, /55%/);
  } finally { dom.window.close(); }
});

test('late response for a previous selection cannot overwrite selected match', async () => {
  const second = { ...event, id:'espn-epl-456', league:'epl', details: {league:'epl', eventId:'456'}, away: { name:'Other away' }, home: { name:'Other home' } };
  let resolveFirst: (value: unknown) => void = () => {};
  const dom = await browser(url => {
    if (url === '/api/sports') return response({mode:'live', events:[event, second]});
    if (url.includes('/matches/ncaaw/')) return new Promise(resolve => { resolveFirst = resolve; });
    if (url.includes('/matches/epl/')) return response(summary([stat('possession', 'Possession', '62%', '38%')]));
    return response({status:'empty'});
  });
  try {
    const doc = dom.window.document;
    doc.querySelectorAll('.match-actions button:not(.star)')[1].click(); await flush();
    resolveFirst(response(summary(matchStats))); await flush();
    assert.match(doc.querySelector('.stats-score').textContent, /Other away/);
    assert.equal(doc.querySelectorAll('.possession > b')[0].textContent, '62%');
  } finally { dom.window.close(); }
});
