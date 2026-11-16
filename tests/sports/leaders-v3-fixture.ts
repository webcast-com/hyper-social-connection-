/**
 * ESPN's season-leaders payload as `site.api.espn.com/apis/site/v3/sports/
 * basketball/nba/leaders` serves it (read on 2026-11-15), cut down to the fields
 * and nesting the normalisers walk.
 *
 * What matters about the shape, and differs from the payload the older tests
 * use: the top-level `leaders` is an object, the statistics are its
 * `categories`, each category's own `leaders` is the list of players, and the
 * `team` sits on the entry beside the `athlete` rather than inside it. The link
 * and logo arrays are kept (shortened) because the normalisers walk every nested
 * value looking for leader lists and must not mistake any of them for one.
 */
const logos = (abbr: string) => [
  { href: `https://a.espncdn.com/i/teamlogos/nba/500/${abbr}.png`, width: 500, height: 500, rel: ['full', 'default'] },
  { href: `https://a.espncdn.com/i/teamlogos/nba/500-dark/${abbr}.png`, width: 500, height: 500, rel: ['full', 'dark'] },
];

const entry = (
  value: number,
  athlete: { id: string; name: string; jersey: string; position: string },
  team: { id: string; abbr: string; name: string },
) => ({
  displayValue: value.toFixed(1),
  value,
  rel: ['athlete'],
  athlete: {
    id: athlete.id,
    uid: `s:40~l:46~a:${athlete.id}`,
    displayName: athlete.name,
    fullName: athlete.name,
    shortName: athlete.name,
    jersey: athlete.jersey,
    links: [{ language: 'en', rel: ['playercard', 'desktop', 'athlete'], href: `https://www.espn.com/nba/player/_/id/${athlete.id}`, text: 'Player Card' }],
    headshot: { href: `https://a.espncdn.com/i/headshots/nba/players/full/${athlete.id}.png`, alt: athlete.name },
    position: { id: '3', name: 'Guard', displayName: 'Guard', abbreviation: athlete.position, leaf: false, slug: 'guard' },
    birthPlace: { city: 'Ljubljana', country: 'Slovenia' },
  },
  statistics: {},
  team: {
    id: team.id,
    slug: team.name.toLowerCase().replace(/\s+/g, '-'),
    abbreviation: team.abbr,
    displayName: team.name,
    color: '552583',
    logos: logos(team.abbr.toLowerCase()),
    links: [{ language: 'en', rel: ['clubhouse', 'desktop', 'team'], href: `https://www.espn.com/nba/team/_/name/${team.abbr.toLowerCase()}`, text: 'Clubhouse' }],
  },
});

const season = {
  year: 2027,
  displayName: '2026-27',
  type: { id: '2', type: 2, name: 'Regular Season', week: { number: 4, text: 'Week 4' } },
};

export const siteV3Leaders = {
  currentSeason: season,
  requestedSeason: season,
  leaders: {
    id: '0',
    name: 'Total',
    abbreviation: 'Total',
    categories: [
      {
        name: 'pointsPerGame',
        displayName: 'Points Per Game',
        abbreviation: 'PTS',
        leaders: [
          entry(38.6363639831543, { id: '3945274', name: 'Luka Doncic', jersey: '77', position: 'G' }, { id: '13', abbr: 'LAL', name: 'Los Angeles Lakers' }),
          entry(33.1, { id: '4278073', name: 'Shai Gilgeous-Alexander', jersey: '2', position: 'G' }, { id: '25', abbr: 'OKC', name: 'Oklahoma City Thunder' }),
        ],
      },
      {
        name: 'reboundsPerGame',
        displayName: 'Rebounds Per Game',
        abbreviation: 'REB',
        leaders: [
          entry(13.4, { id: '3112335', name: 'Nikola Jokic', jersey: '15', position: 'C' }, { id: '7', abbr: 'DEN', name: 'Denver Nuggets' }),
        ],
      },
    ],
  },
  league: { id: '46', name: 'National Basketball Association', abbreviation: 'NBA', slug: 'nba' },
};
