import React from "react";
import { Link } from "react-router-dom";
import { detailSport } from "../data/detailConfig";
import { isEspnDisabled } from "../api/espn";
import { useEspnFeed } from "../hooks/useEspnFeed";
import { gameClockLabel } from "../utils/dates";
import { matchPath } from "../utils/dashboard";
import { EmptyState, Panel, PanelHead, TeamLogo } from "../components/ui";
import { IconCalendar } from "../components/Icons";

function dayLabel(game) {
  if (game.status === "LIVE") return "In progress";
  const label = gameClockLabel(game);
  const [day] = label.split(" · ");
  return day || "Scheduled";
}

export default function UpcomingPage({ sport = "basketball" }) {
  const config = detailSport(sport);
  const feed = useEspnFeed({ sport, enabled: !isEspnDisabled() });
  const pool = feed.games?.length ? feed.games : config.games;

  const games = pool
    .filter((game) => game.status !== "FINAL")
    .sort((a, b) => {
      if (a.status === "LIVE" && b.status !== "LIVE") return -1;
      if (b.status === "LIVE" && a.status !== "LIVE") return 1;
      const left = a.startTime ? Date.parse(a.startTime) : Number.MAX_SAFE_INTEGER;
      const right = b.startTime ? Date.parse(b.startTime) : Number.MAX_SAFE_INTEGER;
      return left - right;
    });

  const groups = new Map();
  games.forEach((game) => {
    const key = dayLabel(game);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(game);
  });

  return (
    <main className="sh-detail">
      <header className="sh-page-head">
        <span className="sh-detail-kicker">{config.hubLabel} schedule</span>
        <h1 className="sh-detail-title">Upcoming</h1>
        <p className="sh-page-sub">
          Everything still to play, with kick-off times in your own time zone.
        </p>
      </header>

      {games.length ? (
        <div className="sh-detail-grid is-single">
          {[...groups.entries()].map(([label, list]) => (
            <Panel className="sh-detail-panel" key={label}>
              <PanelHead
                icon={<IconCalendar size={15} />}
                title={label}
                note={`${list.length} ${list.length === 1 ? "match" : "matches"}`}
              />
              <ul className="sh-detail-matches is-rows">
                {list.map((game) => (
                  <li className="sh-detail-fixture" key={game.id}>
                    <Link className="sh-fixture-link" to={matchPath(config.hub, game)}>
                      <span className="sh-fixture-comp">{game.competition ?? config.label}</span>
                      <span className="sh-fixture-teams">
                        <TeamLogo src={game.homeLogo} code={game.homeCode} size="xs" />
                        <b>{game.home}</b>
                        <em>v</em>
                        <TeamLogo src={game.awayLogo} code={game.awayCode} size="xs" />
                        <b>{game.away}</b>
                      </span>
                      <span className="sh-fixture-meta">
                        <span className={`sh-detail-chip ${game.status === "LIVE" ? "is-live" : "is-soon"}`}>
                          {game.status === "LIVE" ? game.clock || "Live" : gameClockLabel(game)}
                        </span>
                        <span className="sh-fixture-venue">{game.venue}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      ) : (
        <EmptyState title="Nothing left on the schedule" hint="Check back after the next feed refresh." />
      )}

      <p className="sh-detail-note">
        Times follow your device time zone.{" "}
        <Link to={config.hub}>Back to the {config.hubLabel} hub</Link>
      </p>
    </main>
  );
}
