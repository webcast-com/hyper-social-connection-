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
export type EspnLeague = Competition & { sport: string; league: string; excludeFromOdds?: boolean };

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
  // Expanded Sports scoreboards; keep the separate odds feed at its existing scope.
  // Identifiers are ESPN league slugs, not a guarantee of fixtures or standings.
  { sport: 'soccer', league: 'ken.1', kind: 'football', slug: 'kenya', name: 'Kenyan Premier League', region: 'africa', excludeFromOdds: true },
  { sport: 'soccer', league: 'uga.1', kind: 'football', slug: 'uganda', name: 'Ugandan Premier League', region: 'africa', excludeFromOdds: true },
  { sport: 'soccer', league: 'nga.1', kind: 'football', slug: 'nigeria', name: 'Nigerian Professional League', region: 'africa', excludeFromOdds: true },
  { sport: 'soccer', league: 'gha.1', kind: 'football', slug: 'ghana', name: 'Ghanaian Premier League', region: 'africa', excludeFromOdds: true },
  { sport: 'soccer', league: 'caf.nations', kind: 'football', slug: 'afcon', name: 'Africa Cup of Nations', region: 'africa', excludeFromOdds: true },
  { sport: 'soccer', league: 'caf.nations_qual', kind: 'football', slug: 'afcon-qualifying', name: 'Africa Cup of Nations Qualifying', region: 'africa', excludeFromOdds: true },
  { sport: 'soccer', league: 'bel.1', kind: 'football', slug: 'belgium', name: 'Belgian Pro League', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'aut.1', kind: 'football', slug: 'austria', name: 'Austrian Bundesliga', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'gre.1', kind: 'football', slug: 'greece', name: 'Greek Super League', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'den.1', kind: 'football', slug: 'denmark', name: 'Danish Superliga', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'nor.1', kind: 'football', slug: 'norway', name: 'Norwegian Eliteserien', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'swe.1', kind: 'football', slug: 'sweden', name: 'Swedish Allsvenskan', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'irl.1', kind: 'football', slug: 'ireland', name: 'Irish Premier Division', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'eng.3', kind: 'football', slug: 'league-one', name: 'English League One', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'esp.2', kind: 'football', slug: 'laliga2', name: 'Spanish La Liga 2', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'esp.w.1', kind: 'football', slug: 'liga-f', name: 'Spanish Liga F', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'uefa.euro', kind: 'football', slug: 'euro', name: 'UEFA European Championship', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'uefa.wchampions', kind: 'football', slug: 'womens-ucl', name: "UEFA Women's Champions League", region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'chi.1', kind: 'football', slug: 'chile', name: 'Chilean Primera Division', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'col.1', kind: 'football', slug: 'colombia', name: 'Colombian Primera A', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'ecu.1', kind: 'football', slug: 'ecuador', name: 'Ecuadorian LigaPro', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'per.1', kind: 'football', slug: 'peru', name: 'Peruvian Liga 1', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'uru.1', kind: 'football', slug: 'uruguay', name: 'Uruguayan Primera Division', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'conmebol.sudamericana', kind: 'football', slug: 'sudamericana', name: 'Copa Sudamericana', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'conmebol.america', kind: 'football', slug: 'copa-america', name: 'Copa America', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'concacaf.champions', kind: 'football', slug: 'concacaf-champions', name: 'Concacaf Champions Cup', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'chn.1', kind: 'football', slug: 'china', name: 'Chinese Super League', region: 'asia', excludeFromOdds: true },
  { sport: 'soccer', league: 'ind.1', kind: 'football', slug: 'india', name: 'Indian Super League', region: 'asia', excludeFromOdds: true },
  { sport: 'soccer', league: 'tha.1', kind: 'football', slug: 'thailand', name: 'Thai League 1', region: 'asia', excludeFromOdds: true },
  { sport: 'soccer', league: 'mys.1', kind: 'football', slug: 'malaysia', name: 'Malaysian Super League', region: 'asia', excludeFromOdds: true },
  { sport: 'soccer', league: 'idn.1', kind: 'football', slug: 'indonesia', name: 'Indonesian Liga 1', region: 'asia', excludeFromOdds: true },
  { sport: 'soccer', league: 'sgp.1', kind: 'football', slug: 'singapore', name: 'Singapore Premier League', region: 'asia', excludeFromOdds: true },
  { sport: 'soccer', league: 'afc.cup', kind: 'football', slug: 'afc-two', name: 'AFC Champions League Two', region: 'asia', excludeFromOdds: true },
  { sport: 'soccer', league: 'fifa.world', kind: 'football', slug: 'world-cup', name: 'FIFA World Cup', region: 'global', excludeFromOdds: true },
  // Additional worldwide leagues, domestic cups and international tournaments.
  { sport: 'soccer', league: 'zam.1', kind: 'football', slug: 'zambia', name: 'Zambian Super League', region: 'africa', excludeFromOdds: true },
  { sport: 'soccer', league: 'zim.1', kind: 'football', slug: 'zimbabwe', name: 'Zimbabwean Premier Soccer League', region: 'africa', excludeFromOdds: true },
  { sport: 'soccer', league: 'caf.championship', kind: 'football', slug: 'african-nations-championship', name: 'African Nations Championship', region: 'africa', excludeFromOdds: true },
  { sport: 'soccer', league: 'rsa.mtn8', kind: 'football', slug: 'south-africa-mtn8', name: 'South African MTN 8 Cup', region: 'africa', excludeFromOdds: true },
  { sport: 'soccer', league: 'sui.1', kind: 'football', slug: 'switzerland', name: 'Swiss Super League', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'cyp.1', kind: 'football', slug: 'cyprus', name: 'Cypriot First Division', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'eng.4', kind: 'football', slug: 'league-two', name: 'English League Two', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'eng.fa', kind: 'football', slug: 'fa-cup', name: 'English FA Cup', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'eng.league_cup', kind: 'football', slug: 'efl-cup', name: 'English League Cup', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'eng.w.fa', kind: 'football', slug: 'womens-fa-cup', name: "English Women's FA Cup", region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'ger.2', kind: 'football', slug: 'bundesliga2', name: 'German 2. Bundesliga', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'ger.dfb_pokal', kind: 'football', slug: 'german-cup', name: 'German Cup', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'fra.2', kind: 'football', slug: 'ligue2', name: 'French Ligue 2', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'fra.w.1', kind: 'football', slug: 'france-women', name: 'French Première Ligue', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'ita.2', kind: 'football', slug: 'serie-b', name: 'Italian Serie B', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'ita.coppa_italia', kind: 'football', slug: 'coppa-italia', name: 'Coppa Italia', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'ned.2', kind: 'football', slug: 'netherlands-second', name: 'Dutch Eerste Divisie', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'ned.w.1', kind: 'football', slug: 'netherlands-women', name: "Dutch Women's Eredivisie", region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'sco.2', kind: 'football', slug: 'scottish-championship', name: 'Scottish Championship', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'por.taca.portugal', kind: 'football', slug: 'portugal-cup', name: 'Taça de Portugal', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'uefa.nations', kind: 'football', slug: 'uefa-nations', name: 'UEFA Nations League', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'uefa.weuro', kind: 'football', slug: 'womens-euro', name: "UEFA Women's European Championship", region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'uefa.euro_u21', kind: 'football', slug: 'euro-u21', name: 'UEFA European Under-21 Championship', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'bol.1', kind: 'football', slug: 'bolivia', name: 'Bolivian Liga Profesional', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'par.1', kind: 'football', slug: 'paraguay', name: 'Paraguayan Primera Division', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'ven.1', kind: 'football', slug: 'venezuela', name: 'Venezuelan Primera Division', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'bra.2', kind: 'football', slug: 'brazil-serie-b', name: 'Brazilian Serie B', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'arg.copa', kind: 'football', slug: 'argentina-cup', name: 'Copa Argentina', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'can.w.nsl', kind: 'football', slug: 'canada-women', name: 'Canadian Northern Super League', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'usa.open', kind: 'football', slug: 'us-open-cup', name: 'U.S. Open Cup', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'usa.usl.1', kind: 'football', slug: 'usl-championship', name: 'USL Championship', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'concacaf.gold', kind: 'football', slug: 'gold-cup', name: 'Concacaf Gold Cup', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'concacaf.nations.league', kind: 'football', slug: 'concacaf-nations', name: 'Concacaf Nations League', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'conmebol.america.femenina', kind: 'football', slug: 'womens-copa-america', name: 'Copa América Femenina', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'ksa.kings.cup', kind: 'football', slug: 'saudi-kings-cup', name: "Saudi King's Cup", region: 'asia', excludeFromOdds: true },
  { sport: 'soccer', league: 'afc.asian.cup', kind: 'football', slug: 'asian-cup', name: 'AFC Asian Cup', region: 'asia', excludeFromOdds: true },
  { sport: 'soccer', league: 'aus.w.1', kind: 'football', slug: 'aleague-women', name: 'Australian A-League Women', region: 'oceania', excludeFromOdds: true },
  { sport: 'soccer', league: 'fifa.wwc', kind: 'football', slug: 'womens-world-cup', name: "FIFA Women's World Cup", region: 'global', excludeFromOdds: true },
  { sport: 'soccer', league: 'fifa.cwc', kind: 'football', slug: 'club-world-cup', name: 'FIFA Club World Cup', region: 'global', excludeFromOdds: true },
  { sport: 'soccer', league: 'fifa.worldq.uefa', kind: 'football', slug: 'world-cup-qualifying-europe', name: 'World Cup Qualifying - UEFA', region: 'europe', excludeFromOdds: true },
  { sport: 'soccer', league: 'fifa.worldq.afc', kind: 'football', slug: 'world-cup-qualifying-asia', name: 'World Cup Qualifying - AFC', region: 'asia', excludeFromOdds: true },
  { sport: 'soccer', league: 'fifa.worldq.concacaf', kind: 'football', slug: 'world-cup-qualifying-concacaf', name: 'World Cup Qualifying - Concacaf', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'fifa.worldq.conmebol', kind: 'football', slug: 'world-cup-qualifying-conmebol', name: 'World Cup Qualifying - CONMEBOL', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'fifa.worldq.ofc', kind: 'football', slug: 'world-cup-qualifying-ofc', name: 'World Cup Qualifying - OFC', region: 'oceania', excludeFromOdds: true },
  { sport: 'soccer', league: 'crc.1', kind: 'football', slug: 'costa-rica', name: 'Costa Rican Primera Division', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'gua.1', kind: 'football', slug: 'guatemala', name: 'Guatemalan Liga Nacional', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'hon.1', kind: 'football', slug: 'honduras', name: 'Honduran Liga Nacional', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'slv.1', kind: 'football', slug: 'el-salvador', name: 'Salvadoran Primera Division', region: 'americas', excludeFromOdds: true },
  { sport: 'soccer', league: 'jam.1', kind: 'football', slug: 'jamaica', name: 'Jamaican Premier League', region: 'americas', excludeFromOdds: true },
];

// Scores and fixtures use ESPN only. Do not advertise unsupported competitions.
export const SPORTS_COMPETITIONS: Competition[] = ESPN_LEAGUES;

/**
 * Fetch order only. With no filter applied the whole catalog is requested, so
 * these competitions are asked for first: they report fixtures on the most days,
 * which lets an unfiltered board fill in before the long tail of feeds answers.
 * Ordering never adds, removes or prioritizes a competition in the results.
 */
export const SPORTS_CORE_LEAGUES: readonly string[] = [
  'epl', 'laliga', 'seriea', 'bundesliga', 'ligue1', 'uel', 'ucl',
  'nba', 'wnba', 'ncaam', 'nfl', 'mlb', 'nhl', 'mls', 'caf', 'libertadores',
];

export function competitionRegion(slug: string) {
  return SPORTS_COMPETITIONS.find((league) => league.slug === slug)?.region;
}

export const SPORT_LABELS: Record<SportKind, string> = {
  football: 'Football', basketball: 'Basketball', 'american-football': 'American football',
  motorsport: 'Motorsport', tennis: 'Tennis', rugby: 'Rugby',
  baseball: 'Baseball', 'ice-hockey': 'Ice hockey', other: 'Other',
};
export const AVAILABLE_SPORTS = [...new Set(SPORTS_COMPETITIONS.map((league) => league.kind))];
