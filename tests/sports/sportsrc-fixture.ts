/**
 * SportSRC responses in the shapes its documentation gives
 * (https://sportsrc.org/docs/): `matches` grouped by league, `detail` with its
 * stream sources, `sports`. Invented fixtures; only the shapes are SportSRC's.
 */
export const NOW = Date.parse('2026-11-19T18:00:00Z');
const at = (minutes: number) => Math.floor(NOW / 1000) + minutes * 60;

const team = (name: string, code: string) => ({ name, code, color: '#123456', badge: `https://cdn.sportsrc.org/badges/${code.toLowerCase()}.png` });

export const ARSENAL_ID = 'arsenal-chelsea-ZjoxNTU2MTAx';
export const BARCA_ID = 'barcelona-real-madrid-ZjoxNTU2MTAy';
export const SOON_ID = 'newcastle-everton-ZjoxNTU2MTAz';
export const LATER_ID = 'psg-benfica-ZjoxNTU2MTA0';
export const DONE_ID = 'milan-napoli-ZjoxNTU2MTA1';
export const OFF_ID = 'monaco-lille-ZjoxNTU2MTA2';

export const matchesPayload = () => ({
  success: true,
  filters: { sport: 'football', status: '', date: '' },
  total_leagues: 3,
  total_matches: 6,
  data: [
    {
      league: { name: 'Premier League', country: 'England', flag: 'https://cdn.sportsrc.org/flags/england.png', logo: 'https://cdn.sportsrc.org/leagues/epl.png', has_standings: true, has_odds: true },
      matches: [
        {
          id: ARSENAL_ID, title: 'Arsenal vs Chelsea', timestamp: at(-70), status: 'inprogress', status_detail: '2nd half', round: 'Round 9',
          has_stats: true, has_highlights: false, teams: { home: team('Arsenal', 'ARS'), away: team('Chelsea', 'CHE') }, score: { home: 2, away: 1, display: '2 - 1' },
        },
        {
          id: SOON_ID, title: 'Newcastle vs Everton', timestamp: at(20), status: 'notstarted', status_detail: 'Not started', round: 'Round 9',
          teams: { home: team('Newcastle', 'NEW'), away: team('Everton', 'EVE') }, score: { home: 0, away: 0, display: '0 - 0' },
        },
        // Listed twice by the provider: the second copy is dropped.
        { id: SOON_ID, title: 'Newcastle vs Everton', timestamp: at(20), status: 'notstarted', teams: { home: team('Newcastle', 'NEW'), away: team('Everton', 'EVE') } },
        // No usable id: cannot be asked for, so it is not listed.
        { id: 'x y', title: 'Nobody vs No one', timestamp: at(0), status: 'inprogress' },
      ],
    },
    {
      league: { name: 'La Liga', country: 'Spain', flag: '', logo: 'http://insecure.example/laliga.png' },
      matches: [
        {
          id: BARCA_ID, title: 'Barcelona vs Real Madrid', timestamp: at(-24), status: 'inprogress', status_detail: '1st half', timer: "24'",
          teams: { home: { name: 'Barcelona', badge: 'javascript:alert(1)' }, away: team('Real Madrid', 'RMA') }, score: { home: 1, away: 0 },
        },
        {
          id: DONE_ID, title: 'AC Milan vs Napoli', timestamp: at(-320), status: 'finished', status_detail: 'Ended',
          teams: { home: team('AC Milan', 'MIL'), away: team('Napoli', 'NAP') }, score: { home: 2, away: 0 },
        },
      ],
    },
    {
      league: { name: 'Ligue 1', country: 'France' },
      matches: [
        {
          id: LATER_ID, title: 'PSG vs Benfica', timestamp: at(180), status: 'notstarted', status_detail: 'Not started',
          teams: { home: team('PSG', 'PSG'), away: team('Benfica', 'BEN') }, score: { home: 0, away: 0 },
        },
        {
          id: OFF_ID, title: 'Monaco vs Lille', timestamp: at(60), status: 'postponed', status_detail: 'Postponed',
          teams: { home: team('Monaco', 'ASM'), away: team('Lille', 'LIL') }, score: {},
        },
      ],
    },
  ],
});

export const detailPayload = (id: string = ARSENAL_ID) => ({
  success: true,
  data: {
    id,
    title: 'Arsenal vs Chelsea',
    timestamp: at(-70),
    status: 'inprogress',
    league: { name: 'Premier League', season: '2026/2027', round: 'Round 9', country: 'England' },
    venue: { stadium: 'Emirates Stadium', address: 'Hornsey Rd', city: 'London', country: 'England', capacity: 60383, surface: 'grass' },
    referee: { name: 'Michael Oliver', country: 'England' },
    managers: { home: { name: 'Mikel Arteta' }, away: { name: 'Enzo Maresca' } },
    sources: [
      { id: 'stream-1', streamNo: 1, embedUrl: `https://embed.example.com/?id=${id}&source=lola`, source: 'lola', hd: true, language: 'Unknown' },
      { id: 'stream-2', streamNo: 2, embedUrl: `https://embed.example.com/?id=${id}&source=hdtv`, source: 'hdtv', hd: false, language: 'English' },
      // Not https: never framed.
      { id: 'stream-3', streamNo: 3, embedUrl: `http://embed.example.com/?id=${id}&source=plain`, source: 'plain', hd: false },
      { id: 'stream-4', streamNo: 4, embedUrl: 'javascript:alert(1)', source: 'bad', hd: false },
      // The same address again adds nothing to the switcher.
      { id: 'stream-5', streamNo: 5, embedUrl: `https://embed.example.com/?id=${id}&source=lola`, source: 'lola', hd: true },
    ],
  },
});

export const sportsPayload = () => ({ success: true, count: 1, data: [{ id: 'football', name: 'Football', total: 140 }] });

/**
 * The same answers in the shape the service sends rather than the one its
 * documentation shows. Seen on the live site on 2026-11-19: `timestamp` is in
 * milliseconds, and the score is not under `score.home`. The nesting used here
 * (`score.current`, and `detail` under `data.match_info` beside `data.sources`)
 * is the one SportSRC's earlier version used; invented fixtures, as above.
 */
const atMs = (minutes: number) => NOW + minutes * 60_000;

export const servedMatchesPayload = () => ({
  success: true,
  total_leagues: 1,
  total_matches: 3,
  data: [
    {
      league: { name: 'Premier League', country: 'England', flag: '', logo: 'https://cdn.sportsrc.org/leagues/epl.png' },
      matches: [
        {
          id: ARSENAL_ID, title: 'Arsenal vs Chelsea', timestamp: atMs(-70), status: 'inprogress', status_detail: '2nd half', round: 'Round 9',
          teams: { home: team('Arsenal', 'ARS'), away: team('Chelsea', 'CHE') }, score: { current: { home: 2, away: 1 }, display: '2 - 1' },
        },
        {
          id: SOON_ID, title: 'Newcastle vs Everton', timestamp: atMs(20), status: 'notstarted', status_detail: 'Not started',
          teams: { home: team('Newcastle', 'NEW'), away: team('Everton', 'EVE') }, score: null,
        },
        {
          id: DONE_ID, title: 'AC Milan vs Napoli', timestamp: String(atMs(-320)), status: 'finished', status_detail: 'Ended',
          teams: { home: team('AC Milan', 'MIL'), away: team('Napoli', 'NAP') }, score: { display: '3 - 0' },
        },
      ],
    },
  ],
});

export const servedDetailPayload = (id: string = ARSENAL_ID, status = 'inprogress') => ({
  success: true,
  data: {
    match_info: {
      id,
      title: 'Arsenal vs Chelsea',
      timestamp: atMs(-70),
      status,
      status_detail: '2nd half',
      league: { name: 'Premier League', season: '2026/2027', round: 'Round 9', country: 'England' },
      teams: { home: team('Arsenal', 'ARS'), away: team('Chelsea', 'CHE') },
      score: { current: { home: 2, away: 1 }, display: '2 - 1' },
      venue: { stadium: 'Emirates Stadium', city: 'London' },
    },
    sources: [
      { id: 'stream-1', streamNo: 1, embedUrl: `https://embed.example.com/?id=${id}&source=lola`, source: 'lola', hd: true, language: 'English' },
      { id: 'stream-2', streamNo: 2, embedUrl: `https://embed.example.com/?id=${id}&source=hdtv`, source: 'hdtv', hd: false, language: 'Unknown' },
    ],
  },
});

/** The `stream` answer: sources only. */
export const streamPayload = (id: string = ARSENAL_ID) => ({
  success: true,
  data: [
    { id: 'stream-1', stream_no: 1, embed_url: `https://embed.example.com/?id=${id}&source=echo`, source_name: 'echo', quality: 'HD', language: 'English' },
    { id: 'stream-2', embedUrl: 'javascript:alert(1)', source_name: 'bad' },
  ],
});
