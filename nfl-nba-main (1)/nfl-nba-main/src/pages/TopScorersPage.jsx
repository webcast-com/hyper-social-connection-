import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { detailSport } from "../data/detailConfig";
import { basketballScorers, nflScorers, portraitFor } from "../data/scorersData";
import { isEspnDisabled, loadLeaderboard } from "../api/espn";
import { buildPlayerIndex, findPlayer, slugify } from "../utils/entities";
import { Panel, PanelHead } from "../components/ui";
import { IconChart } from "../components/Icons";

/**
 * Portrait ladder: ESPN headshot -> bundled artwork -> initials.
 * A broken or missing image never leaves a hole in the row.
 */
function ScorerAvatar({ sport, name, photo, initials }) {
  const fallback = useMemo(() => portraitFor(sport, name), [sport, name]);
  const [source, setSource] = useState(photo ?? fallback);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setSource(photo ?? fallback);
    setBroken(false);
  }, [photo, fallback]);

  const handleError = () => {
    if (source !== fallback && fallback) {
      setSource(fallback);
      return;
    }
    setBroken(true);
  };

  if (broken) {
    return (
      <span className="sh-scorer-avatar is-mono" aria-hidden="true">
        {initials ?? name.slice(0, 2).toUpperCase()}
      </span>
    );
  }

  return (
    <span className="sh-scorer-avatar">
      <img src={source} alt="" loading="lazy" decoding="async" onError={handleError} />
    </span>
  );
}

export default function TopScorersPage({ sport = "basketball" }) {
  const config = detailSport(sport);
  const demo = sport === "football" ? nflScorers : basketballScorers;
  const [boards, setBoards] = useState(demo);

  const players = useMemo(() => buildPlayerIndex(config.players ?? config.leaders), [config]);

  useEffect(() => {
    setBoards(demo);
    if (isEspnDisabled()) return undefined;
    let active = true;
    loadLeaderboard(config.leagueKey)
      .then((remote) => {
        if (active && remote.length) {
          const known = new Set(remote.map((board) => board.metric.toLowerCase()));
          setBoards([...remote, ...demo.filter((board) => !known.has(board.metric.toLowerCase()))]);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [config.leagueKey, demo]);

  return (
    <main className="sh-detail">
      <header className="sh-page-head">
        <span className="sh-detail-kicker">{config.hubLabel} leaderboards</span>
        <h1 className="sh-detail-title">Top scorers</h1>
        <p className="sh-page-sub">
          The leaders for every major category, updated from the {config.label} feed.
        </p>
      </header>

      <div className="sh-scorers-grid">
        {boards.map((board) => (
          <Panel className="sh-detail-panel" key={board.metric}>
            <PanelHead
              icon={<IconChart size={15} />}
              title={board.metric}
              note={board.short ? `${board.short} · top ${board.entries.length}` : undefined}
            />
            <ol className="sh-scorer-list">
              {board.entries.map((entry, index) => {
                const profile = findPlayer(players, slugify(entry.name)) ? slugify(entry.name) : null;
                const row = (
                  <>
                    <span className="sh-scorer-rank">{index + 1}</span>
                    <ScorerAvatar
                      sport={sport}
                      name={entry.name}
                      photo={entry.headshot}
                      initials={entry.initials}
                    />
                    <span className="sh-scorer-name">
                      <b>{entry.name}</b>
                      <i>{entry.team}</i>
                    </span>
                    <span className="sh-scorer-value">{entry.value}</span>
                  </>
                );
                return (
                  <li key={`${entry.name}-${index}`}>
                    {profile ? (
                      <Link className="sh-scorer-row" to={`${config.hub}/player/${profile}`}>
                        {row}
                      </Link>
                    ) : (
                      <div className="sh-scorer-row">{row}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </Panel>
        ))}
      </div>

      <p className="sh-detail-note">
        Portraits are the players' ESPN headshots when the feed answers; sample artwork otherwise.
      </p>
    </main>
  );
}
