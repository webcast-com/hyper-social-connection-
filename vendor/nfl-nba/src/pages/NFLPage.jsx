import React, { useMemo, useState } from "react";
import {
  nflCompetitions as defaultCompetitions,
  nflCountries as defaultCountries,
  collegeFootballStandings,
} from "../data/sportsData";
import { LeagueSidebar } from "../components/LeagueSidebar";
import { MobileSectionTabs } from "../components/Shell";
import { DateRail, FeaturedGame, ScoreboardPanel } from "../components/Scoreboard";
import { PlayerDetails } from "../components/PlayerDetails";
import { StandingsPanel, StatTiles } from "../components/Standings";
import { useEspnFeed } from "../hooks/useEspnFeed";
import { buildWeekRail } from "../utils/dates";
import {
  buildTeamLogoMap,
  competitionColors,
  featuredGame,
  seasonLabelFor,
  sortByStatus,
} from "../utils/dashboard";

const MAX_WEEKS = { 1: 4, 2: 18, 3: 5 };
const SEASON_TYPE_BY_COMPETITION = { nfl: 2, preseason: 1, playoffs: 3, cfb: 2 };
const MAX_WEEKS_CFB = 15;

export default function NFLPage({
  games,
  competitions = defaultCompetitions,
  countries = defaultCountries,
  standings,
  leaders,
  stats,
  lastUpdated,
  live = true,
}) {
  const [competition, setCompetition] = useState("all");
  const [country, setCountry] = useState("All countries");
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [conference, setConference] = useState("All conferences");
  const [seasonType, setSeasonType] = useState(2);
  const [week, setWeek] = useState(null);

  const isControlled = Boolean(games || standings || leaders || stats);
  const college = competition === "cfb";
  // The college board is a season-long schedule, so it is fetched on demand and
  // without the NFL week/stage parameters.
  const feed = useEspnFeed({
    sport: "football",
    enabled: live && !isControlled,
    week: college ? undefined : week ?? undefined,
    seasonType: college ? undefined : seasonType,
    competition,
  });

  const activeGames = games ?? feed.games;
  const activeStandings = standings ?? (college ? collegeFootballStandings : null) ?? feed.standings;
  const activeLeaders = leaders ?? feed.leaders;
  const activeStats = stats ?? feed.stats;
  const source = games ? "demo" : feed.source;
  const updated = lastUpdated ?? (isControlled ? "custom dataset" : feed.label);

  const leagueColors = useMemo(() => competitionColors(competitions), [competitions]);
  const maxWeek = college ? MAX_WEEKS_CFB : MAX_WEEKS[seasonType] ?? 18;
  const currentWeek = Math.min(Math.max(week ?? feed.meta?.week ?? 1, 1), maxWeek);

  const filtered = useMemo(
    () =>
      sortByStatus(
        activeGames
          .filter(
            (game) =>
              (competition === "all" || game.competitionId === competition) &&
              (country === "All countries" ||
                (country === "International games"
                  ? game.country !== "United States"
                  : game.country === country)) &&
              (conference === "All conferences" || game.conference === conference) &&
              (status === "ALL" || game.status === status) &&
              `${game.home} ${game.away} ${game.competition}`
                .toLowerCase()
                .includes(search.toLowerCase())
          )
          .map((game) => ({ ...game, leagueColor: leagueColors[game.competitionId] }))
      ),
    [activeGames, competition, country, conference, status, search, leagueColors]
  );

  const hero = useMemo(() => featuredGame(filtered), [filtered]);
  const logoMap = useMemo(
    () => buildTeamLogoMap(activeGames, activeStandings),
    [activeGames, activeStandings]
  );

  const playerCards = useMemo(
    () => activeLeaders.map((player) => ({ ...player, teamLogo: player.teamLogo ?? logoMap[player.team] })),
    [activeLeaders, logoMap]
  );

  const weekRail = useMemo(() => buildWeekRail(maxWeek), [maxWeek]);

  const handleLeague = (id) => {
    if (competition === id) {
      setCompetition("all");
      setSeasonType(2);
      setWeek(null);
      return;
    }
    setCompetition(id);
    setSeasonType(SEASON_TYPE_BY_COMPETITION[id] ?? 2);
    setWeek(null);
  };

  const groups = [
    {
      title: "Conference",
      items: ["All conferences", "AFC", "NFC"].map((entry) => ({
        key: entry,
        label: entry,
        badge: entry === "All conferences" ? "ALL" : entry,
        color: entry === "AFC" ? "#c2410c" : entry === "NFC" ? "#1d4ed8" : "#475569",
        active: conference === entry,
        onClick: () => setConference(entry),
        ariaLabel: `Conference: ${entry}`,
      })),
    },
    {
      title: "International",
      items: countries
        .filter((entry) => entry !== "All countries")
        .map((entry) => ({
          key: entry,
          label: entry,
          active: country === entry,
          onClick: () => setCountry((current) => (current === entry ? "All countries" : entry)),
          ariaLabel: `Country: ${entry}`,
        })),
    },
  ];

  return (
    <main className="sh-dash">
      <h1 className="sh-sr-only">NFL Center</h1>

      <LeagueSidebar
        title="Competition"
        leagues={competitions.map((entry) => ({
          id: entry.id,
          name: entry.name,
          short: entry.short,
          color: entry.color,
        }))}
        activeLeague={competition}
        onLeague={handleLeague}
        groups={groups}
      />

      <div className="sh-center">
        <div id="section-live">
          <FeaturedGame game={hero} sport="football" />
        </div>

        <ScoreboardPanel
          games={filtered}
          note={`${filtered.length} matches`}
          seasonLabel={seasonLabelFor("football", feed.meta)}
          rail={
            college ? undefined : (
              <DateRail
                items={weekRail}
                activeKey={String(currentWeek)}
                onSelect={(key) => setWeek(Number(key))}
                label="Season week"
              />
            )
          }
          railReset={
            week === null || college
              ? undefined
              : { label: "This week", onClick: () => setWeek(null) }
          }
          status={status}
          onStatusChange={setStatus}
          search={search}
          onSearchChange={setSearch}
          sourceStatus={isControlled ? "custom" : feed.status}
          sourceLabel={isControlled ? "CUSTOM DATA" : feed.badge}
          onRefresh={isControlled ? undefined : feed.refresh}
          refreshing={feed.refreshing}
          matchBasePath="/nfl"
          emptyHint={`No games in week ${currentWeek} for these filters.`}
        />

        <div id="section-standings">
          <StandingsPanel
            groups={activeStandings}
            nfl
            note={
              college
                ? "Conference table"
                : source === "espn"
                  ? "ESPN standings"
                  : "Sample table"
            }
            teamBasePath="/nfl"
          />
        </div>
        <p className="sh-updated">Updated: {updated}</p>
      </div>

      <aside className="sh-right" id="section-players">
        <PlayerDetails
          linkBase="/nfl"
          viewAllHref="/nfl/top-scorers"
          leaders={playerCards}
          note={source === "espn" ? "ESPN leaders" : "Demo leaders"}
          sport="football"
        />
        <StatTiles stats={activeStats} title="League format" note="NFL structure" />
      </aside>

      <MobileSectionTabs />
    </main>
  );
}
