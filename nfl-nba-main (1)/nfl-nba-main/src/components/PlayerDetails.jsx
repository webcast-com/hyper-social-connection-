import React, { useState } from "react";
import { slugify } from "../utils/entities";
import { IconArrowUpRight } from "./Icons";
import { MaybeLink, Panel, PanelHead, metricShort } from "./ui";

const teamHue = (value = "") => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 360;
  }
  return hash;
};

function PlayerCard({ player, rank, linkBase }) {
  const [photoBroken, setPhotoBroken] = useState(false);
  const hue = teamHue(player.team || player.name);
  const showPhoto = Boolean(player.headshot) && !photoBroken;

  const card = (
    <article className="sh-player">
      <div className="sh-player-art" style={{ "--player-hue": hue }}>
        {player.teamLogo ? (
          <img className="sh-player-team" src={player.teamLogo} alt="" loading="lazy" />
        ) : null}

        {showPhoto ? (
          <img
            className="sh-player-photo"
            src={player.headshot}
            alt={player.name}
            loading="lazy"
            onError={() => setPhotoBroken(true)}
          />
        ) : (
          <div className="sh-player-mono" aria-hidden="true">{player.initials}</div>
        )}

        <span className="sh-player-grad" />

        <span className="sh-player-rating">
          <b>{String(rank).padStart(2, "0")}</b>
          <i>RANK</i>
        </span>

        <div className="sh-player-info">
          <div className="sh-player-name">{player.name}</div>
          <div className="sh-player-pos">
            {player.position ?? "—"}
            {player.teamAbbr ? ` · ${player.teamAbbr}` : ""}
          </div>
        </div>
      </div>

      <div className="sh-player-stats">
        <div>
          <b>{player.teamAbbr ?? "—"}</b>
          <i>Team</i>
        </div>
        <div>
          <b>{metricShort(player.metric)}</b>
          <i>Stat</i>
        </div>
        <div>
          <b>{player.value}</b>
          <i>Avg</i>
        </div>
        <div>
          <b>{String(rank).padStart(2, "0")}</b>
          <i>Rank</i>
        </div>
      </div>
    </article>
  );

  if (!linkBase) return card;

  return (
    <MaybeLink
      className="sh-player-link"
      to={`${linkBase}/player/${player.key ?? slugify(player.name)}`}
      aria-label={`Player profile: ${player.name}`}
    >
      {card}
    </MaybeLink>
  );
}

export function PlayerDetails({ leaders = [], title = "Player Details", note, linkBase, viewAllHref }) {
  if (!leaders.length) return null;

  return (
    <Panel className="sh-players-panel">
      <PanelHead
        title={title}
        note={note}
        actions={
          <MaybeLink className="sh-viewall" to={viewAllHref ?? "#"} aria-label="View all player leaders">
            View all
            <IconArrowUpRight size={12} />
          </MaybeLink>
        }
      />
      <div className="sh-players">
        {leaders.map((player, index) => (
          <PlayerCard
            key={`${player.name}-${index}`}
            player={player}
            rank={index + 1}
            linkBase={linkBase}
          />
        ))}
      </div>
    </Panel>
  );
}
