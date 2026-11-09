import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { detailSport } from "../data/detailConfig";
import { portraitFor } from "../data/scorersData";
import { isEspnDisabled, loadAthleteDetail } from "../api/espn";
import {
  buildPlayerIndex,
  buildTeamIndex,
  findPlayer,
  findTeam,
  slugify,
  teamKeyFor,
  teamMates,
} from "../utils/entities";
import { metricShort, EmptyState, Panel, PanelHead, TeamLogo } from "../components/ui";
import { IconArrowUpRight, IconChart, IconUsers } from "../components/Icons";

/**
 * A player page always shows a face: the ESPN headshot when there is one, the
 * bundled portrait art otherwise, and initials only if both images fail.
 */
function PlayerPortrait({ player, sport = "basketball", size = "lg" }) {
  const fallback = useMemo(() => portraitFor(sport, player.name), [sport, player.name]);
  const [source, setSource] = useState(player.headshot ?? fallback);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setSource(player.headshot ?? fallback);
    setBroken(false);
  }, [player.headshot, fallback]);

  const handleError = () => {
    if (source !== fallback && fallback) {
      setSource(fallback);
      return;
    }
    setBroken(true);
  };

  if (source && !broken) {
    return (
      <img
        className={`sh-detail-portrait is-${size}`}
        src={source}
        alt={player.name}
        onError={handleError}
      />
    );
  }

  return (
    <span className={`sh-detail-portrait is-${size} is-mono`} aria-hidden="true">
      {player.initials ?? player.name?.slice(0, 2).toUpperCase()}
    </span>
  );
}

export default function PlayerPage({ sport = "basketball" }) {
  const config = detailSport(sport);
  const { playerKey } = useParams();
  const [profile, setProfile] = useState(null);

  const players = useMemo(() => buildPlayerIndex(config.leaders), [config]);
  const teams = useMemo(() => buildTeamIndex(config), [config]);
  const player = useMemo(() => findPlayer(players, playerKey), [players, playerKey]);
  const team = useMemo(
    () => (player?.team ? findTeam(teams, teamKeyFor(player.team)) : null),
    [player, teams]
  );

  useEffect(() => {
    setProfile(null);
    if (!player?.espnId || isEspnDisabled()) return undefined;
    let active = true;
    loadAthleteDetail(player.league ?? config.leagueKey, player.espnId)
      .then((payload) => {
        if (active) setProfile(payload);
      })
      .catch(() => {
        if (active) setProfile(null);
      });
    return () => {
      active = false;
    };
  }, [player?.espnId, player?.league, config.leagueKey]);

  if (!player) {
    return (
      <main className="sh-detail">
        <nav className="sh-crumbs" aria-label="Breadcrumb">
          <Link to={config.hub}>{config.hubLabel}</Link>
          <span aria-hidden="true">/</span>
          <span>Player</span>
        </nav>
        <EmptyState
          title="We couldn't find that player"
          hint="Player pages open from the leaders rail or a team squad."
        />
        <Link className="sh-detail-back" to={config.hub}>
          Back to {config.hubLabel}
        </Link>
      </main>
    );
  }

  const mates = teamMates(players, player);
  const teammates = mates.length
    ? mates
    : [...players.values()].filter((candidate) => candidate.key !== player.key);
  const statGroups = profile?.statGroups ?? [];

  return (
    <main className="sh-detail">
      <nav className="sh-crumbs" aria-label="Breadcrumb">
        <Link to={config.hub}>{config.hubLabel}</Link>
        <span aria-hidden="true">/</span>
        {player.team ? (
          <>
            <Link to={`${config.hub}/team/${slugify(player.team)}`}>{player.team}</Link>
            <span aria-hidden="true">/</span>
          </>
        ) : null}
        <span aria-current="page">{player.name}</span>
      </nav>

      <header className="sh-detail-hero">
        <PlayerPortrait
          sport={sport}
          player={{ ...player, headshot: profile?.headshot ?? player.headshot }}
        />
        <div className="sh-detail-id">
          <span className="sh-detail-kicker">
            {profile?.team?.name ?? player.team ?? config.label}
          </span>
          <h1 className="sh-detail-title">{profile?.name ?? player.name}</h1>
          <div className="sh-detail-chips">
            {profile?.position || player.position ? (
              <span className="sh-detail-stat">
                <b>{profile?.position ?? player.position}</b>
                <i>Position</i>
              </span>
            ) : null}
            {player.teamAbbr ? (
              <span className="sh-detail-stat">
                <b>{player.teamAbbr}</b>
                <i>Team</i>
              </span>
            ) : null}
            <span className="sh-detail-stat">
              <b>{player.value}</b>
              <i>{metricShort(player.metric)}</i>
            </span>
            {profile?.jersey ? (
              <span className="sh-detail-stat">
                <b>#{profile.jersey}</b>
                <i>Jersey</i>
              </span>
            ) : null}
            {profile?.age ? (
              <span className="sh-detail-stat">
                <b>{profile.age}</b>
                <i>Age</i>
              </span>
            ) : null}
          </div>
        </div>
        {team ? (
          <Link className="sh-detail-link" to={`${config.hub}/team/${team.key}`}>
            {team.name}
            <IconArrowUpRight size={13} />
          </Link>
        ) : null}
      </header>

      <div className="sh-detail-grid">
        <Panel className="sh-detail-panel">
          <PanelHead
            icon={<IconChart size={15} />}
            title="Season stats"
            note={statGroups.length ? "ESPN athlete feed" : "Leaderboard snapshot"}
          />
          {statGroups.length ? (
            <div className="sh-detail-stat-groups">
              {statGroups.map((group) => (
                <div className="sh-detail-stat-group" key={group.name}>
                  <h3>{group.name}</h3>
                  <dl>
                    {group.stats.map((stat) => (
                      <div key={stat.label}>
                        <dt>{stat.label}</dt>
                        <dd>{stat.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          ) : (
            <div className="sh-detail-empty-note">
              <p>
                {profile
                  ? "ESPN did not return season splits for this player yet."
                  : "Season averages load from ESPN when the athlete feed answers. This profile comes from the live leaders board."}
              </p>
              <ul className="sh-detail-squad">
                <li>
                  <span className="sh-detail-jersey">{metricShort(player.metric)}</span>
                  <span className="sh-detail-player">{player.metric}</span>
                  <span className="sh-detail-pos">{player.value}</span>
                </li>
                {player.teamLogo ? (
                  <li>
                    <span className="sh-detail-jersey">
                      <TeamLogo src={player.teamLogo} code={player.teamAbbr} size="xs" />
                    </span>
                    <Link className="sh-detail-player" to={`${config.hub}/team/${slugify(player.team)}`}>
                      {player.team}
                    </Link>
                    <span className="sh-detail-pos">Team</span>
                  </li>
                ) : null}
              </ul>
            </div>
          )}
        </Panel>

        <Panel className="sh-detail-panel">
          <PanelHead
            icon={<IconUsers size={15} />}
            title={mates.length ? "More from this team" : "Leaders board"}
            note={teammates.length ? `${teammates.length} players` : "Leaderboard"}
          />
          {teammates.length ? (
            <ul className="sh-detail-squad">
              {teammates.map((mate) => (
                <li key={mate.key}>
                  <span className="sh-detail-jersey">{mate.initials}</span>
                  <Link className="sh-detail-player" to={`${config.hub}/player/${mate.key}`}>
                    {mate.name}
                  </Link>
                  <span className="sh-detail-pos">
                    {mate.value} {metricShort(mate.metric)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sh-detail-note">The leaders rail shows the top player for each stat.</p>
          )}
        </Panel>
      </div>
    </main>
  );
}
