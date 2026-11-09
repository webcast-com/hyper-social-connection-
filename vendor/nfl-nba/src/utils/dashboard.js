/** Display helpers shared by the dashboard pages. */

export function buildTeamLogoMap(games = [], standings = []) {
  const map = {};

  games.forEach((game) => {
    if (game.home && game.homeLogo) map[game.home] = game.homeLogo;
    if (game.away && game.awayLogo) map[game.away] = game.awayLogo;
  });

  standings.forEach((group) => {
    (group.rows ?? []).forEach((row) => {
      if (row.team && row.logo) map[row.team] = row.logo;
    });
  });

  return map;
}

export function seasonLabelFor(sport, meta = {}) {
  const year = meta?.seasonYear ?? meta?.year ?? null;
  if (!year) return sport === "football" ? "2025" : "2025-2026";
  return sport === "football" ? String(year) : `${year}-${year + 1}`;
}

export function competitionColors(competitions = []) {
  return competitions.reduce((map, competition) => {
    map[competition.id] = competition.color ?? null;
    return map;
  }, {});
}

const STATUS_ORDER = { LIVE: 0, UPCOMING: 1, FINAL: 2 };

/**
 * Live first, then what is about to start, then what is over. The sort is
 * stable, so games keep their league/feed order inside each group.
 */
export function sortByStatus(games = []) {
  return [...games].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3)
  );
}

const BOARD_DEFAULT_COMPETITION = { "/basketball": "nba", "/nfl": "nfl" };

/**
 * Match screen URL. Games outside the board's flagship league (college, EuroLeague…)
 * carry their competition so the commentary asks the right ESPN feed.
 */
export function matchPath(base, game) {
  if (!base || !game) return base ?? "";
  const competitionId = game.competitionId;
  const isFlagship = !competitionId || competitionId === BOARD_DEFAULT_COMPETITION[base];
  return `${base}/match/${game.id}${isFlagship ? "" : `?competition=${encodeURIComponent(competitionId)}`}`;
}

export function featuredGame(games = []) {
  if (!games.length) return null;
  return (
    games.find((game) => game.status === "LIVE") ??
    games.find((game) => game.status === "UPCOMING") ??
    games[0]
  );
}
