import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { detailSport } from "../data/detailConfig";
import { demoCommentary } from "../data/commentaryData";
import {
  ESPN_LEAGUES,
  isEspnDisabled,
  leagueKeyForCompetition,
  loadMatchSummary,
} from "../api/espn";
import { gameClockLabel } from "../utils/dates";
import { EmptyState, Panel, PanelHead, TeamLogo } from "../components/ui";
import { IconClock, IconPlay } from "../components/Icons";

function findDemoGame(games, matchId) {
  return games.find((game) => String(game.id) === String(matchId)) ?? null;
}

const STATUS_KIND = { LIVE: "is-live", FINAL: "is-final", UPCOMING: "is-soon" };

export default function MatchPage({ sport = "basketball" }) {
  const config = detailSport(sport);
  const { matchId } = useParams();
  const [params] = useSearchParams();
  const demoGame = findDemoGame(config.games, matchId);

  // The card that links here carries its competition, so a college or EuroLeague
  // fixture asks the right ESPN board instead of the flagship one.
  const competitionId = demoGame?.competitionId ?? params.get("competition");
  const leagueKey = leagueKeyForCompetition(competitionId) ?? config.leagueKey;
  const competitionName =
    demoGame?.competition ?? ESPN_LEAGUES[leagueKey]?.competition ?? config.label;

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(!isEspnDisabled());

  useEffect(() => {
    setSummary(null);
    if (isEspnDisabled()) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    loadMatchSummary(leagueKey, matchId)
      .then((payload) => {
        // A game with a scoreline but no plays yet still has a page.
        if (active && (payload.teams.length || payload.plays.length)) setSummary(payload);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [leagueKey, matchId]);

  const summaryHome =
    summary?.teams?.find((team) => team.homeAway === "home") ?? summary?.teams?.[0] ?? null;
  const summaryAway =
    summary?.teams?.find((team) => team.homeAway === "away") ?? summary?.teams?.[1] ?? null;

  const teams = {
    home: demoGame
      ? {
          name: demoGame.home,
          code: demoGame.homeCode,
          logo: demoGame.homeLogo,
          score: demoGame.homeScore,
        }
      : summaryHome,
    away: demoGame
      ? {
          name: demoGame.away,
          code: demoGame.awayCode,
          logo: demoGame.awayLogo,
          score: demoGame.awayScore,
        }
      : summaryAway,
  };

  const state = demoGame?.status ?? (summary?.state === "in" ? "LIVE" : summary?.state === "post" ? "FINAL" : "UPCOMING");

  const statusText = demoGame
    ? demoGame.status === "FINAL"
      ? "Final"
      : demoGame.clock || gameClockLabel(demoGame)
    : summary?.statusText ?? (state === "UPCOMING" ? "Scheduled" : null);

  const plays = useMemo(
    () => (summary?.plays?.length ? summary.plays : demoCommentary[String(matchId)]?.plays ?? []),
    [summary, matchId]
  );

  const backLink = (
    <Link className="sh-detail-back" to={config.hub}>
      Back to {config.hubLabel}
    </Link>
  );

  if (!demoGame && !summary) {
    if (loading) {
      return (
        <main className="sh-detail">
          <nav className="sh-crumbs" aria-label="Breadcrumb">
            <Link to={config.hub}>{config.hubLabel}</Link>
            <span aria-hidden="true">/</span>
            <span>{competitionName}</span>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Match commentary</span>
          </nav>
          <Panel className="sh-detail-panel">
            <PanelHead icon={<IconPlay size={15} />} title="Commentary" note="ESPN play-by-play" />
            <p className="sh-detail-note" role="status">
              Loading the play-by-play from ESPN…
            </p>
          </Panel>
          {backLink}
        </main>
      );
    }

    return (
      <main className="sh-detail">
        <nav className="sh-crumbs" aria-label="Breadcrumb">
          <Link to={config.hub}>{config.hubLabel}</Link>
          <span aria-hidden="true">/</span>
          <span>Match</span>
        </nav>
        <EmptyState
          title="We couldn't find that match"
          hint="Open a game from the live score rail so its commentary can load."
        />
        {backLink}
      </main>
    );
  }

  return (
    <main className="sh-detail">
      <nav className="sh-crumbs" aria-label="Breadcrumb">
        <Link to={config.hub}>{config.hubLabel}</Link>
        <span aria-hidden="true">/</span>
        <span>{competitionName}</span>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Match commentary</span>
      </nav>

      <header className="sh-detail-hero sh-match-hero">
        <div className="sh-match-team">
          <TeamLogo src={teams.home?.logo} code={teams.home?.code} size="lg" />
          <div>
            <b>{teams.home?.name ?? "TBD"}</b>
            <i>Home</i>
          </div>
          <span className="sh-match-score">{teams.home?.score ?? "—"}</span>
        </div>

        <div className="sh-match-mid">
          <span className={`sh-detail-chip ${STATUS_KIND[state] ?? "is-soon"}`}>
            {statusText ?? "Scheduled"}
          </span>
          <span className="sh-match-venue">{demoGame?.venue ?? summary?.venue ?? ""}</span>
        </div>

        <div className="sh-match-team is-away">
          <span className="sh-match-score">{teams.away?.score ?? "—"}</span>
          <div>
            <b>{teams.away?.name ?? "TBD"}</b>
            <i>Away</i>
          </div>
          <TeamLogo src={teams.away?.logo} code={teams.away?.code} size="lg" />
        </div>
      </header>

      <Panel className="sh-detail-panel">
        <PanelHead
          icon={<IconPlay size={15} />}
          title="Commentary"
          note={
            plays.length
              ? summary?.plays?.length
                ? "ESPN play-by-play"
                : "Sample play-by-play"
              : undefined
          }
        />

        {plays.length ? (
          <ol className="sh-commentary">
            {plays.map((play, index) => (
              <li key={`${play.clock}-${index}`}>
                <span className="sh-commentary-clock">
                  <IconClock size={12} />
                  {play.clock}
                </span>
                <span className="sh-commentary-text">
                  {play.team ? <b>{play.team}</b> : null}
                  {play.text}
                </span>
                {play.score ? <span className="sh-commentary-score">{play.score}</span> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="sh-detail-note">
            {state === "UPCOMING"
              ? `Commentary starts at ${statusText ?? "tip-off"} — come back when the game is live.`
              : loading
                ? "Loading the play-by-play from ESPN…"
                : "ESPN has not published play-by-play for this game yet."}
          </p>
        )}
      </Panel>

      {backLink}
    </main>
  );
}
