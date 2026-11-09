const basketballCompetitionsSample = [
  // Africa
  { id: "bal", name: "Basketball Africa League", short: "BAL", color: "#22a06b", country: null, continent: "Africa", gender: "Men", espn: null },
  { id: "wbl-africa", name: "Women's Basketball League Africa", short: "WBL", color: "#d946ef", country: null, continent: "Africa", gender: "Women", espn: null },
  { id: "kenya-nbl", name: "Kenya National Basketball League", short: "KNBL", color: "#0f766e", country: "Kenya", continent: "Africa", gender: "Men", espn: null },
  { id: "kenya-wbl", name: "Kenya Women's Basketball League", short: "KWBL", color: "#be185d", country: "Kenya", continent: "Africa", gender: "Women", espn: null },
  { id: "nigeria-bpl", name: "Nigeria Basketball Premier League", short: "NBPL", color: "#15803d", country: "Nigeria", continent: "Africa", gender: "Men", espn: null },
  { id: "egypt-super", name: "Egyptian Basketball Super League", short: "EBSL", color: "#b91c1c", country: "Egypt", continent: "Africa", gender: "Men", espn: null },
  { id: "senegal-n1", name: "Senegal Nationale 1", short: "N1", color: "#ea580c", country: "Senegal", continent: "Africa", gender: "Men", espn: null },

  // Europe
  { id: "euroleague", name: "EuroLeague", short: "EL", color: "#f0a02a", country: null, continent: "Europe", gender: "Men", espn: "euroleague" },
  { id: "eurocup", name: "EuroCup", short: "EC", color: "#f97316", country: null, continent: "Europe", gender: "Men", espn: null },
  { id: "bcl", name: "Basketball Champions League", short: "BCL", color: "#f5b400", country: null, continent: "Europe", gender: "Men", espn: null },
  { id: "acb", name: "Liga ACB", short: "ACB", color: "#c8102e", country: "Spain", continent: "Europe", gender: "Men", espn: null },
  { id: "bbl", name: "BBL", short: "BBL", color: "#1e88e5", country: "Germany", continent: "Europe", gender: "Men", espn: null },
  { id: "lega-a", name: "Lega Basket Serie A", short: "LBA", color: "#0b6bb3", country: "Italy", continent: "Europe", gender: "Men", espn: null },
  { id: "lnb", name: "LNB Élite", short: "LNB", color: "#2563eb", country: "France", continent: "Europe", gender: "Men", espn: null },
  { id: "greek-league", name: "Greek Basket League", short: "GBL", color: "#0891b2", country: "Greece", continent: "Europe", gender: "Men", espn: null },
  { id: "aba-league", name: "ABA League", short: "ABA", color: "#7c3aed", country: "Serbia", continent: "Europe", gender: "Men", espn: null },
  { id: "euroleague-women", name: "EuroLeague Women", short: "ELW", color: "#c026d3", country: null, continent: "Europe", gender: "Women", espn: null },
  { id: "eurocup-women", name: "EuroCup Women", short: "ECW", color: "#db2777", country: null, continent: "Europe", gender: "Women", espn: null },
  { id: "fiba-eurobasket", name: "FIBA EuroBasket", short: "EB", color: "#0369a1", country: null, continent: "Europe", gender: "Men", espn: null },
  { id: "fiba-eurobasket-w", name: "FIBA Women's EuroBasket", short: "EBW", color: "#a21caf", country: null, continent: "Europe", gender: "Women", espn: null },

  // Asia
  { id: "cba", name: "CBA", short: "CBA", color: "#d32f2f", country: "China", continent: "Asia", gender: "Men", espn: null },
  { id: "b-league", name: "B.LEAGUE", short: "B1", color: "#dc2626", country: "Japan", continent: "Asia", gender: "Men", espn: null },
  { id: "kbl", name: "KBL", short: "KBL", color: "#1e40af", country: "South Korea", continent: "Asia", gender: "Men", espn: null },
  { id: "pba", name: "PBA", short: "PBA", color: "#1565c0", country: "Philippines", continent: "Asia", gender: "Men", espn: null },
  { id: "wjbl", name: "WJBL", short: "WJBL", color: "#be185d", country: "Japan", continent: "Asia", gender: "Women", espn: null },
  { id: "wcba", name: "WCBA", short: "WCBA", color: "#e11d48", country: "China", continent: "Asia", gender: "Women", espn: null },
  { id: "fiba-asia-cup", name: "FIBA Asia Cup", short: "FAC", color: "#0ea5e9", country: null, continent: "Asia", gender: "Men", espn: null },

  // North America
  { id: "nba", name: "NBA", short: "NBA", color: "#1d428a", country: "United States", continent: "North America", gender: "Men", espn: "nba" },
  { id: "wnba", name: "WNBA", short: "WNBA", color: "#e8590c", country: "United States", continent: "North America", gender: "Women", espn: "wnba" },
  { id: "nba-gleague", name: "NBA G League", short: "GLG", color: "#475569", country: "United States", continent: "North America", gender: "Men", espn: null },
  { id: "ncaam", name: "NCAA Men's Division I", short: "NCAAM", color: "#0f4c9c", country: "United States", continent: "North America", gender: "Men", espn: "mens-college-basketball" },
  { id: "ncaaw", name: "NCAA Women's Division I", short: "NCAAW", color: "#0e7490", country: "United States", continent: "North America", gender: "Women", espn: "womens-college-basketball" },

  // Oceania
  { id: "nbl", name: "NBL", short: "NBL", color: "#0b6bb3", country: "Australia", continent: "Oceania", gender: "Men", espn: "nbl" },
  { id: "wnbl", name: "WNBL", short: "WNBL", color: "#7e22ce", country: "Australia", continent: "Oceania", gender: "Women", espn: null },

  // South America
  { id: "bcla", name: "Basketball Champions League Americas", short: "BCLA", color: "#ea580c", country: null, continent: "South America", gender: "Men", espn: null },
  { id: "argentina-liga", name: "Liga Nacional Argentina", short: "LNA", color: "#0ea5e9", country: "Argentina", continent: "South America", gender: "Men", espn: null },

  // International
  { id: "fiba-wc", name: "FIBA Basketball World Cup", short: "WC", color: "#0284c7", country: null, continent: "International", gender: "Men", espn: null },
  { id: "fiba-wc-w", name: "FIBA Women's Basketball World Cup", short: "WWC", color: "#db2777", country: null, continent: "International", gender: "Women", espn: null },
  { id: "fiba-qualifiers", name: "FIBA World Cup Qualifiers", short: "Q", color: "#0369a1", country: null, continent: "International", gender: "Men", espn: null },
  { id: "fiba-oqt", name: "FIBA Olympic Qualifying Tournaments", short: "OQT", color: "#075985", country: null, continent: "International", gender: "Men", espn: null },
  { id: "fiba-3x3", name: "FIBA 3x3 World Tour", short: "3X3", color: "#f59e0b", country: null, continent: "International", gender: "Men", espn: null },
  { id: "fiba-3x3-w", name: "FIBA 3x3 Women's Series", short: "3X3W", color: "#ec4899", country: null, continent: "International", gender: "Women", espn: null },
];

export const basketballContinents = [
  "Africa", "Asia", "Europe", "International", "North America", "Oceania", "South America",
];

export const basketballCountries = [
  "All countries", "Argentina", "Australia", "China", "Egypt", "France", "Germany",
  "Greece", "Italy", "Japan", "Kenya", "Nigeria", "Philippines", "Senegal", "Serbia",
  "South Korea", "Spain", "United States",
];

/** Demo tip-offs ride the viewer's own clock so the sample never shows a stale fixed time. */
function demoTipoff(hour, minute, dayOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  if (dayOffset === 0 && date.getTime() <= Date.now()) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

/** Next occurrence of a weekday tip-off (0 = Sunday), in the viewer's local time. */
function nextWeekdayTipoff(weekday, hour, minute) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  let delta = (weekday - date.getDay() + 7) % 7;
  if (delta === 0 && date.getTime() <= Date.now()) delta = 7;
  date.setDate(date.getDate() + delta);
  return date.toISOString();
}

const basketballGamesSample = [
  { id: 1, competitionId: "nba", competition: "NBA", country: "United States", status: "LIVE", clock: "Q3 · 04:32", home: "Boston Celtics", away: "New York Knicks", homeCode: "BOS", awayCode: "NYK", homeScore: 84, awayScore: 79, venue: "TD Garden" },
  { id: 2, competitionId: "euroleague", competition: "EuroLeague", country: "Europe", status: "LIVE", clock: "Q4 · 07:18", home: "Real Madrid", away: "Olympiacos", homeCode: "RMA", awayCode: "OLY", homeScore: 72, awayScore: 68, venue: "WiZink Center" },
  { id: 3, competitionId: "bal", competition: "Basketball Africa League", country: "Africa", status: "UPCOMING", startTime: demoTipoff(20, 0), home: "Nairobi City Thunder", away: "Cape Town Tigers", homeCode: "NCT", awayCode: "CTT", homeScore: null, awayScore: null, venue: "Kigali Arena" },
  { id: 4, competitionId: "wnba", competition: "WNBA", country: "United States", status: "FINAL", clock: "Final", home: "Las Vegas Aces", away: "New York Liberty", homeCode: "LVA", awayCode: "NYL", homeScore: 91, awayScore: 87, venue: "Michelob ULTRA Arena" },
  { id: 5, competitionId: "acb", competition: "Liga ACB", country: "Spain", status: "UPCOMING", startTime: demoTipoff(19, 30, 1), home: "FC Barcelona", away: "Valencia Basket", homeCode: "BAR", awayCode: "VAL", homeScore: null, awayScore: null, venue: "Palau Blaugrana" },
  { id: 6, competitionId: "nbl", competition: "NBL", country: "Australia", status: "FINAL", clock: "Final", home: "Sydney Kings", away: "Melbourne United", homeCode: "SYD", awayCode: "MEL", homeScore: 98, awayScore: 102, venue: "Qudos Bank Arena" },
  { id: 7, competitionId: "ncaam", competition: "NCAA Men's Basketball", country: "United States", status: "LIVE", clock: "Q2 · 04:12", home: "Duke Blue Devils", away: "North Carolina Tar Heels", homeCode: "DUKE", awayCode: "UNC", homeScore: 68, awayScore: 65, venue: "Cameron Indoor Stadium" },
  { id: 8, competitionId: "ncaaw", competition: "NCAA Women's Basketball", country: "United States", status: "UPCOMING", startTime: demoTipoff(18, 30), home: "UConn Huskies", away: "South Carolina Gamecocks", homeCode: "CONN", awayCode: "SC", homeScore: null, awayScore: null, venue: "Gampel Pavilion" },
];

const basketballStandingsSample = [
  { group: "NBA · Eastern Conference", rows: [
    { team: "Boston Celtics", code: "BOS", p: 82, w: 61, l: 21, pct: ".744", gb: "—", streak: "W4" },
    { team: "New York Knicks", code: "NYK", p: 82, w: 50, l: 32, pct: ".610", gb: "11.0", streak: "W2" },
    { team: "Milwaukee Bucks", code: "MIL", p: 82, w: 49, l: 33, pct: ".598", gb: "12.0", streak: "L1" },
    { team: "Cleveland Cavaliers", code: "CLE", p: 82, w: 48, l: 34, pct: ".585", gb: "13.0", streak: "W1" },
  ]},
  { group: "NBA · Western Conference", rows: [
    { team: "Oklahoma City", code: "OKC", p: 82, w: 57, l: 25, pct: ".695", gb: "—", streak: "W3" },
    { team: "Denver Nuggets", code: "DEN", p: 82, w: 57, l: 25, pct: ".695", gb: "—", streak: "L1" },
    { team: "Minnesota", code: "MIN", p: 82, w: 56, l: 26, pct: ".683", gb: "1.0", streak: "W2" },
    { team: "LA Clippers", code: "LAC", p: 82, w: 51, l: 31, pct: ".622", gb: "6.0", streak: "W1" },
  ]},
];

const basketballLeadersSample = [
  { name: "Luka Dončić", team: "Dallas Mavericks", metric: "Points per game", value: "33.9", initials: "LD" },
  { name: "Nikola Jokić", team: "Denver Nuggets", metric: "Rebounds per game", value: "12.4", initials: "NJ" },
  { name: "Tyrese Haliburton", team: "Indiana Pacers", metric: "Assists per game", value: "10.9", initials: "TH" },
  { name: "Victor Wembanyama", team: "San Antonio Spurs", metric: "Blocks per game", value: "3.6", initials: "VW" },
];

export const basketballStats = [
  { label: "Games today", value: "18", foot: "Across selected competitions" },
  { label: "Live games", value: "06", foot: "Illustrative live count" },
  { label: "Competitions", value: "10", foot: "Sample competition list" },
  { label: "Countries / regions", value: "9", foot: "Sample coverage map" },
];

const nflCompetitionsSample = [
  { id: "nfl", name: "NFL", country: "United States", region: "North America" },
  { id: "preseason", name: "NFL Preseason", country: "United States", region: "North America" },
  { id: "playoffs", name: "NFL Playoffs", country: "United States", region: "North America" },
  { id: "cfb", name: "College Football", country: "United States", region: "North America" },
];

export const nflCountries = ["All countries", "United States", "International games"];

const nflGamesSample = [
  { id: 11, competitionId: "nfl", competition: "NFL", country: "United States", conference: "AFC", status: "LIVE", clock: "3rd · 08:41", home: "Kansas City Chiefs", away: "Buffalo Bills", homeCode: "KC", awayCode: "BUF", homeScore: 24, awayScore: 20, venue: "Arrowhead Stadium" },
  { id: 12, competitionId: "nfl", competition: "NFL", country: "United States", conference: "NFC", status: "LIVE", clock: "2nd · 02:15", home: "San Francisco 49ers", away: "Dallas Cowboys", homeCode: "SF", awayCode: "DAL", homeScore: 14, awayScore: 10, venue: "Levi's Stadium" },
  { id: 13, competitionId: "playoffs", competition: "NFL Playoffs", country: "United States", conference: "AFC", status: "UPCOMING", startTime: nextWeekdayTipoff(0, 20, 20), home: "Baltimore Ravens", away: "Cincinnati Bengals", homeCode: "BAL", awayCode: "CIN", homeScore: null, awayScore: null, venue: "M&T Bank Stadium" },
  { id: 14, competitionId: "nfl", competition: "NFL", country: "United States", conference: "NFC", status: "FINAL", clock: "Final", home: "Detroit Lions", away: "Green Bay Packers", homeCode: "DET", awayCode: "GB", homeScore: 31, awayScore: 27, venue: "Ford Field" },
  { id: 15, competitionId: "cfb", competition: "College Football", country: "United States", conference: "SEC", status: "UPCOMING", startTime: nextWeekdayTipoff(6, 19, 30), home: "Alabama Crimson Tide", away: "Georgia Bulldogs", homeCode: "ALA", awayCode: "UGA", homeScore: null, awayScore: null, venue: "Bryant-Denny Stadium" },
];

const nflStandingsSample = [
  { group: "AFC East", rows: [
    { team: "Buffalo Bills", code: "BUF", p: 17, w: 11, l: 6, t: 0, pct: ".647", pf: 451, pa: 311 },
    { team: "Miami Dolphins", code: "MIA", p: 17, w: 11, l: 6, t: 0, pct: ".647", pf: 496, pa: 391 },
    { team: "New York Jets", code: "NYJ", p: 17, w: 7, l: 10, t: 0, pct: ".412", pf: 268, pa: 355 },
    { team: "New England", code: "NE", p: 17, w: 4, l: 13, t: 0, pct: ".235", pf: 236, pa: 366 },
  ]},
  { group: "AFC West", rows: [
    { team: "Kansas City Chiefs", code: "KC", p: 17, w: 11, l: 6, t: 0, pct: ".647", pf: 371, pa: 294 },
    { team: "Las Vegas Raiders", code: "LV", p: 17, w: 8, l: 9, t: 0, pct: ".471", pf: 332, pa: 331 },
    { team: "Denver Broncos", code: "DEN", p: 17, w: 8, l: 9, t: 0, pct: ".471", pf: 357, pa: 413 },
    { team: "LA Chargers", code: "LAC", p: 17, w: 5, l: 12, t: 0, pct: ".294", pf: 346, pa: 398 },
  ]},
  { group: "NFC East", rows: [
    { team: "Dallas Cowboys", code: "DAL", p: 17, w: 12, l: 5, t: 0, pct: ".706", pf: 509, pa: 315 },
    { team: "Philadelphia Eagles", code: "PHI", p: 17, w: 11, l: 6, t: 0, pct: ".647", pf: 433, pa: 428 },
    { team: "NY Giants", code: "NYG", p: 17, w: 6, l: 11, t: 0, pct: ".353", pf: 266, pa: 407 },
    { team: "Washington", code: "WAS", p: 17, w: 4, l: 13, t: 0, pct: ".235", pf: 329, pa: 518 },
  ]},
  { group: "NFC West", rows: [
    { team: "San Francisco 49ers", code: "SF", p: 17, w: 12, l: 5, t: 0, pct: ".706", pf: 491, pa: 298 },
    { team: "LA Rams", code: "LAR", p: 17, w: 10, l: 7, t: 0, pct: ".588", pf: 404, pa: 377 },
    { team: "Seattle Seahawks", code: "SEA", p: 17, w: 9, l: 8, t: 0, pct: ".529", pf: 364, pa: 402 },
    { team: "Arizona Cardinals", code: "ARI", p: 17, w: 4, l: 13, t: 0, pct: ".235", pf: 330, pa: 455 },
  ]},
];

const ncaaMensStandingsSample = [
  { group: "ACC", rows: [
    { team: "Duke Blue Devils", code: "DUKE", p: 31, w: 24, l: 7, pct: ".774", gb: "—", streak: "W5" },
    { team: "North Carolina Tar Heels", code: "UNC", p: 31, w: 22, l: 9, pct: ".710", gb: "2.0", streak: "L1" },
    { team: "Clemson Tigers", code: "CLEM", p: 31, w: 21, l: 10, pct: ".677", gb: "3.0", streak: "W2" },
    { team: "Virginia Cavaliers", code: "UVA", p: 31, w: 19, l: 12, pct: ".613", gb: "5.0", streak: "L2" },
  ]},
  { group: "Big Ten", rows: [
    { team: "Purdue Boilermakers", code: "PUR", p: 31, w: 26, l: 5, pct: ".839", gb: "—", streak: "W7" },
    { team: "Michigan State Spartans", code: "MSU", p: 31, w: 23, l: 8, pct: ".742", gb: "3.0", streak: "W3" },
    { team: "Illinois Fighting Illini", code: "ILL", p: 31, w: 21, l: 10, pct: ".677", gb: "5.0", streak: "L1" },
    { team: "Wisconsin Badgers", code: "WIS", p: 31, w: 20, l: 11, pct: ".645", gb: "6.0", streak: "W1" },
  ]},
  { group: "SEC", rows: [
    { team: "Tennessee Volunteers", code: "TENN", p: 31, w: 25, l: 6, pct: ".806", gb: "—", streak: "W4" },
    { team: "Auburn Tigers", code: "AUB", p: 31, w: 24, l: 7, pct: ".774", gb: "1.0", streak: "W2" },
    { team: "Kentucky Wildcats", code: "UK", p: 31, w: 22, l: 9, pct: ".710", gb: "3.0", streak: "L1" },
    { team: "Alabama Crimson Tide", code: "ALA", p: 31, w: 21, l: 10, pct: ".677", gb: "4.0", streak: "W1" },
  ]},
  { group: "Big 12", rows: [
    { team: "Houston Cougars", code: "HOU", p: 31, w: 27, l: 4, pct: ".871", gb: "—", streak: "W9" },
    { team: "Kansas Jayhawks", code: "KU", p: 31, w: 23, l: 8, pct: ".742", gb: "4.0", streak: "W2" },
    { team: "Baylor Bears", code: "BAY", p: 31, w: 21, l: 10, pct: ".677", gb: "6.0", streak: "L2" },
    { team: "Iowa State Cyclones", code: "ISU", p: 31, w: 20, l: 11, pct: ".645", gb: "7.0", streak: "W1" },
  ]},
];

const ncaaWomenStandingsSample = [
  { group: "SEC", rows: [
    { team: "South Carolina Gamecocks", code: "SC", p: 32, w: 30, l: 2, pct: ".938", gb: "—", streak: "W12" },
    { team: "LSU Tigers", code: "LSU", p: 32, w: 27, l: 5, pct: ".844", gb: "3.0", streak: "W4" },
    { team: "Tennessee Lady Volunteers", code: "TENN", p: 32, w: 23, l: 9, pct: ".719", gb: "7.0", streak: "L1" },
    { team: "Ole Miss Rebels", code: "MISS", p: 32, w: 21, l: 11, pct: ".656", gb: "9.0", streak: "W2" },
  ]},
  { group: "Big East", rows: [
    { team: "UConn Huskies", code: "CONN", p: 32, w: 29, l: 3, pct: ".906", gb: "—", streak: "W15" },
    { team: "Creighton Bluejays", code: "CREI", p: 32, w: 24, l: 8, pct: ".750", gb: "5.0", streak: "W3" },
    { team: "Marquette Golden Eagles", code: "MARQ", p: 32, w: 21, l: 11, pct: ".656", gb: "8.0", streak: "L2" },
    { team: "Villanova Wildcats", code: "VILL", p: 32, w: 19, l: 13, pct: ".594", gb: "10.0", streak: "W1" },
  ]},
  { group: "ACC", rows: [
    { team: "Notre Dame Fighting Irish", code: "ND", p: 32, w: 26, l: 6, pct: ".813", gb: "—", streak: "W6" },
    { team: "NC State Wolfpack", code: "NCST", p: 32, w: 24, l: 8, pct: ".750", gb: "2.0", streak: "W2" },
    { team: "Louisville Cardinals", code: "LOU", p: 32, w: 22, l: 10, pct: ".688", gb: "4.0", streak: "L1" },
    { team: "Florida State Seminoles", code: "FSU", p: 32, w: 20, l: 12, pct: ".625", gb: "6.0", streak: "W1" },
  ]},
  { group: "Big Ten", rows: [
    { team: "UCLA Bruins", code: "UCLA", p: 32, w: 27, l: 5, pct: ".844", gb: "—", streak: "W8" },
    { team: "Iowa Hawkeyes", code: "IOWA", p: 32, w: 25, l: 7, pct: ".781", gb: "2.0", streak: "W3" },
    { team: "Ohio State Buckeyes", code: "OSU", p: 32, w: 22, l: 10, pct: ".688", gb: "5.0", streak: "L2" },
    { team: "Indiana Hoosiers", code: "IND", p: 32, w: 19, l: 13, pct: ".594", gb: "8.0", streak: "W1" },
  ]},
];

const collegeFootballStandingsSample = [
  { group: "SEC", rows: [
    { team: "Georgia Bulldogs", code: "UGA", p: 12, w: 11, l: 1, t: 0, pct: ".917", pf: 448, pa: 196 },
    { team: "Alabama Crimson Tide", code: "ALA", p: 12, w: 10, l: 2, t: 0, pct: ".833", pf: 431, pa: 231 },
    { team: "Texas Longhorns", code: "TEX", p: 12, w: 10, l: 2, t: 0, pct: ".833", pf: 402, pa: 214 },
    { team: "Ole Miss Rebels", code: "MISS", p: 12, w: 9, l: 3, t: 0, pct: ".750", pf: 421, pa: 260 },
  ]},
  { group: "Big Ten", rows: [
    { team: "Ohio State Buckeyes", code: "OSU", p: 12, w: 11, l: 1, t: 0, pct: ".917", pf: 469, pa: 158 },
    { team: "Oregon Ducks", code: "ORE", p: 12, w: 11, l: 1, t: 0, pct: ".917", pf: 462, pa: 201 },
    { team: "Penn State Nittany Lions", code: "PSU", p: 12, w: 10, l: 2, t: 0, pct: ".833", pf: 405, pa: 189 },
    { team: "Michigan Wolverines", code: "MICH", p: 12, w: 8, l: 4, t: 0, pct: ".667", pf: 322, pa: 245 },
  ]},
  { group: "ACC", rows: [
    { team: "Clemson Tigers", code: "CLEM", p: 12, w: 10, l: 2, t: 0, pct: ".833", pf: 398, pa: 221 },
    { team: "Miami Hurricanes", code: "MIA", p: 12, w: 10, l: 2, t: 0, pct: ".833", pf: 412, pa: 240 },
    { team: "SMU Mustangs", code: "SMU", p: 12, w: 9, l: 3, t: 0, pct: ".750", pf: 379, pa: 268 },
    { team: "Louisville Cardinals", code: "LOU", p: 12, w: 8, l: 4, t: 0, pct: ".667", pf: 341, pa: 279 },
  ]},
  { group: "Big 12", rows: [
    { team: "Kansas State Wildcats", code: "KSU", p: 12, w: 9, l: 3, t: 0, pct: ".750", pf: 356, pa: 244 },
    { team: "Iowa State Cyclones", code: "ISU", p: 12, w: 9, l: 3, t: 0, pct: ".750", pf: 318, pa: 219 },
    { team: "BYU Cougars", code: "BYU", p: 12, w: 8, l: 4, t: 0, pct: ".667", pf: 344, pa: 271 },
    { team: "Utah Utes", code: "UTAH", p: 12, w: 7, l: 5, t: 0, pct: ".583", pf: 307, pa: 288 },
  ]},
];

const nflLeadersSample = [
  { name: "Lamar Jackson", team: "Baltimore Ravens", metric: "Passing yards", value: "3,678", initials: "LJ" },
  { name: "Christian McCaffrey", team: "San Francisco 49ers", metric: "Rushing yards", value: "1,459", initials: "CM" },
  { name: "Tyreek Hill", team: "Miami Dolphins", metric: "Receiving yards", value: "1,799", initials: "TH" },
  { name: "Myles Garrett", team: "Cleveland Browns", metric: "Sacks", value: "14.0", initials: "MG" },
];

export const nflStats = [
  { label: "NFL teams", value: "32", foot: "AFC 16 · NFC 16" },
  { label: "Divisions", value: "08", foot: "Four in each conference" },
  { label: "Games per team", value: "17", foot: "Regular-season format" },
  { label: "Playoff places", value: "14", foot: "Seven per conference" },
];


// ---------------------------------------------------------------------------
// Presentation metadata for the demo data (team logos, broadcasters, badges)
// ---------------------------------------------------------------------------

const teamLogo = (league, code) => `https://a.espncdn.com/i/teamlogos/${league}/500/${code}.png`;

const TEAM_LOGOS = {
  "Boston Celtics": teamLogo("nba", "bos"),
  "New York Knicks": teamLogo("nba", "nyk"),
  "Milwaukee Bucks": teamLogo("nba", "mil"),
  "Cleveland Cavaliers": teamLogo("nba", "cle"),
  "Oklahoma City": teamLogo("nba", "okc"),
  "Denver Nuggets": teamLogo("nba", "den"),
  Minnesota: teamLogo("nba", "min"),
  "LA Clippers": teamLogo("nba", "lac"),
  "Kansas City Chiefs": teamLogo("nfl", "kc"),
  "Buffalo Bills": teamLogo("nfl", "buf"),
  "San Francisco 49ers": teamLogo("nfl", "sf"),
  "Dallas Cowboys": teamLogo("nfl", "dal"),
  "Baltimore Ravens": teamLogo("nfl", "bal"),
  "Cincinnati Bengals": teamLogo("nfl", "cin"),
  "Detroit Lions": teamLogo("nfl", "det"),
  "Green Bay Packers": teamLogo("nfl", "gb"),
  "Miami Dolphins": teamLogo("nfl", "mia"),
  "New York Jets": teamLogo("nfl", "nyj"),
  "New England": teamLogo("nfl", "ne"),
  "Las Vegas Raiders": teamLogo("nfl", "lv"),
  "Denver Broncos": teamLogo("nfl", "den"),
  "LA Chargers": teamLogo("nfl", "lac"),
  "Philadelphia Eagles": teamLogo("nfl", "phi"),
  "NY Giants": teamLogo("nfl", "nyg"),
  Washington: teamLogo("nfl", "wsh"),
  "LA Rams": teamLogo("nfl", "lar"),
  "Seattle Seahawks": teamLogo("nfl", "sea"),
  "Arizona Cardinals": teamLogo("nfl", "ari"),
};

const BASKETBALL_BROADCASTS = {
  nba: "ESPN",
  ncaam: "ESPN",
  ncaaw: "ESPN2",
  wnba: "ESPN2",
  acb: "Movistar+",
  nbl: "ESPN",
  euroleague: "EuroLeague TV",
  bal: "BAL TV",
  bbl: "Dyn",
  bcl: "BCL TV",
  cba: "CCTV-5",
  pba: "PBA Rush",
};

const NFL_BROADCASTS = {
  nfl: "NFL Network",
  preseason: "NFL Network",
  playoffs: "CBS",
  cfb: "ABC",
};

const COMPETITION_META = {
  nba: { short: "NBA", color: "#1d428a" },
  wnba: { short: "WNBA", color: "#e8590c" },
  euroleague: { short: "EL", color: "#f0a02a" },
  acb: { short: "ACB", color: "#c8102e" },
  bbl: { short: "BBL", color: "#1e88e5" },
  bcl: { short: "BCL", color: "#f5b400" },
  bal: { short: "BAL", color: "#22a06b" },
  nbl: { short: "NBL", color: "#0b6bb3" },
  cba: { short: "CBA", color: "#d32f2f" },
  pba: { short: "PBA", color: "#1565c0" },
  ncaam: { short: "NCAAM", color: "#0f4c9c" },
  ncaaw: { short: "NCAAW", color: "#0e7490" },
  cfb: { short: "CFB", color: "#7c2d12" },
  nfl: { short: "NFL", color: "#1b3a6b" },
  preseason: { short: "PRE", color: "#3b6ea5" },
  playoffs: { short: "POST", color: "#b8860b" },
};

const PLAYER_META = {
  "Luka Dončić": { position: "PG", teamAbbr: "DAL" },
  "Nikola Jokić": { position: "C", teamAbbr: "DEN" },
  "Tyrese Haliburton": { position: "PG", teamAbbr: "IND" },
  "Victor Wembanyama": { position: "C", teamAbbr: "SAS" },
  "Lamar Jackson": { position: "QB", teamAbbr: "BAL" },
  "Christian McCaffrey": { position: "RB", teamAbbr: "SF" },
  "Tyreek Hill": { position: "WR", teamAbbr: "MIA" },
  "Myles Garrett": { position: "DE", teamAbbr: "CLE" },
};

const withLogos = (games, broadcasts) =>
  games.map((game) => ({
    ...game,
    homeLogo: TEAM_LOGOS[game.home] ?? null,
    awayLogo: TEAM_LOGOS[game.away] ?? null,
    broadcast: game.broadcast ?? broadcasts[game.competitionId] ?? "—",
  }));

const withLeagueMeta = (competitions) =>
  competitions.map((competition) => ({
    ...COMPETITION_META[competition.id],
    ...competition,
    region: competition.region ?? competition.continent ?? null,
  }));

const withTeamLogos = (groups) =>
  groups.map((group) => ({
    ...group,
    rows: group.rows.map((row) => ({ ...row, logo: TEAM_LOGOS[row.team] ?? null })),
  }));

const withPlayerMeta = (leaders) =>
  leaders.map((player) => ({ ...player, ...PLAYER_META[player.name] }));

export const basketballCompetitions = withLeagueMeta(basketballCompetitionsSample);
export const basketballGames = withLogos(basketballGamesSample, BASKETBALL_BROADCASTS);
export const basketballStandings = withTeamLogos(basketballStandingsSample);
export const basketballLeaders = withPlayerMeta(basketballLeadersSample);

export const nflCompetitions = withLeagueMeta(nflCompetitionsSample);
export const nflGames = withLogos(nflGamesSample, NFL_BROADCASTS);
export const nflStandings = withTeamLogos(nflStandingsSample);
export const ncaaBasketballStandings = withTeamLogos(ncaaMensStandingsSample);
export const ncaaWomenStandings = withTeamLogos(ncaaWomenStandingsSample);
export const collegeFootballStandings = withTeamLogos(collegeFootballStandingsSample);
export const nflLeaders = withPlayerMeta(nflLeadersSample);
