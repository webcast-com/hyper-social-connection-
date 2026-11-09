import React, { useMemo, useState } from "react";
import {
  basketballCompetitions as defaultCompetitions,
  ncaaBasketballStandings,
  ncaaWomenStandings,
} from "../data/sportsData";
import { LeagueSidebar } from "../components/LeagueSidebar";
import { MobileSectionTabs } from "../components/Shell";
import { DateRail, FeaturedGame, ScoreboardPanel } from "../components/Scoreboard";
import { PlayerDetails } from "../components/PlayerDetails";
import { StandingsPanel, StatTiles } from "../components/Standings";
import { useEspnFeed } from "../hooks/useEspnFeed";
import {
  buildDateRail,
  buildSeasonOptions,
  formatDateKeyLabel,
  seasonLabel,
  seasonSampleDate,
  seasonStartForDate,
  toDateKey,
} from "../utils/dates";
import {
  buildTeamLogoMap,
  competitionColors,
  featuredGame,
  sortByStatus,
} from "../utils/dashboard";

const CONTINENTS = [
  "Africa",
  "Asia",
  "Europe",
  "International",
  "North America",
  "Oceania",
  "South America",
];

const CONTINENT_BADGES = {
  Africa: "AF",
  Asia: "AS",
  Europe: "EU",
  International: "INT",
  "North America": "NA",
  Oceania: "OC",
  "South America": "SA",
};

const CONTINENT_COLORS = {
  Africa: "#22a06b",
  Asia: "#0ea5e9",
  Europe: "#8b7cf6",
  International: "#f59e0b",
  "North America": "#1d428a",
  Oceania: "#0b6bb3",
  "South America": "#ea580c",
};

const GENDERS = ["All genders", "Men", "Women"];
const GENDER_BADGES = { "All genders": "ALL", Men: "M", Women: "W" };
const GENDER_COLORS = { "All genders": "#475569", Men: "#1d4ed8", Women: "#be185d" };

export default function BasketballPage({
  games,
  competitions = defaultCompetitions,
  countries,
  standings,
  leaders,
  stats,
  lastUpdated,
  live = true,
}) {
  const [continent, setContinent] = useState("All continents");
  const [country, setCountry] = useState("All countries");
  const [gender, setGender] = useState("All genders");
  const [competition, setCompetition] = useState("all");
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [today] = useState(() => toDateKey());
  const [date, setDate] = useState(today);
  const [seasonStart, setSeasonStart] = useState(() => seasonStartForDate(today));

  const currentSeasonStart = seasonStartForDate(today);
  const seasons = useMemo(() => buildSeasonOptions(currentSeasonStart), [currentSeasonStart]);

  const leagueColors = useMemo(() => competitionColors(competitions), [competitions]);
  const competitionMap = useMemo(
    () => new Map(competitions.map((entry) => [entry.id, entry])),
    [competitions]
  );

  const visibleCompetitions = useMemo(
    () =>
      competitions.filter(
        (entry) =>
          (continent === "All continents" || entry.continent === continent) &&
          (country === "All countries" || entry.country === country) &&
          (gender === "All genders" || entry.gender === gender)
      ),
    [competitions, continent, country, gender]
  );

  const visibleIds = useMemo(
    () => new Set(visibleCompetitions.map((entry) => entry.id)),
    [visibleCompetitions]
  );

  // A competition that is filtered out falls back to "all" instead of leaving a blank grid.
  const activeCompetition =
    competition !== "all" && visibleIds.has(competition) ? competition : "all";

  const isControlled = Boolean(games || standings || leaders || stats);
  // NCAA boards are fetched only while their competition is selected.
  const feed = useEspnFeed({
    sport: "basketball",
    enabled: live && !isControlled,
    date,
    season: seasonStart + 1, // ESPN indexes basketball seasons by their end year
    competition: activeCompetition,
  });

  // Explicit props always win, so the page stays usable as a pure component.
  const activeGames = games ?? feed.games;
  const competitionStandings =
    activeCompetition === "ncaam"
      ? ncaaBasketballStandings
      : activeCompetition === "ncaaw"
        ? ncaaWomenStandings
        : null;
  const activeStandings = standings ?? competitionStandings ?? feed.standings;
  const activeLeaders = leaders ?? feed.leaders;
  const activeStats = stats ?? feed.stats;
  const source = games ? "demo" : feed.source;
  const updated = lastUpdated ?? (isControlled ? "custom dataset" : feed.label);

  const countryOptions = useMemo(() => {
    if (countries?.length) {
      return [...new Set(countries)].filter((entry) => entry !== "All countries").sort();
    }
    const set = new Set(
      competitions
        .filter(
          (entry) =>
            (continent === "All continents" || entry.continent === continent) &&
            (gender === "All genders" || entry.gender === gender)
        )
        .map((entry) => entry.country)
        .filter(Boolean)
    );
    return [...set].sort();
  }, [countries, competitions, continent, gender]);

  const activeCountry = countryOptions.includes(country) ? country : "All countries";

  const filtered = useMemo(
    () =>
      sortByStatus(
        activeGames
          .filter((game) => {
            const meta = competitionMap.get(game.competitionId);
            const gameCountry = game.country ?? meta?.country ?? null;
            return (
              (activeCompetition === "all" || game.competitionId === activeCompetition) &&
              (continent === "All continents" || meta?.continent === continent) &&
              (activeCountry === "All countries" ||
                gameCountry === activeCountry ||
                meta?.country === activeCountry) &&
              (gender === "All genders" || meta?.gender === gender) &&
              (status === "ALL" || game.status === status) &&
              `${game.home} ${game.away} ${game.competition}`
                .toLowerCase()
                .includes(search.toLowerCase())
            );
          })
          .map((game) => ({ ...game, leagueColor: leagueColors[game.competitionId] }))
      ),
    [
      activeGames,
      competitionMap,
      activeCompetition,
      continent,
      activeCountry,
      gender,
      status,
      search,
      leagueColors,
    ]
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

  const dateRail = useMemo(() => buildDateRail(date), [date]);

  const selectDate = (key) => {
    setDate(key);
    setSeasonStart(seasonStartForDate(key));
  };

  const selectSeason = (value) => {
    const start = Number(value);
    if (!Number.isFinite(start)) return;
    setSeasonStart(start);
    setDate(start === currentSeasonStart ? today : seasonSampleDate(start));
  };

  const continentGroup = {
    title: "Continents",
    showCount: false,
    items: [
      {
        key: "all-continents",
        label: "All continents",
        badge: "ALL",
        color: GENDER_COLORS["All genders"],
        active: continent === "All continents",
        onClick: () => setContinent("All continents"),
        ariaLabel: "Continent: All continents",
      },
      ...CONTINENTS.map((name) => ({
        key: name,
        label: name,
        badge: CONTINENT_BADGES[name],
        color: CONTINENT_COLORS[name],
        meta: competitions.filter((entry) => entry.continent === name).length,
        active: continent === name,
        onClick: () => setContinent(name),
        ariaLabel: `Continent: ${name}`,
      })),
    ],
  };

  const genderGroup = {
    title: "Gender",
    showCount: false,
    items: GENDERS.map((name) => ({
      key: name,
      label: name,
      badge: GENDER_BADGES[name],
      color: GENDER_COLORS[name],
      active: gender === name,
      onClick: () => setGender(name),
      ariaLabel: `Gender: ${name}`,
    })),
  };

  const countryGroup = {
    title: "Countries",
    scroll: countryOptions.length > 8,
    items: [
      {
        key: "all-countries",
        label: "All countries",
        badge: "ALL",
        color: GENDER_COLORS["All genders"],
        active: activeCountry === "All countries",
        onClick: () => setCountry("All countries"),
        ariaLabel: "Country: All countries",
      },
      ...countryOptions.map((name) => ({
        key: name,
        label: name,
        active: activeCountry === name,
        onClick: () => setCountry(name),
        ariaLabel: `Country: ${name}`,
      })),
    ],
  };

  return (
    <main className="sh-dash">
      <h1 className="sh-sr-only">Basketball Center</h1>

      <LeagueSidebar
        title="Popular Leagues"
        leagues={visibleCompetitions.map((entry) => ({
          id: entry.id,
          name: entry.name,
          short: entry.short,
          color: entry.color,
          tag: entry.gender === "Women" ? "W" : null,
        }))}
        activeLeague={activeCompetition}
        onLeague={(id) => setCompetition((current) => (current === id ? "all" : id))}
        groupsBefore={[continentGroup]}
        groups={[genderGroup, countryGroup]}
      />

      <div className="sh-center">
        <div id="section-live">
          <FeaturedGame game={hero} sport="basketball" />
        </div>

        <ScoreboardPanel
          games={filtered}
          note={`${filtered.length} matches`}
          seasonLabel={seasonLabel(seasonStart)}
          seasons={seasons}
          season={String(seasonStart)}
          onSeasonChange={selectSeason}
          rail={<DateRail items={dateRail} activeKey={date} onSelect={selectDate} label="Scoreboard date" />}
          railReset={date === today ? undefined : { label: "Today", onClick: () => selectDate(today) }}
          status={status}
          onStatusChange={setStatus}
          search={search}
          onSearchChange={setSearch}
          sourceStatus={isControlled ? "custom" : feed.status}
          sourceLabel={isControlled ? "CUSTOM DATA" : feed.badge}
          onRefresh={isControlled ? undefined : feed.refresh}
          refreshing={feed.refreshing}
          matchBasePath="/basketball"
          emptyHint={`No games on ${formatDateKeyLabel(date)} for these filters.`}
        />

        <div id="section-standings">
          <StandingsPanel
            groups={activeStandings}
            note={`${seasonLabel(seasonStart)} · ${
              competitionStandings
                ? "conference table"
                : source === "espn"
                  ? "ESPN standings"
                  : "sample table"
            }`}
            teamBasePath="/basketball"
          />
        </div>
        <p className="sh-updated">Updated: {updated}</p>
      </div>

      <aside className="sh-right" id="section-players">
        <PlayerDetails
          linkBase="/basketball"
          viewAllHref="/basketball/top-scorers"
          leaders={playerCards}
          note={source === "espn" ? "ESPN leaders" : "Demo leaders"}
        />
        <StatTiles stats={activeStats} title="Competition snapshot" />
      </aside>

      <MobileSectionTabs />
    </main>
  );
}
