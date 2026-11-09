import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { detailSport } from "../data/detailConfig";
import { isEspnDisabled, leagueKeyForCompetition, loadTeamDetail } from "../api/espn";
import {
  buildTeamIndex,
  findTeam,
  gameOpponent,
  gameScoreFor,
  gamesForTeam,
  slugify,
  teamSide,
} from "../utils/entities";
import { gameClockLabel } from "../utils/dates";
import { EmptyState, Panel, PanelHead, TeamLogo } from "../components/ui";
import { StandingsPanel } from "../components/Standings";
import { IconArrowUpRight, IconCalendar, IconUsers } from "../components/Icons";

function statusChip(game) {
  if (game.status === "LIVE") return { label: game.clock || "Live", tone: "is-live" };
  if (game.status === "FINAL") return { label: "Final", tone: "is-final" };
  return { label: gameClockLabel(game), tone: "is-soon" };
}

function MatchRow({ game, team, basePath }) {
  const opponent = gameOpponent(game, team);
  const side = teamSide(game, team);
  const score = gameScoreFor(game, team);
  const chip = statusChip(game);
  const won =
    game.status === "FINAL" && score !== null && opponent.score !== null
      ? Number(score) > Number(opponent.score)
      : null;

  return (
    <li className="sh-detail-match">
      <span className={`sh-detail-chip ${chip.tone}`}>{chip.label}</span>
      <span className="sh-detail-vs">{side === "home" ? "vs" : "@"}</span>
      <TeamLogo src={opponent.logo} code={opponent.code} size="xs" />
      <Link className="sh-detail-opponent" to={`${basePath}/team/${slugify(opponent.name)}`}>
        {opponent.name}
      </Link>
      {score !== null && opponent.score !== null ? (
        <span className={`sh-detail-score ${won ? "is-win" : won === false ? "is-loss" : ""}`}>
          {score}–{opponent.score}
        </span>
      ) : (
        <span className="sh-detail-score is-muted">—</span>
      )}
    </li>
  );
}

export default function TeamPage({ sport = "basketball" }) {
  const config = detailSport(sport);
  const { teamKey } = useParams();
  const [detail, setDetail] = useState(null);

  const index = useMemo(() => buildTeamIndex(config), [config]);
  const team = useMemo(() => findTeam(index, teamKey), [index, teamKey]);
  const leagueKey = team?.league ?? leagueKeyForCompetition(team?.competitionId) ?? config.leagueKey;

  useEffect(() => {
    setDetail(null);
    if (!team?.code || isEspnDisabled()) return undefined;
    let active = true;
    loadTeamDetail(leagueKey, team.code)
      .then((payload) => {
        if (active) setDetail(payload);
      })
      .catch(() => {
        if (active) setDetail(null);
      });
    return () => {
      active = false;
    };
  }, [team?.code, leagueKey]);

  const demoGames = useMemo(() => gamesForTeam(config.games, team), [config.games, team]);
  const matches = detail?.games?.length ? detail.games : demoGames;
  const roster = detail?.roster ?? [];
  const squadLeaders = config.leaders.filter((leader) => leader.team === team?.name);

  if (!team) {
    return (
      <main className="sh-detail">
        <nav className="sh-crumbs" aria-label="Breadcrumb">
          <Link to={config.hub}>{config.hubLabel}</Link>
          <span aria-hidden="true">/</span>
          <span>Team</span>
        </nav>
        <EmptyState
          title="We couldn't find that team"
          hint={`Pick a team from the ${config.label} standings to see its page.`}
        />
        <Link className="sh-detail-back" to={config.hub}>
          Back to {config.hubLabel}
        </Link>
      </main>
    );
  }

  const record = team.record ?? {};
  const standingGroup = config.standings.filter((group) =>
    (group.rows ?? []).some((row) => row.team === team.name)
  );

  return (
    <main className="sh-detail">
      <nav className="sh-crumbs" aria-label="Breadcrumb">
        <Link to={config.hub}>{config.hubLabel}</Link>
        <span aria-hidden="true">/</span>
        <span>{team.competition ?? config.label}</span>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{team.name}</span>
      </nav>

      <header className="sh-detail-hero">
        <TeamLogo src={detail?.info?.logo ?? team.logo} code={team.code} size="xl" />
        <div className="sh-detail-id">
          <span className="sh-detail-kicker">{team.competition ?? config.label}</span>
          <h1 className="sh-detail-title">{detail?.info?.name ?? team.name}</h1>
          <div className="sh-detail-chips">
            {record.w !== undefined && record.w !== "—" ? (
              <span className="sh-detail-stat">
                <b>
                  {record.w}–{record.l}
                  {record.t ? `–${record.t}` : ""}
                </b>
                <i>Record</i>
              </span>
            ) : null}
            {record.pct && record.pct !== "—" ? (
              <span className="sh-detail-stat">
                <b>{record.pct}</b>
                <i>PCT</i>
              </span>
            ) : null}
            {record.streak && record.streak !== "—" ? (
              <span className="sh-detail-stat">
                <b>{record.streak}</b>
                <i>Streak</i>
              </span>
            ) : null}
            {detail?.info?.standing ? (
              <span className="sh-detail-stat">
                <b>{detail.info.standing}</b>
                <i>Standing</i>
              </span>
            ) : null}
            {team.group ? (
              <span className="sh-detail-stat">
                <b>{team.group.replace(`${team.competition ?? ""} · `, "")}</b>
                <i>Group</i>
              </span>
            ) : null}
          </div>
        </div>
        <Link className="sh-detail-link" to={config.hub}>
          All {config.label} matches
          <IconArrowUpRight size={13} />
        </Link>
      </header>

      <div className="sh-detail-grid">
        <Panel className="sh-detail-panel">
          <PanelHead
            icon={<IconCalendar size={15} />}
            title="Results & fixtures"
            note={detail?.games?.length ? "ESPN schedule" : "Sample schedule"}
          />
          {matches.length ? (
            <ul className="sh-detail-matches">
              {matches.map((game) => (
                <MatchRow key={game.id} game={game} team={team} basePath={config.hub} />
              ))}
            </ul>
          ) : (
            <EmptyState title="No matches on the board" hint="Pick another day from the live score rail." />
          )}
        </Panel>

        <Panel className="sh-detail-panel">
          <PanelHead
            icon={<IconUsers size={15} />}
            title="Squad"
            note={roster.length ? `${roster.length} players · ESPN` : "Season leaders"}
          />
          {roster.length ? (
            <ul className="sh-detail-squad">
              {roster.slice(0, 12).map((player) => (
                <li key={player.id ?? player.key}>
                  <span className="sh-detail-jersey">{player.jersey ?? "–"}</span>
                  <Link to={`${config.hub}/player/${player.key}`} className="sh-detail-player">
                    {player.name}
                  </Link>
                  <span className="sh-detail-pos">{player.position}</span>
                </li>
              ))}
            </ul>
          ) : squadLeaders.length ? (
            <ul className="sh-detail-squad">
              {squadLeaders.map((player) => (
                <li key={player.name}>
                  <span className="sh-detail-jersey">{player.initials}</span>
                  <Link to={`${config.hub}/player/${slugify(player.name)}`} className="sh-detail-player">
                    {player.name}
                  </Link>
                  <span className="sh-detail-pos">
                    {player.value} {player.metric}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sh-detail-note">
              ESPN returns rosters once the season is live. Check the leaders rail on the{" "}
              <Link to={config.hub}>{config.hubLabel} hub</Link> for this team&apos;s top performers.
            </p>
          )}
        </Panel>

        {standingGroup.length ? (
          <div className="sh-detail-standings">
            <StandingsPanel
              groups={standingGroup}
              nfl={config.nfl}
              note={team.group ?? "Standings"}
              teamBasePath={config.hub}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}
