import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { JSDOM } = require('jsdom') as { JSDOM: any };
const htmlPath = 'public/scorehub/match.htm';
const scriptPath = 'public/scorehub/match-detail.js';

async function openMatch(url: string, response: (path: string) => unknown) {
  const html = await readFile(htmlPath, 'utf8');
  const script = await readFile(scriptPath, 'utf8');
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  const requests: string[] = [];
  dom.window.fetch = async (path: string) => {
    requests.push(path);
    const result = response(path) as any;
    return { ok: result?.ok !== false, status: result?.status ?? 200, json: async () => result?.body ?? result };
  };
  dom.window.eval(script);
  await new Promise(resolve => setTimeout(resolve, 10));
  return { dom, requests };
}

const match = {
  reference: { league: 'epl', eventId: '123' }, leagueName: 'Premier League', title: 'Away United vs Home City',
  kickoff: '2026-11-27T17:30:00.000Z', venue: 'ScoreHub Stadium', state: 'in', statusText: '65′',
  season: { year: 2026, label: '2025/26' },
  information: { stage: 'Regular season', attendance: '50,000', officials: [{ name: 'Referee One', role: 'Referee' }] },
  teams: [{ id: 'away-id', name: 'Away United', side: 'away', score: '1' }, { id: 'home-id', name: 'Home City', side: 'home', score: '2' }],
  statistics: [{ name: 'shots', label: 'Shots', values: [{ teamId: 'away-id', value: '7' }, { teamId: 'home-id', value: '10' }] }],
  lineups: [{ teamId: 'away-id', formation: '4-3-3', players: [{ id: '1', name: 'Player A', position: 'FW', jersey: '9', starter: true, didNotPlay: false }] }],
  playerStats: [{ teamId: 'home-id', label: 'Goals', columns: ['G'], players: [{ id: '2', name: 'Player B', values: ['1'] }] }],
  updates: [{ id: 'event-1', text: 'Goal scored', clock: '65′', period: '2nd Half', team: 'Home City', participants: ['Player B'] }],
  updatesLabel: 'Key events',
};

 test('ScoreHub match page reuses index typography, navigation and responsive page container', async () => {
  const html = await readFile(htmlPath, 'utf8');
  assert.match(html, /href="style\.css"/);
  assert.match(html, /family=Inter:wght@400;500;600;700;800;900/);
  assert.match(html, /class="topbar"/);
  assert.match(html, /class="sport-nav"/);
  assert.match(html, /class="page match-page"/);
  assert.match(html, /match-detail\.css/);
  assert.match(html, /index\.htm#fixtures/);
});

test('a valid match link loads ESPN report, then switches among detailed match tabs', async () => {
  const { dom, requests } = await openMatch('https://example.test/scorehub/match.htm?league=epl&eventId=123', path => {
    assert.equal(path, '/api/sports/matches/epl/123');
    return { status: 'ready', match };
  });
  try {
    const doc = dom.window.document;
    assert.deepEqual(requests, ['/api/sports/matches/epl/123']);
    assert.equal(doc.querySelector('#matchTitle').textContent, 'Away United vs Home City');
    assert.equal(doc.querySelector('#score').textContent, '1 – 2');
    assert.match(doc.querySelector('#matchKickoff').textContent, /ScoreHub Stadium/);
    assert.equal(doc.querySelector('#detailPanel').getAttribute('aria-busy'), 'false');
    assert.match(doc.querySelector('#sectionContent').textContent, /Regular season/);

    doc.querySelector('#tab-statistics').click();
    assert.match(doc.querySelector('#sectionContent').textContent, /Shots[\s\S]*7[\s\S]*10/);
    assert.equal(doc.querySelector('#tab-statistics').getAttribute('aria-selected'), 'true');

    doc.querySelector('#tab-lineups').click();
    assert.match(doc.querySelector('#sectionContent').textContent, /Away United · 4-3-3[\s\S]*Player A/);
    assert.match(doc.querySelector('#sectionContent').textContent, /No lineup reported for this team/);

    doc.querySelector('#tab-players').click();
    assert.match(doc.querySelector('#sectionContent').textContent, /Player B[\s\S]*1/);

    doc.querySelector('#tab-events').click();
    assert.match(doc.querySelector('#sectionTitle').textContent, /Key events/);
    assert.match(doc.querySelector('#sectionContent').textContent, /65′[\s\S]*Goal scored/);
  } finally { dom.window.close(); }
});

test('invalid or unavailable match data produces honest empty states and no demo scores', async () => {
  const invalid = await openMatch('https://example.test/scorehub/match.htm?league=bad%2Furl&eventId=0', () => { throw Error('should not fetch'); });
  try {
    assert.deepEqual(invalid.requests, []);
    assert.match(invalid.dom.window.document.querySelector('#sectionContent').textContent, /missing a valid competition or event ID/);
    assert.doesNotMatch(invalid.dom.window.document.body.textContent, /Arsenal|Chelsea|2 - 1/);
  } finally { invalid.dom.window.close(); }

  const unavailable = await openMatch('https://example.test/scorehub/match.htm?league=epl&eventId=456', () => ({ status: 'unavailable', match: null }));
  try {
    assert.deepEqual(unavailable.requests, ['/api/sports/matches/epl/456']);
    assert.match(unavailable.dom.window.document.querySelector('#sectionContent').textContent, /No sample scores, statistics or lineups are substituted/);
    assert.doesNotMatch(unavailable.dom.window.document.querySelector('.match-teams').textContent, /Arsenal|Chelsea/);
  } finally { unavailable.dom.window.close(); }
});
