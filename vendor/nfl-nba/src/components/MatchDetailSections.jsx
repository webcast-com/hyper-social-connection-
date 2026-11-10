import React from "react";
import { Panel, PanelHead } from "./ui";

/** These sections show only fields ESPN supplied for this particular game. */
export function MatchScoreBreakdown({ teams }) {
  const home = teams?.find((team) => team.homeAway === "home");
  const away = teams?.find((team) => team.homeAway === "away");
  const count = Math.max(home?.linescores?.length ?? 0, away?.linescores?.length ?? 0);
  if (!count) return null;
  return (
    <Panel className="sh-detail-panel sh-match-breakdown">
      <PanelHead title="Score by period" note="ESPN" />
      <div className="sh-match-table-scroll" role="region" aria-label="Score by period" tabIndex={0}>
        <table className="sh-match-table">
          <thead><tr><th scope="col">Team</th>{Array.from({ length: count }, (_, i) => <th scope="col" key={i}>P{i + 1}</th>)}<th scope="col">Total</th></tr></thead>
          <tbody>{[home, away].filter(Boolean).map((team) => <tr key={team.homeAway}>
            <th scope="row">{team.code || team.name}</th>
            {Array.from({ length: count }, (_, i) => <td key={i}>{team.linescores?.[i] ?? "—"}</td>)}
            <td>{team.score ?? "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="sh-match-caption">P = period; the competition determines quarters, halves or overtime.</p>
    </Panel>
  );
}

export function FootballDrives({ drives }) {
  if (!drives?.length) return null;
  return (
    <Panel className="sh-detail-panel">
      <PanelHead title="Drive summary" note="ESPN" />
      <details className="sh-match-disclosure">
        <summary>View {drives.length} {drives.length === 1 ? "drive" : "drives"}</summary>
        <ul className="sh-drive-list">{drives.map((drive, index) => <li key={drive.id || index}>
          <span><b>{drive.team || "Team unavailable"}</b>{drive.start ? ` · ${drive.start}` : ""}</span>
          <span>{drive.description || "Drive details unavailable"}</span>
          {drive.result ? <strong>{drive.result}</strong> : null}
        </li>)}</ul>
      </details>
    </Panel>
  );
}

export function MatchBoxScore({ summary, teams }) {
  if (!summary) return null;
  const stats = summary.teamStats ?? [];
  const tables = summary.playerTables ?? [];
  return <>
    <Panel className="sh-detail-panel">
      <PanelHead title="Team statistics" note="ESPN" />
      {stats.length ? <div className="sh-team-stats">
        <div className="sh-team-stats-head"><b>{teams.home?.code || teams.home?.name || "Home"}</b><span>Stat</span><b>{teams.away?.code || teams.away?.name || "Away"}</b></div>
        {stats.map((stat, index) => <div className="sh-team-stat" key={`${stat.label}-${index}`}><b>{stat.home ?? "—"}</b><span>{stat.label}</span><b>{stat.away ?? "—"}</b></div>)}
      </div> : <p className="sh-detail-note">ESPN has not provided team statistics for this game.</p>}
    </Panel>
    <Panel className="sh-detail-panel">
      <PanelHead title="Player box score" note="ESPN" />
      {tables.length ? <div className="sh-boxscore-groups">{tables.map((table, index) => <details className="sh-match-disclosure" key={`${table.team}-${table.label}-${index}`}>
        <summary>{table.team} · {table.label}</summary>
        <div className="sh-match-table-scroll" role="region" aria-label={`${table.team} ${table.label} player statistics`} tabIndex={0}>
          <table className="sh-match-table sh-player-table">
            <thead><tr><th scope="col">Player</th>{table.labels.map((label, i) => <th scope="col" key={i}>{label}</th>)}</tr></thead>
            <tbody>{table.athletes.map((player, i) => <tr key={player.id || i}><th scope="row">{player.name}{player.didNotPlay ? <small> · {player.reason || "DNP"}</small> : null}</th>{player.stats.map((value, n) => <td key={n}>{value}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <p className="sh-match-caption">Scroll sideways to view all reported player statistics.</p>
      </details>)}</div> : <p className="sh-detail-note">ESPN has not provided a player box score for this game.</p>}
    </Panel>
  </>;
}

export function MatchGameInfo({ summary }) {
  const info = summary?.gameInfo;
  const items = [summary?.venue ? ["Venue", summary.venue] : null,
    info?.attendance ? ["Attendance", info.attendance] : null,
    info?.broadcast?.length ? ["Broadcast", info.broadcast.join(", ")] : null,
    info?.officials?.length ? ["Officials", info.officials.join(", ")] : null].filter(Boolean);
  if (!items.length) return null;
  return <Panel className="sh-detail-panel"><PanelHead title="Game information" note="ESPN" />
    <dl className="sh-game-info">{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </Panel>;
}
