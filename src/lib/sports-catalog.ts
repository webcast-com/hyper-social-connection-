/** Provider competition identifiers, kept separate from fetching for use in filters. */
export type SportKind =
  | 'football' | 'basketball' | 'american-football' | 'motorsport'
  | 'tennis' | 'rugby' | 'baseball' | 'ice-hockey' | 'other';

export const SPORTS_REGIONS = [
  { id: 'africa', name: 'Africa' },
  { id: 'europe', name: 'Europe' },
  { id: 'americas', name: 'Americas' },
  { id: 'asia', name: 'Asia' },
  { id: 'oceania', name: 'Oceania' },
  { id: 'global', name: 'International' },
] as const;
export type SportsRegion = (typeof SPORTS_REGIONS)[number]['id'];

type Competition = { slug: string; name: string; kind: SportKind; region: SportsRegion };
export type EspnLeague = Competition & { sport: string; league: string };

// A configured competition is coverage, not a promise of fixtures today.
// Off-season, postponed fixtures and unavailable providers may return no events.
export const ESPN_LEAGUES: EspnLeague[] = [
  { sport: 'soccer', league: 'eng.1', kind: 'football', slug: 'epl', name: 'Premier League', region: 'europe' },
  { sport: 'soccer', league: 'esp.1', kind: 'football', slug: 'laliga', name: 'La Liga', region: 'europe' },
  { sport: 'soccer', league: 'ita.1', kind: 'football', slug: 'seriea', name: 'Serie A', region: 'europe' },
  { sport: 'soccer', league: 'ger.1', kind: 'football', slug: 'bundesliga', name: 'Bundesliga', region: 'europe' },
  { sport: 'soccer', league: 'fra.1', kind: 'football', slug: 'ligue1', name: 'Ligue 1', region: 'europe' },
  { sport: 'soccer', league: 'eng.2', kind: 'football', slug: 'championship', name: 'EFL Championship', region: 'europe' },
  { sport: 'soccer', league: 'ned.1', kind: 'football', slug: 'eredivisie', name: 'Eredivisie', region: 'europe' },
  { sport: 'soccer', league: 'por.1', kind: 'football', slug: 'primeira', name: 'Primeira Liga', region: 'europe' },
  { sport: 'soccer', league: 'sco.1', kind: 'football', slug: 'scottish', name: 'Scottish Premiership', region: 'europe' },
  { sport: 'soccer', league: 'tur.1', kind: 'football', slug: 'superlig', name: 'Turkish Super Lig', region: 'europe' },
  { sport: 'soccer', league: 'uefa.champions', kind: 'football', slug: 'ucl', name: 'Champions League', region: 'europe' },
  { sport: 'soccer', league: 'uefa.europa', kind: 'football', slug: 'uel', name: 'Europa League', region: 'europe' },
  { sport: 'soccer', league: 'uefa.europa.conf', kind: 'football', slug: 'uecl', name: 'Conference League', region: 'europe' },
  { sport: 'soccer', league: 'eng.w.1', kind: 'football', slug: 'wsl', name: "Women's Super League", region: 'europe' },
  { sport: 'soccer', league: 'caf.champions', kind: 'football', slug: 'caf', name: 'CAF Champions League', region: 'africa' },
  { sport: 'soccer', league: 'caf.confed', kind: 'football', slug: 'caf-confed', name: 'CAF Confederation Cup', region: 'africa' },
  { sport: 'soccer', league: 'rsa.1', kind: 'football', slug: 'south-africa', name: 'South African Premiership', region: 'africa' },
  { sport: 'soccer', league: 'fifa.worldq.caf', kind: 'football', slug: 'caf-world-cup', name: 'African World Cup Qualifying', region: 'africa' },
  { sport: 'soccer', league: 'usa.1', kind: 'football', slug: 'mls', name: 'Major League Soccer', region: 'americas' },
  { sport: 'soccer', league: 'usa.nwsl', kind: 'football', slug: 'nwsl', name: "National Women's Soccer League", region: 'americas' },
  { sport: 'soccer', league: 'mex.1', kind: 'football', slug: 'liga-mx', name: 'Liga MX', region: 'americas' },
  { sport: 'soccer', league: 'bra.1', kind: 'football', slug: 'brasileirao', name: 'Brazilian Serie A', region: 'americas' },
  { sport: 'soccer', league: 'arg.1', kind: 'football', slug: 'argentina', name: 'Argentine Primera Division', region: 'americas' },
  { sport: 'soccer', league: 'conmebol.libertadores', kind: 'football', slug: 'libertadores', name: 'Copa Libertadores', region: 'americas' },
  { sport: 'soccer', league: 'jpn.1', kind: 'football', slug: 'jleague', name: 'J1 League', region: 'asia' },
  { sport: 'soccer', league: 'ksa.1', kind: 'football', slug: 'saudi', name: 'Saudi Pro League', region: 'asia' },
  { sport: 'soccer', league: 'afc.champions', kind: 'football', slug: 'afc', name: 'AFC Champions League Elite', region: 'asia' },
  { sport: 'soccer', league: 'aus.1', kind: 'football', slug: 'aleague', name: 'A-League Men', region: 'oceania' },
  { sport: 'basketball', league: 'nba', kind: 'basketball', slug: 'nba', name: 'NBA', region: 'americas' },
  { sport: 'basketball', league: 'wnba', kind: 'basketball', slug: 'wnba', name: 'WNBA', region: 'americas' },
  { sport: 'basketball', league: 'mens-college-basketball', kind: 'basketball', slug: 'ncaam', name: "NCAA Men's Basketball", region: 'americas' },
  { sport: 'basketball', league: 'womens-college-basketball', kind: 'basketball', slug: 'ncaaw', name: "NCAA Women's Basketball", region: 'americas' },
  { sport: 'football', league: 'nfl', kind: 'american-football', slug: 'nfl', name: 'NFL', region: 'americas' },
  { sport: 'baseball', league: 'mlb', kind: 'baseball', slug: 'mlb', name: 'Major League Baseball', region: 'americas' },
  { sport: 'hockey', league: 'nhl', kind: 'ice-hockey', slug: 'nhl', name: 'NHL', region: 'americas' },
  { sport: 'rugby', league: '267979', kind: 'rugby', slug: 'prem-rugby', name: 'Premiership Rugby', region: 'europe' },
  { sport: 'rugby', league: '242041', kind: 'rugby', slug: 'super-rugby', name: 'Super Rugby Pacific', region: 'oceania' },
  { sport: 'racing', league: 'f1', kind: 'motorsport', slug: 'f1', name: 'Formula 1', region: 'global' },
];

// Scores and fixtures use ESPN only. Do not advertise unsupported competitions.
export const SPORTS_COMPETITIONS: Competition[] = ESPN_LEAGUES;

export function competitionRegion(slug: string) {
  return SPORTS_COMPETITIONS.find((league) => league.slug === slug)?.region;
}

export const SPORT_LABELS: Record<SportKind, string> = {
  football: 'Football', basketball: 'Basketball', 'american-football': 'American football',
  motorsport: 'Motorsport', tennis: 'Tennis', rugby: 'Rugby',
  baseball: 'Baseball', 'ice-hockey': 'Ice hockey', other: 'Other',
};
export const AVAILABLE_SPORTS = [...new Set(SPORTS_COMPETITIONS.map((league) => league.kind))];
