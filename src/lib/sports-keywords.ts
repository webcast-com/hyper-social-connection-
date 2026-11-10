import { DASHBOARD_COMPETITIONS, DASHBOARD_KEYWORDS, DASHBOARD_PLAYERS, DASHBOARD_TEAMS } from './dashboard-seo';

/**
 * Search keywords for the Hyper pages that talk about sports.
 *
 * The names come from the same competition, team and player data the sports
 * pages and the Basketball & NFL dashboard render, so the keywords describe
 * real coverage rather than an invented list. Google ignores the keywords tag,
 * but other crawlers and directory sites still read it, and the same lists feed
 * the richer page descriptions.
 */

/** Worldwide football competitions offered on the Hyper Sports board. */
export const FOOTBALL_COMPETITION_KEYWORDS = [
  'Premier League', 'Champions League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1',
  'Europa League', 'Conference League', 'Major League Soccer', 'Liga MX', 'Brasileirao',
  'CAF Champions League', 'Africa Cup of Nations', 'Kenyan Premier League', 'World Cup Qualifying',
  "Women's Super League", 'NWSL', 'A-League', 'Saudi Pro League', 'J1 League', 'Scottish Premiership',
  'Eredivisie', 'Primeira Liga', 'Turkish Super Lig', 'Argentine Primera Division', 'Copa Libertadores',
];

/** Other sports Hyper Sports covers besides basketball and football. */
export const OTHER_SPORT_KEYWORDS = [
  'Premiership Rugby', 'Six Nations', 'Super Rugby Pacific', 'Major League Baseball', 'National Hockey League',
  'Formula 1', 'NASCAR', 'MotoGP', 'American football',
];

/** Basketball competitions the Hyper Sports board lists. */
export const BASKETBALL_COMPETITION_KEYWORDS = [
  'NBA', 'WNBA', 'NCAA Men\'s Basketball', 'NCAA Women\'s Basketball', 'March Madness',
  'college basketball', 'NBA scores', 'basketball fixtures',
];

/** Sports keywords shared by the homepage and About page. */
export const SPORTS_KEYWORDS = [...new Set([
  ...FOOTBALL_COMPETITION_KEYWORDS,
  ...BASKETBALL_COMPETITION_KEYWORDS,
  ...OTHER_SPORT_KEYWORDS,
  'NBA', 'WNBA', 'NCAA basketball', 'NFL', 'college football',
  ...DASHBOARD_COMPETITIONS.slice(0, 40),
  ...DASHBOARD_TEAMS.slice(0, 60),
  ...DASHBOARD_PLAYERS,
  'live scores', 'sports fixtures', 'match results', 'standings', 'sports news',
])];

/** Keywords for the Hyper Sports board itself. */
export const SPORTS_BOARD_KEYWORDS = [...new Set([
  ...FOOTBALL_COMPETITION_KEYWORDS,
  ...BASKETBALL_COMPETITION_KEYWORDS,
  ...OTHER_SPORT_KEYWORDS,
  ...DASHBOARD_KEYWORDS.slice(0, 120),
  'worldwide sports scores', 'live football scores', 'live basketball scores', 'today\'s fixtures',
])];

/** A compact, human-readable summary of what the sports pages cover. */
export const SPORTS_COVERAGE_SENTENCE =
  'Football from the Premier League, Champions League, La Liga, Serie A, Bundesliga, MLS, Liga MX, the Brasileirao and the CAF Champions League, plus NBA, WNBA and NCAA basketball, rugby, American football, baseball, ice hockey and motorsport, with deeper basketball and NFL standings, top scorers and player pages in the Basketball & NFL dashboard.';
