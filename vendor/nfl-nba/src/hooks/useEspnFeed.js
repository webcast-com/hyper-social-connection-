import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SNAPSHOT_FETCHERS,
  isEspnDisabled,
  loadLeaders,
  summarizeGames,
  pad2,
} from "../api/espn";
import {
  basketballGames,
  basketballStandings,
  basketballLeaders,
  basketballStats,
  nflGames,
  nflStandings,
  nflLeaders,
  nflStats,
} from "../data/sportsData";

const DEMO = {
  basketball: {
    games: basketballGames,
    standings: basketballStandings,
    leaders: basketballLeaders,
    stats: basketballStats,
  },
  football: {
    games: nflGames,
    standings: nflStandings,
    leaders: nflLeaders,
    stats: nflStats,
  },
};

export const REFRESH_INTERVAL = 45 * 1000;

function timeLabel(date) {
  if (!date) return "";
  try {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  } catch {
    return "";
  }
}

function deriveBasketballStats(games) {
  const counts = summarizeGames(games);
  const competitions = new Set(games.map((game) => game.competitionId)).size;
  const countries = new Set(games.map((game) => game.country).filter(Boolean)).size;

  return [
    { label: "Games today", value: pad2(counts.total), foot: "ESPN scoreboard feed" },
    { label: "Live games", value: pad2(counts.live), foot: "In progress right now" },
    { label: "Competitions", value: pad2(competitions), foot: "Leagues with games" },
    { label: "Countries / regions", value: pad2(countries), foot: "Venue coverage" },
  ];
}

function statusBadge(status) {
  switch (status) {
    case "live":
    case "refreshing":
      return "LIVE · ESPN";
    case "stale":
      return "STALE · ESPN";
    case "loading":
      return "SYNCING ESPN";
    case "offline":
      return "OFFLINE · DEMO";
    default:
      return "DEMO DATA";
  }
}

function statusLabel(status, updatedAt) {
  switch (status) {
    case "live":
    case "refreshing":
      return `ESPN live · ${timeLabel(updatedAt)}`;
    case "stale":
      return `ESPN last synced · ${timeLabel(updatedAt)}`;
    case "loading":
      return "Syncing with ESPN…";
    case "offline":
      return "ESPN unavailable · demo data";
    default:
      return "Demo data · ESPN disabled";
  }
}

/**
 * Keeps the page on demo data until ESPN answers, then swaps in live scores,
 * standings, leaders and derived stats. Existing props still win in the pages,
 * so the components stay fully controllable from a parent container.
 *
 * @param {object} options
 * @param {"basketball"|"football"} options.sport
 * @param {boolean} [options.enabled] false → never hit the network
 * @param {string} [options.date] YYYYMMDD for the basketball scoreboard
 * @param {number} [options.week] NFL week number
 * @param {number} [options.seasonType] 1 preseason · 2 regular · 3 postseason
 * @param {number} [options.season] ESPN season year (basketball uses its end year)
 * @param {string} [options.competition] competition id to fetch on demand (ncaam, cfb, …)
 * @param {number} [options.refreshMs] polling interval, 0 disables polling
 */
export function useEspnFeed({
  sport = "basketball",
  enabled = true,
  date,
  week,
  seasonType,
  season,
  competition,
  refreshMs = REFRESH_INTERVAL,
} = {}) {
  const demo = DEMO[sport] ?? DEMO.basketball;
  const canFetch = enabled && !isEspnDisabled();

  const [snapshot, setSnapshot] = useState({ games: null, standings: null, meta: {} });
  const [status, setStatus] = useState(canFetch ? "loading" : "demo");
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [nonce, setNonce] = useState(0);
  const [liveLeaders, setLiveLeaders] = useState(null);

  useEffect(() => {
    if (!canFetch) return undefined;

    let cancelled = false;
    const fetcher = SNAPSHOT_FETCHERS[sport] ?? SNAPSHOT_FETCHERS.basketball;

    const load = async (force) => {
      try {
        const result = await fetcher({ date, week, seasonType, season, competition, force });
        if (cancelled) return;
        setSnapshot((previous) => ({
          games: result.games,
          standings: result.standings ?? previous.standings,
          meta: result.meta ?? {},
        }));
        setStatus("live");
        setError(null);
        setUpdatedAt(new Date());
      } catch (requestError) {
        if (cancelled) return;
        setStatus((previous) =>
          previous === "live" || previous === "refreshing" || previous === "stale"
            ? "stale"
            : "offline"
        );
        setError(requestError?.message ?? "ESPN request failed");
      }
    };

    setStatus((previous) => (previous === "live" || previous === "stale" ? "refreshing" : "loading"));
    load(nonce > 0);

    const timer =
      refreshMs > 0
        ? setInterval(() => {
            if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
            load(false);
          }, refreshMs)
        : null;

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [sport, date, week, seasonType, season, competition, canFetch, refreshMs, nonce]);

  useEffect(() => {
    if (!canFetch) return undefined;
    let cancelled = false;
    const leagueKey = sport === "football" ? "nfl" : "nba";

    loadLeaders(leagueKey)
      .then((leaders) => {
        if (!cancelled && leaders.length) setLiveLeaders(leaders);
      })
      .catch(() => {
        // Leaders are a nice-to-have; the bundled season leaders stay in place.
      });

    return () => {
      cancelled = true;
    };
  }, [sport, canFetch]);

  const games = snapshot.games ?? demo.games;
  const standings = snapshot.standings ?? demo.standings;
  const leaders = liveLeaders ?? demo.leaders;
  const stats = useMemo(
    () => (sport === "basketball" ? deriveBasketballStats(games) : demo.stats),
    [sport, games, demo.stats]
  );

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  const isLive = snapshot.games !== null && status !== "offline";
  const refreshing = status === "loading" || status === "refreshing";

  return {
    games,
    standings,
    leaders,
    stats,
    meta: snapshot.meta,
    status,
    source: snapshot.games !== null ? "espn" : "demo",
    isLive,
    refreshing,
    error,
    updatedAt,
    label: statusLabel(status, updatedAt),
    badge: statusBadge(status),
    refresh,
  };
}

export default useEspnFeed;
