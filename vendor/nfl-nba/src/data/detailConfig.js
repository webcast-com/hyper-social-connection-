import { basketballScorers, nflScorers } from "./scorersData";
import {
  basketballGames,
  basketballLeaders,
  basketballStandings,
  collegeFootballStandings,
  ncaaBasketballStandings,
  ncaaWomenStandings,
  nflGames,
  nflLeaders,
  nflStandings,
} from "./sportsData";

function rosterAndScorers(leaders, boards) {
  const byName = new Map(leaders.map((player) => [player.name, player]));
  boards.forEach((board) => {
    board.entries.forEach((entry) => {
      if (!byName.has(entry.name)) byName.set(entry.name, { ...entry });
    });
  });
  return [...byName.values()];
}

/** Per-sport wiring for the team / player detail pages. */
export const DETAIL_SPORTS = {
  basketball: {
    sport: "basketball",
    games: basketballGames,
    standings: [...basketballStandings, ...ncaaBasketballStandings, ...ncaaWomenStandings],
    leaders: basketballLeaders,
    players: rosterAndScorers(basketballLeaders, basketballScorers),
    competitionId: "nba",
    leagueKey: "nba",
    hub: "/basketball",
    hubLabel: "Basketball",
    label: "NBA",
    nfl: false,
  },
  football: {
    sport: "football",
    games: nflGames,
    standings: [...nflStandings, ...collegeFootballStandings],
    leaders: nflLeaders,
    players: rosterAndScorers(nflLeaders, nflScorers),
    competitionId: "nfl",
    leagueKey: "nfl",
    hub: "/nfl",
    hubLabel: "Football",
    label: "NFL",
    nfl: true,
  },
};

export function detailSport(sport) {
  return DETAIL_SPORTS[sport] ?? DETAIL_SPORTS.basketball;
}
