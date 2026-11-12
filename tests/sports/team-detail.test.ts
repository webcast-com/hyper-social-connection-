import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  athletePortrait,
  cdnPortraits,
  entityLinks,
  parseTeamFixtures,
  parseTeamInfo,
  parseTeamRoster,
  resolveTeam,
  safeExternalUrl,
  teamCrest,
  TeamInputError,
  teamHref,
  validEntityId,
  validTeamBoard,
} from '../../src/lib/espn-team';
import { ESPN_LEAGUES } from '../../src/lib/sports-catalog';

/**
 * Team detail, parsed.
 *
 * These are the rules a team page cannot fake: the payload has to be about the
 * team that was asked for, a crest is only ever the one ESPN reported, a
 * portrait is synthesised from ESPN's headshot CDN for the NBA and the NFL only,
 * and a missing value stays missing.
 */

const meta = (slug: string) => {
  const found = ESPN_LEAGUES.find((entry) => entry.slug === slug);
  assert.ok(found, `${slug} is configured in the catalog`);
  return found!;
};

const reference = { league: 'epl', teamId: '359' };

const infoPayload = (over: Record<string, unknown> = {}) => ({
  team: {
    id: 359,
    slug: 'arsenal',
    location: 'Arsenal',
    name: 'Arsenal',
    nickname: 'Gunners',
    abbreviation: 'ARS',
    displayName: 'Arsenal',
    shortDisplayName: 'Arsenal',
    color: 'EF3E42',
    alternateColor: 'ffffff',
    isActive: true,
    logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png',
    logos: [{ href: 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png', width: 500, height: 500, alt: '', rel: ['team'] }],
    links: [
      { href: 'https://www.espn.com/soccer/team/_/id/359', text: 'Arsenal', rel: ['team'] },
      // A club's own site is reported by ESPN and kept; a script URL is not.
      { href: 'https://www.arsenal.com', text: 'Official site', isExternal: true },
      { href: 'javascript:alert(1)', text: 'Not a link' },
      { href: 'http://insecure.espn.com/arsenal', text: 'Not https' },
    ],
    record: { items: [{ name: 'overall', type: 'total', summary: '12-3-2', displayValue: '12-3-2', wins: 12, losses: 3, ties: 2 }] },
    standingSummary: '3rd in Premier League',
    venue: { id: 456, fullName: 'Emirates Stadium' },
    ...over,
  },
});

test('a team page is addressed by a catalog competition and a numeric ESPN id', () => {
  const resolved = resolveTeam('epl', '359');
  assert.equal(resolved.reference.league, 'epl');
  assert.equal(resolved.reference.teamId, '359');
  assert.equal(resolved.meta.name, meta('epl').name);
  assert.deepEqual(resolved.urls, {
    info: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/359',
    schedule: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/359/schedule',
    roster: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/359/roster',
  });
  assert.equal(teamHref(resolved.reference), '/sports/teams/epl/359');

  // Every configured competition builds a usable path, not just the big ones.
  for (const slug of ['nba', 'nfl', 'ucl', 'kenya', 'afcon', 'ncaam']) {
    const entry = resolveTeam(slug, '1');
    assert.match(entry.urls.info, new RegExp(`^https://site\\.api\\.espn\\.com/apis/site/v2/sports/${meta(slug).sport}/${meta(slug).league}/teams/1$`));
  }

  assert.throws(() => resolveTeam('not-a-league', '359'),
    (error: unknown) => error instanceof TeamInputError && error.httpStatus === 404, 'an unknown competition is a 404');
  for (const bad of ['abc', '0359', '0', '', '359/../../admin', '-4', '1'.repeat(21), 359 as unknown as string, undefined as unknown as string]) {
    assert.throws(() => resolveTeam('epl', bad),
      (error: unknown) => error instanceof TeamInputError && error.httpStatus === 400, `${String(bad)} is refused with a 400`);
  }
  assert.equal(validEntityId('359'), true);
  assert.equal(validEntityId('0359'), false);
});

test('team identity is read from the payload, and only from the payload', () => {
  const team = parseTeamInfo(infoPayload(), reference);
  assert.deepEqual(team, {
    id: '359',
    name: 'Arsenal',
    shortName: 'Arsenal',
    location: 'Arsenal',
    abbreviation: 'ARS',
    slug: 'arsenal',
    logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png',
    colours: { primary: '#ef3e42', secondary: '#ffffff' },
    record: '12-3-2',
    standing: '3rd in Premier League',
    venue: 'Emirates Stadium',
    active: true,
    links: [
      { label: 'Arsenal', url: 'https://www.espn.com/soccer/team/_/id/359' },
      // A URL is normalised, so a bare host carries its trailing slash.
      { label: 'Official site', url: 'https://www.arsenal.com/' },
    ],
  });

  // A payload about another team is a provider error, not this team's data.
  assert.throws(() => parseTeamInfo(infoPayload({ id: 364 }), reference), /not confirmed/);
  assert.throws(() => parseTeamInfo({ team: { id: 359 } }, reference), /name not reported/i);
  assert.throws(() => parseTeamInfo({}, reference), /not confirmed/);
  assert.throws(() => parseTeamInfo(null, reference), /not confirmed/);

  // Nothing reported stays null: no invented record, standing, colours or crest.
  const sparse = parseTeamInfo({ team: { id: '359', displayName: 'Arsenal' } }, reference);
  assert.equal(sparse.record, null);
  assert.equal(sparse.standing, null);
  assert.equal(sparse.logo, null, 'a crest is never synthesised from an id or a code');
  assert.deepEqual(sparse.colours, { primary: null, secondary: null });
  assert.equal(sparse.venue, null);
  assert.equal(sparse.active, null);
  assert.deepEqual(sparse.links, []);

  // A record reported without the items wrapper is still read.
  assert.equal(parseTeamInfo({ team: { id: '359', displayName: 'Arsenal', record: { summary: '9-2' } } }, reference).record, '9-2');
  // A colour that is not bare hex is dropped rather than passed to a style.
  assert.deepEqual(parseTeamInfo(infoPayload({ color: 'red; background: url(x)' }), reference).colours.primary, null);
});

test('provider links are https, labelled, deduplicated and capped', () => {
  assert.equal(safeExternalUrl('https://www.espn.com/x'), 'https://www.espn.com/x');
  assert.equal(safeExternalUrl('http://www.espn.com/x'), null);
  assert.equal(safeExternalUrl('javascript:alert(1)'), null);
  assert.equal(safeExternalUrl('https://user:pass@espn.com/x'), null);
  assert.equal(safeExternalUrl(`https://espn.com/${'a'.repeat(2100)}`), null);
  assert.equal(safeExternalUrl(42), null);

  const links = entityLinks({ links: [
    { href: 'https://espn.com/a', text: 'A' },
    { href: 'https://espn.com/a', text: 'A again' },
    ...Array.from({ length: 10 }, (_, index) => ({ href: `https://espn.com/${index}`, text: `Link ${index}` })),
    { href: 'https://espn.com/unlabelled' },
  ] });
  assert.equal(links.length, 6, 'capped, deduplicated, and an unlabelled link is not shown');
  assert.equal(links[0].label, 'A');
});

const side = (id: number, name: string, over: Record<string, unknown> = {}) => ({
  id, homeAway: 'home', team: { id, displayName: name, abbreviation: name.slice(0, 3).toUpperCase() }, score: '0', ...over,
});

const schedulePayload = () => ({
  team: { id: 359 },
  season: { year: 2026 },
  league: { slug: 'eng.1', name: 'English Premier League' },
  events: [
    {
      id: 704123, date: '2026-11-08T17:30:00Z', season: { year: 2026 },
      competitions: [{
        date: '2026-11-08T17:30:00Z', league: { name: 'English Premier League' }, venue: { fullName: 'Emirates Stadium' },
        status: { type: { name: 'STATUS_FINAL', state: 'post', completed: true, detail: 'Full Time' } },
        competitors: [side(359, 'Arsenal', { homeAway: 'home', winner: true, score: '2' }), side(364, 'Chelsea', { homeAway: 'away', winner: false, score: '1' })],
      }],
    },
    {
      id: 704999, date: '2026-11-22T15:00:00Z', season: { year: 2026 },
      competitions: [{
        date: '2026-11-22T15:00:00Z', status: { type: { state: 'pre', detail: 'Scheduled' } },
        competitors: [side(367, 'Liverpool', { homeAway: 'home', score: '-' }), side(359, 'Arsenal', { homeAway: 'away', score: '-' })],
      }],
    },
    // Postponed: reported state and wording, never relabelled as a result.
    {
      id: 705000, date: '2026-11-25T19:45:00Z',
      competitions: [{
        date: '2026-11-25T19:45:00Z', status: { type: { state: 'post', detail: 'Postponed' } },
        competitors: [side(359, 'Arsenal', { homeAway: 'home' }), side(383, 'Everton', { homeAway: 'away' })],
      }],
    },
    // Junk the parser has to survive: no id, an unparsable date, no competitors, a repeat.
    { id: 'not-numeric', date: '2026-12-01T15:00:00Z', competitions: [{ competitors: [side(1, 'Nowhere')] }] },
    { id: 705999, date: 'soon', competitions: [{ competitors: [side(1, 'Nowhere')] }] },
    { id: 706000, date: '2026-12-05T15:00:00Z', competitions: [{ date: '2026-12-05T15:00:00Z', competitors: [] }] },
    { id: 704123, date: '2026-11-08T17:30:00Z', competitions: [{ date: '2026-11-08T17:30:00Z', competitors: [side(359, 'Arsenal'), side(364, 'Chelsea')] }] },
  ],
});

test('fixtures keep ESPN\u2019s own state, sides and scores', () => {
  const fixtures = parseTeamFixtures(schedulePayload(), reference);
  assert.deepEqual(fixtures.map((fixture) => fixture.id), ['704123', '704999', '705000'], 'junk and repeats are dropped');

  const [result, upcoming, postponed] = fixtures;
  assert.equal(result.state, 'post');
  assert.equal(result.statusText, 'Full Time');
  assert.equal(result.date, '2026-11-08T17:30:00.000Z');
  assert.equal(result.competition, 'English Premier League');
  assert.equal(result.season, 2026);
  assert.equal(result.venue, 'Emirates Stadium');
  assert.equal(result.side, 'home');
  assert.equal(result.home?.name, 'Arsenal');
  assert.equal(result.home?.score, '2');
  assert.equal(result.home?.winner, true);
  assert.equal(result.away?.name, 'Chelsea');
  assert.equal(result.away?.score, '1');
  assert.equal(result.away?.winner, false);
  assert.equal(result.opponent?.name, 'Chelsea', 'the opponent is the other confirmed side');
  assert.equal(result.opponent?.id, '364');

  // Reported "-" is not a score, and an away fixture still names its opponent.
  assert.equal(upcoming.state, 'pre');
  assert.equal(upcoming.side, 'away');
  assert.equal(upcoming.home?.score, null);
  assert.equal(upcoming.opponent?.name, 'Liverpool');

  // A postponed fixture keeps the state and wording ESPN reported.
  assert.equal(postponed.state, 'post');
  assert.equal(postponed.statusText, 'Postponed');

  // A schedule for another team is refused, and so is a payload with no events.
  assert.throws(() => parseTeamFixtures({ team: { id: 364 }, events: [] }, reference), /not confirmed/);
  assert.throws(() => parseTeamFixtures({ team: { id: 359 } }, reference), /events not reported/i);
  assert.deepEqual(parseTeamFixtures({ team: { id: 359 }, events: [] }, reference), []);

  // The list is bounded, so a decade of fixtures cannot flood a page.
  const many = { team: { id: 359 }, events: Array.from({ length: 200 }, (_, index) => ({
    id: String(800000 + index), date: `2026-11-${String((index % 28) + 1).padStart(2, '0')}T15:00:00Z`,
    competitions: [{ date: `2026-11-${String((index % 28) + 1).padStart(2, '0')}T15:00:00Z`, status: { type: { state: 'pre' } }, competitors: [side(359, 'Arsenal'), side(900000 + index, 'Opponent')] }],
  })) };
  assert.equal(parseTeamFixtures(many, reference).length, 60);
  assert.equal(parseTeamFixtures(many, reference, 5).length, 5);
});

const rosterPayload = () => ({
  team: { id: 359 },
  roster: [
    {
      athlete: {
        id: 233064, displayName: 'Bukayo Saka', jersey: '7',
        position: { id: 2, name: 'Forward', displayName: 'Forward', abbreviation: 'FW' },
        headshot: { href: 'https://a.espncdn.com/i/headshots/soccer/players/full/233064.png' },
        displayHeight: "5'10\"", displayWeight: '160 lbs', age: 24,
        experience: { years: 5, displayValue: '5 Yrs' },
        birthPlace: { city: 'London', country: 'England' },
        dateOfBirth: '2001-09-05',
      },
    },
    // No reported photo, and soccer gets none synthesised.
    { athlete: { id: 233065, displayName: 'Emile Smith Rowe', position: { name: 'Midfielder' }, height: 70, weight: 154 } },
    // No id: still a reported player, but nothing to link to.
    { athlete: { displayName: 'Reported Without An Id', jersey: '31', position: { abbreviation: 'GK' } } },
    // No name: dropped rather than rendered as a blank row.
    { athlete: { id: 233066, jersey: '99' } },
  ],
  // The same player arriving through a second holder is one squad entry.
  athletes: [{ athlete: { id: 233064, displayName: 'Bukayo Saka' } }],
});

test('a squad is read from whichever holder ESPN uses, and portraits are never invented', () => {
  const epl = meta('epl');
  const roster = parseTeamRoster(rosterPayload(), epl);
  assert.deepEqual(roster.map((player) => player.name), ['Bukayo Saka', 'Emile Smith Rowe', 'Reported Without An Id']);

  const [saka, rowWithoutPhoto, noId] = roster;
  assert.equal(saka.id, '233064');
  assert.equal(saka.position, 'FW');
  assert.equal(saka.jersey, '7');
  assert.equal(saka.headshot, 'https://a.espncdn.com/i/headshots/soccer/players/full/233064.png');
  assert.equal(saka.height, "5'10\"");
  assert.equal(saka.weight, '160 lbs');
  assert.equal(saka.age, 24);
  assert.equal(saka.experience, '5 Yrs');
  assert.equal(saka.nationality, 'England');
  assert.equal(saka.born, '2001-09-05');

  // A numeric height/weight is reported as text, and no photo means no photo:
  // ESPN's headshot CDN is not a soccer folder, and its ids are global, so the
  // same id under another league's folder is a different person's face.
  assert.equal(rowWithoutPhoto.headshot, null);
  assert.equal(rowWithoutPhoto.height, '70');
  assert.equal(rowWithoutPhoto.position, 'Midfielder');
  assert.equal(rowWithoutPhoto.age, null);
  assert.equal(rowWithoutPhoto.born, null);
  assert.equal(noId.id, null, 'a player with no reported id links nowhere');

  // The same reader under the NBA does use the headshot CDN, because there this
  // repository has established the folder holds that player.
  const nba = parseTeamRoster({ team: { id: 1001 }, roster: [{ athlete: { id: 3945274, displayName: 'Luka Dončić' } }] }, meta('nba'));
  assert.equal(nba[0].headshot, 'https://a.espncdn.com/i/headshots/nba/players/full/3945274.png');
  const nfl = parseTeamRoster({ team: { id: 1002 }, roster: [{ athlete: { id: 3916387, displayName: 'Lamar Jackson' } }] }, meta('nfl'));
  assert.equal(nfl[0].headshot, 'https://a.espncdn.com/i/headshots/nfl/players/full/3916387.png');
  // College basketball is not the NBA: no folder, no synthesised face.
  const college = parseTeamRoster({ team: { id: 1003 }, roster: [{ athlete: { id: 4432834, displayName: 'Zach Edey' } }] }, meta('ncaam'));
  assert.equal(college[0].headshot, null);

  assert.equal(cdnPortraits(meta('nba')), true);
  assert.equal(cdnPortraits(meta('nfl')), true);
  assert.equal(cdnPortraits(meta('epl')), false);
  assert.equal(cdnPortraits(meta('ncaam')), false);
  assert.equal(athletePortrait(meta('epl'), null, '233064'), null);
  assert.equal(athletePortrait(meta('epl'), 'javascript:alert(1)', '233064'), null);
  assert.equal(teamCrest({ logos: [{ href: 'https://a.espncdn.com/crest.png' }] }), 'https://a.espncdn.com/crest.png');
  assert.equal(teamCrest({ logo: 'data:image/png;base64,AAA' }), null);
  assert.equal(teamCrest({}), null);

  // Bounded, so an unexpectedly large payload cannot flood a page.
  const huge = { roster: Array.from({ length: 200 }, (_, index) => ({ athlete: { id: String(index + 1), displayName: `Player ${index}` } })) };
  assert.equal(parseTeamRoster(huge, epl).length, 60);
  assert.deepEqual(parseTeamRoster({}, epl), []);
  assert.deepEqual(parseTeamRoster(null, epl), []);
});

test('a board is accepted only when it is about the team that was asked for', () => {
  const board = {
    reference, leagueName: 'Premier League', sport: 'football', portraitsFromCdn: false,
    team: parseTeamInfo(infoPayload(), reference), fixtures: parseTeamFixtures(schedulePayload(), reference),
    roster: parseTeamRoster(rosterPayload(), meta('epl')), status: 'ready', fetchedAt: '2026-11-10T00:00:00.000Z',
    sources: [{ ok: true, part: 'info', url: 'https://site.api.espn.com/x', httpStatus: 200 }],
  };
  assert.equal(validTeamBoard(board, reference), true);
  assert.equal(validTeamBoard({ ...board, reference: { league: 'ucl', teamId: '359' } }, reference), false);
  assert.equal(validTeamBoard({ ...board, team: { ...board.team, id: '364' } }, reference), false);
  assert.equal(validTeamBoard({ ...board, status: 'unavailable' }, reference), false, 'a board with a team is not unavailable');
  assert.equal(validTeamBoard({ ...board, status: 'cached' }, reference), false);
  assert.equal(validTeamBoard({ ...board, fixtures: [{ id: 'abc', date: '2026-11-08' }] }, reference), false);
  assert.equal(validTeamBoard({ ...board, roster: [{ name: 42 }] }, reference), false);
  assert.equal(validTeamBoard({ ...board, portraitsFromCdn: 'yes' }, reference), false);
  assert.equal(validTeamBoard(null, reference), false);
  assert.equal(validTeamBoard({ ...board, sources: [{ ok: true, part: 'info' }] }, reference), false);
});
