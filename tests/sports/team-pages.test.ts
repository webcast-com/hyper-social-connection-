import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountBoard } from './leaders-post-cards';
import type { TeamBoard } from '../../src/lib/espn-team';
import type { AthleteBoard } from '../../src/lib/espn-athlete';

/**
 * The team and player pages, mounted.
 *
 * The parsers and feeds have their own specs; this is the wiring a reader meets:
 * the page asks this site's own endpoint, validates what comes back before it
 * replaces what is on screen, and lays out only what ESPN reported. A refused
 * part says which part is missing, and nothing here substitutes a sample squad,
 * record or biography.
 */

const teamReference = { league: 'epl', teamId: '359' };

const initialTeam: TeamBoard = {
  reference: teamReference,
  leagueName: 'Premier League',
  sport: 'football',
  portraitsFromCdn: false,
  team: null,
  fixtures: [],
  roster: [],
  status: 'unavailable',
  fetchedAt: new Date().toISOString(),
  sources: [{ ok: false, part: 'info', url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/359', httpStatus: null, error: 'Loading team feed' }],
};

const readyTeam: TeamBoard = {
  reference: teamReference,
  leagueName: 'Premier League',
  sport: 'football',
  portraitsFromCdn: false,
  team: {
    id: '359', name: 'Arsenal', shortName: 'Arsenal', location: 'Arsenal', abbreviation: 'ARS', slug: 'arsenal',
    logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png', colours: { primary: '#ef3e42', secondary: null },
    record: '12-3-2', standing: '3rd in Premier League', venue: 'Emirates Stadium', active: true,
    links: [{ label: 'Arsenal', url: 'https://www.espn.com/soccer/team/_/id/359' }],
  },
  fixtures: [
    {
      id: '704123', date: '2026-11-08T17:30:00.000Z', state: 'post', statusText: 'Full Time', competition: 'English Premier League',
      season: 2026, venue: 'Emirates Stadium', side: 'home',
      home: { id: '359', name: 'Arsenal', abbreviation: 'ARS', logo: null, score: '2', winner: true },
      away: { id: '364', name: 'Chelsea', abbreviation: 'CHE', logo: null, score: '1', winner: false },
      opponent: { id: '364', name: 'Chelsea', abbreviation: 'CHE', logo: null, score: '1', winner: false },
    },
    {
      id: '704999', date: '2026-11-22T15:00:00.000Z', state: 'pre', statusText: 'Scheduled', competition: 'English Premier League',
      season: 2026, venue: null, side: 'away',
      home: { id: '367', name: 'Liverpool', abbreviation: 'LIV', logo: null, score: null, winner: null },
      away: { id: '359', name: 'Arsenal', abbreviation: 'ARS', logo: null, score: null, winner: null },
      opponent: { id: '367', name: 'Liverpool', abbreviation: 'LIV', logo: null, score: null, winner: null },
    },
  ],
  roster: [
    { id: '233064', name: 'Bukayo Saka', position: 'FW', jersey: '7', headshot: null, height: null, weight: null, age: 24, experience: '5 Yrs', nationality: 'England', born: null },
    { id: null, name: 'Reported Without An Id', position: 'GK', jersey: '31', headshot: null, height: null, weight: null, age: null, experience: null, nationality: null, born: null },
  ],
  status: 'ready',
  fetchedAt: '2026-11-10T12:00:00.000Z',
  sources: [
    { ok: true, part: 'info', url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/359', httpStatus: 200 },
    { ok: true, part: 'schedule', url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/359/schedule', httpStatus: 200 },
    { ok: true, part: 'roster', url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/359/roster', httpStatus: 200 },
  ],
};

async function mountTeam(respond: (url: string) => Response | Promise<Response>, initial: TeamBoard = initialTeam) {
  const React = await import('react');
  const { act } = React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> };
  const empty = { sport: 'basketball', league: 'nba', rows: [], status: 'live', source: { ok: true, url: '', httpStatus: 200 } };
  const mounted = await mountBoard({ basketball: empty, football: empty });
  const SportsTeamDetails = (await import('../../src/components/SportsTeamDetails')).default;
  const { createRoot } = await import('react-dom/client');
  const container = mounted.document.createElement('div');
  mounted.document.body.appendChild(container);
  const root = createRoot(container);

  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = ((input: any) => { urls.push(String(input)); return Promise.resolve(respond(String(input))); }) as typeof fetch;

  // Let the mount effect's request settle before anything is asserted.
  const settle = async () => { await act(async () => { await new Promise((done) => setTimeout(done, 0)); }); };
  await act(async () => { root.render(React.createElement(SportsTeamDetails as never, { initial, reference: teamReference, returnTo: '/sports' } as never)); });
  await settle();

  return {
    ...mounted,
    urls,
    settle,
    container,
    text: () => container.textContent ?? '',
    link: (label: string) => [...container.querySelectorAll('a')].find((node: any) => node.textContent.trim() === label) ?? null,
    button: (label: string) => [...container.querySelectorAll('button')].find((node: any) => node.textContent.trim() === label) ?? null,
    unmount: async () => {
      globalThis.fetch = original;
      await act(() => root.unmount());
      container.remove();
      await mounted.unmount();
    },
  };
}

test('a team page asks this site\u2019s own endpoint and lays out only what ESPN reported', async () => {
  const page = await mountTeam(() => Response.json(readyTeam));
  try {
    assert.deepEqual(page.urls, ['/api/sports/teams/epl/359'], 'one request, to this site\u2019s own team endpoint');
    assert.match(page.text(), /Arsenal/);
    assert.match(page.text(), /Record 12-3-2/);
    assert.match(page.text(), /3rd in Premier League/);
    assert.match(page.text(), /Emirates Stadium/);
    assert.match(page.text(), /ESPN · Premier League/);
    assert.ok(!page.text().includes('No sample squad'), 'a served team is not showing the unavailable notice');

    // The crest is the reported one; nothing is synthesised for a soccer club.
    const crest = page.container.querySelector('img[src*="teamlogos"]')!;
    assert.equal(crest.getAttribute('src'), 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png');
    assert.equal(crest.getAttribute('alt'), '', 'a crest is decorative; the name sits beside it');

    // Overview shows the next fixture and the last result, both linked.
    assert.match(page.text(), /Next reported fixture/);
    assert.match(page.text(), /Last reported result/);
    assert.equal(page.link('Chelsea (CHE)')!.getAttribute('href'), '/sports/teams/epl/364', 'an opponent with a reported id links to its own page');

    // The external link leaves the site honestly.
    const espn = page.link('Arsenal');
    assert.equal(espn!.getAttribute('href'), 'https://www.espn.com/soccer/team/_/id/359');
    assert.equal(espn!.getAttribute('target'), '_blank');
    assert.match(espn!.getAttribute('rel'), /noopener/);
    assert.match(espn!.getAttribute('rel'), /nofollow/);

    // Fixtures: grouped by the state ESPN reported, each linked to its match page.
    await page.click(page.button('Fixtures & results')!);
    const matchLinks = [...page.container.querySelectorAll('a')].map((node: any) => node.getAttribute('href'));
    assert.ok(matchLinks.includes('/sports/matches/epl/704123'), 'a reported fixture links to its match page');
    assert.ok(matchLinks.includes('/sports/matches/epl/704999'));
    assert.match(page.text(), /Upcoming/);
    assert.match(page.text(), /Results/);
    assert.match(page.text(), /Full Time/);
    assert.match(page.text(), /Postponed|grouped by the state ESPN reports/);
    assert.match(page.text(), /2 – 1/, 'the reported scoreline is shown as reported');

    // Squad: a player with an id links to their page; one without does not.
    await page.click(page.button('Squad')!);
    assert.match(page.text(), /Reported squad: 2 players/);
    assert.equal(page.link('Bukayo Saka')!.getAttribute('href'), '/sports/athletes/epl/233064');
    const anonymous = page.link('Reported Without An Id');
    assert.equal(anonymous, null, 'a player ESPN gave no id for links nowhere');
    assert.match(page.text(), /Reported Without An Id/);
    assert.match(page.text(), /FW · 24 yrs · 5 Yrs · England/);
    // Initials stand in for a portrait this competition does not synthesise.
    assert.ok(!page.container.querySelector('img[src*="headshots"]'), 'no invented portrait for a soccer squad');
    assert.match(page.text(), /are not synthesised for this competition/);
  } finally {
    await page.unmount();
  }
});

test('a team page says which part ESPN refused, and keeps the rest', async () => {
  const partial: TeamBoard = {
    ...readyTeam,
    roster: [],
    status: 'partial',
    sources: readyTeam.sources.map((source) => source.part === 'roster'
      ? { ok: false, part: 'roster', url: source.url, httpStatus: 403, errorKind: 'http', error: 'ESPN HTTP 403' }
      : source),
  };
  const page = await mountTeam(() => Response.json(partial));
  try {
    await page.click(page.button('Squad')!);
    assert.match(page.text(), /ESPN did not answer for the squad/);
    assert.match(page.text(), /ESPN has not reported a squad for this team/);
    assert.match(page.text(), /What is shown below is what was reported/);
    await page.click(page.button('Fixtures & results')!);
    assert.match(page.text(), /Chelsea/, 'the parts ESPN answered are still on the page');

    // The feed panel reports each part honestly, including the refusal.
    const details = page.container.querySelector('details')!;
    details.setAttribute('open', '');
    assert.match(details.textContent, /the squad: not reported/);
    assert.match(details.textContent, /HTTP 403 · http/);
    assert.match(details.textContent, /team identity: reported/);
  } finally {
    await page.unmount();
  }
});

test('an unanswered team page holds no data and says no sample is substituted', async () => {
  // ESPN refused: the endpoint still answers 200 with an honest empty board, and
  // the page reports the refusal it was given.
  const refusedBoard: TeamBoard = {
    ...initialTeam,
    sources: initialTeam.sources.map((source) => ({ ...source, httpStatus: 403, errorKind: 'http', error: 'ESPN HTTP 403' })),
  };
  const refused = await mountTeam(() => Response.json(refusedBoard));
  try {
    assert.match(refused.text(), /Access to ESPN team details was refused \(HTTP 403\)\./);
    assert.match(refused.text(), /No sample squad, record or fixtures are substituted\./);
    assert.match(refused.text(), /Team details unavailable/);
    assert.equal(refused.container.querySelector('img'), null, 'no crest, no portrait, nothing invented');
  } finally {
    await refused.unmount();
  }

  // This site's own endpoint busy or broken: the page keeps saying it has nothing.
  const busy = await mountTeam(() => new Response('busy', { status: 503 }));
  try {
    await busy.settle();
    assert.match(busy.text(), /Could not load team details\. Keeping the previous data\. Please try again\./);
    assert.match(busy.text(), /ESPN team details are currently unavailable\./);
    assert.match(busy.text(), /No sample squad, record or fixtures are substituted\./);
  } finally {
    await busy.unmount();
  }
});

test('a response about another team is rejected and the previous data is kept', async () => {
  const page = await mountTeam((url) => Response.json(url.includes('refresh=1') ? { ...readyTeam, team: { ...readyTeam.team, id: '364' } } : readyTeam));
  try {
    assert.match(page.text(), /Arsenal/);
    await page.click(page.button('Refresh details')!);
    await page.settle();
    assert.deepEqual(page.urls, ['/api/sports/teams/epl/359', '/api/sports/teams/epl/359?refresh=1'], 'the refresh button bypasses the server cache');
    assert.match(page.text(), /Could not load team details\. Keeping the previous data\. Please try again\./);
    assert.match(page.text(), /Arsenal/, 'the data already on screen survives a bad response');
  } finally {
    await page.unmount();
  }
});

const athleteReference = { league: 'nba', athleteId: '3945274' };

const initialAthlete: AthleteBoard = {
  reference: athleteReference,
  leagueName: 'NBA',
  sport: 'basketball',
  portraitsFromCdn: true,
  athlete: null,
  status: 'unavailable',
  fetchedAt: new Date().toISOString(),
  sources: [{ ok: false, url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/athletes/3945274', httpStatus: null, error: 'Loading player feed' }],
};

const readyAthlete: AthleteBoard = {
  ...initialAthlete,
  athlete: {
    id: '3945274', name: 'Luka Dončić', shortName: 'L. Dončić',
    headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/3945274.png',
    position: 'PG', jersey: '77', age: 27, born: '1999-02-28', height: '6\'7"', weight: '230 lbs',
    college: 'Real Madrid', nationality: 'Slovenia', experience: '8 Yrs', statusText: 'Active', active: true,
    team: { id: '1001', name: 'Los Angeles Lakers', abbreviation: 'LAL', logo: 'https://a.espncdn.com/i/teamlogos/nba/500/lal.png' },
    statGroups: [{ name: 'General', stats: [{ label: 'GP', value: '78' }, { label: 'PTS', value: '33.9' }] }],
    links: [{ label: 'Luka Doncic stats', url: 'https://www.espn.com/nba/player/_/id/3945274' }],
  },
  status: 'ready',
  fetchedAt: '2026-11-10T12:00:00.000Z',
  sources: [{ ok: true, url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/athletes/3945274', httpStatus: 200 }],
};

async function mountAthlete(respond: (url: string) => Response | Promise<Response>) {
  const React = await import('react');
  const { act } = React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> };
  const empty = { sport: 'basketball', league: 'nba', rows: [], status: 'live', source: { ok: true, url: '', httpStatus: 200 } };
  const mounted = await mountBoard({ basketball: empty, football: empty });
  const SportsAthleteDetails = (await import('../../src/components/SportsAthleteDetails')).default;
  const { createRoot } = await import('react-dom/client');
  const container = mounted.document.createElement('div');
  mounted.document.body.appendChild(container);
  const root = createRoot(container);

  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = ((input: any) => { urls.push(String(input)); return Promise.resolve(respond(String(input))); }) as typeof fetch;
  const settle = async () => { await act(async () => { await new Promise((done) => setTimeout(done, 0)); }); };
  await act(async () => { root.render(React.createElement(SportsAthleteDetails as never, { initial: initialAthlete, reference: athleteReference, returnTo: '/sports' } as never)); });
  await settle();

  return {
    ...mounted,
    urls,
    settle,
    container,
    text: () => container.textContent ?? '',
    link: (label: string) => [...container.querySelectorAll('a')].find((node: any) => node.textContent.trim() === label) ?? null,
    button: (label: string) => [...container.querySelectorAll('button')].find((node: any) => node.textContent.trim() === label) ?? null,
    unmount: async () => {
      globalThis.fetch = original;
      await act(() => root.unmount());
      container.remove();
      await mounted.unmount();
    },
  };
}

test('a player page shows the reported biography, team link and statistics', async () => {
  const page = await mountAthlete(() => Response.json(readyAthlete));
  try {
    assert.deepEqual(page.urls, ['/api/sports/athletes/nba/3945274']);
    assert.match(page.text(), /Luka Dončić/);
    assert.match(page.text(), /#77 · PG · Active/);
    assert.match(page.text(), /ESPN · NBA/);
    assert.equal(page.link('Los Angeles Lakers')!.getAttribute('href'), '/sports/teams/nba/1001', 'a reported team id links to that team\u2019s page');

    const portrait = page.container.querySelector('img[src*="headshots"]')!;
    assert.equal(portrait.getAttribute('src'), 'https://a.espncdn.com/i/headshots/nba/players/full/3945274.png');
    assert.equal(portrait.getAttribute('alt'), '');

    await page.click(page.button('Overview')!);
    for (const fact of ['Competition', 'Team', 'Position', 'Jersey', 'Age', 'Born', 'Height', 'Weight', 'College', 'Nationality', 'Experience', 'Status']) {
      assert.match(page.text(), new RegExp(fact), `${fact} is listed`);
    }
    assert.match(page.text(), /Slovenia/);
    assert.match(page.text(), /1999-02-28/);

    await page.click(page.button('Season statistics')!);
    assert.match(page.text(), /General/);
    assert.match(page.text(), /GP/);
    assert.match(page.text(), /33\.9/);
    assert.match(page.text(), /A category ESPN did not report is absent rather than zero\./);
  } finally {
    await page.unmount();
  }
});

test('an unanswered player page says so, and a player without statistics shows none', async () => {
  const refused = await mountAthlete(() => Response.json({
    ...initialAthlete,
    sources: initialAthlete.sources.map((source) => ({ ...source, httpStatus: 403, errorKind: 'http', error: 'ESPN HTTP 403' })),
  }));
  try {
    await refused.settle();
    assert.match(refused.text(), /Player details unavailable/);
    assert.match(refused.text(), /No sample biography or statistics are substituted\./);
    assert.match(refused.text(), /Access to ESPN player details was refused \(HTTP 403\)\./);
    assert.equal(refused.container.querySelector('img'), null);
  } finally {
    await refused.unmount();
  }

  const noStats = await mountAthlete(() => Response.json({ ...readyAthlete, athlete: { ...readyAthlete.athlete, statGroups: [], headshot: null } }));
  try {
    await noStats.click(noStats.button('Season statistics')!);
    assert.match(noStats.text(), /ESPN has not reported season statistics for this player/);
    // No reported photo: initials stand in, and the row keeps its width.
    assert.equal(noStats.container.querySelector('img[src*="headshots"]'), null);
    assert.match(noStats.text(), /LD/);
  } finally {
    await noStats.unmount();
  }
});
