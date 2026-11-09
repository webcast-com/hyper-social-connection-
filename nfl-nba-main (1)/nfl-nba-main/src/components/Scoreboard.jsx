import React, { useEffect, useRef } from "react";
import heroBasketball from "../assets/hero-basketball.jpg";
import heroFootball from "../assets/hero-football.jpg";
import { IconCalendar, IconCamera, IconChart, IconChevronDown, IconClock, IconSearch } from "./Icons";
import { gameClockLabel, viewerTimeZone, viewerTimeZoneLabel } from "../utils/dates";
import { matchPath } from "../utils/dashboard";
import { EmptyState, MaybeLink, Panel, PanelHead, RefreshButton, SourceChip, TeamLogo } from "./ui";

const STATUS_COPY = { LIVE: "Live", FINAL: "Final", UPCOMING: "Upcoming" };

export function FeaturedGame({ game, sport = "basketball" }) {
  const image = sport === "football" ? heroFootball : heroBasketball;

  if (!game) {
    return (
      <section className="sh-feature sh-feature-empty">
        <img className="sh-feature-bg" src={image} alt="" />
        <span className="sh-feature-veil" />
        <div className="sh-feature-top">
          <span className="sh-live-pill is-idle"><i />No live game</span>
        </div>
        <div className="sh-feature-empty-body">
          <h2>Nothing on the court right now</h2>
          <p>Pick another day from the live score rail, or check back at tip-off.</p>
        </div>
      </section>
    );
  }

  const isLive = game.status === "LIVE";
  const clock = gameClockLabel(game);

  return (
    <section className="sh-feature" aria-label="Featured game">
      <img className="sh-feature-bg" src={image} alt="" />
      <span className="sh-feature-veil" />

      <div className="sh-feature-top">
        <span className={`sh-live-pill ${isLive ? "" : "is-idle"}`}>
          <i />
          {STATUS_COPY[game.status] ?? "Upcoming"}
        </span>
        <span className="sh-feature-comp">{game.competition}</span>
      </div>

      <div className="sh-feature-match">
        <div className="sh-feature-side">
          <TeamLogo src={game.homeLogo} code={game.homeCode} size="xl" />
          <div className="sh-feature-team">{game.home}</div>
          <div className="sh-feature-score">{game.homeScore ?? "—"}</div>
        </div>

        <div className="sh-feature-mid">
          <span className="sh-feature-vs">V/S</span>
          <span className={`sh-feature-clock ${isLive ? "is-live" : ""}`}>{clock}</span>
          <span className="sh-feature-venue">{game.venue}</span>
        </div>

        <div className="sh-feature-side">
          <TeamLogo src={game.awayLogo} code={game.awayCode} size="xl" />
          <div className="sh-feature-team">{game.away}</div>
          <div className="sh-feature-score">{game.awayScore ?? "—"}</div>
        </div>
      </div>

      <div className="sh-feature-foot">
        <span className="sh-feature-chip">
          <i className="sh-tv-dot" />
          {game.broadcast || "Broadcast TBD"}
        </span>
        <span className="sh-feature-chip sh-feature-chip-muted">
          <IconClock size={13} />
          {isLive ? `${clock} · in progress` : game.status === "FINAL" ? "Full time" : clock}
        </span>
      </div>
    </section>
  );
}

export function DateRail({ items = [], activeKey, onSelect, label = "Scoreboard date" }) {
  const railRef = useRef(null);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const active = rail.querySelector('[aria-selected="true"]');
    if (!active) return;
    const railBox = rail.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    if (!railBox.width) return;
    const delta = activeBox.left - railBox.left - railBox.width / 2 + activeBox.width / 2;
    rail.scrollLeft += delta;
  }, [activeKey, items.length]);

  return (
    <div className="sh-date-rail" role="tablist" aria-label={label} ref={railRef}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={item.key === activeKey}
          className={`sh-date ${item.key === activeKey ? "is-active" : ""}`}
          onClick={() => onSelect?.(item.key)}
          title={item.title}
        >
          <span className="sh-date-day">{item.day}</span>
          <span className="sh-date-dow">{item.weekday}</span>
        </button>
      ))}
    </div>
  );
}

export function StatusTabs({ value = "ALL", onChange }) {
  return (
    <div className="sh-status-tabs" role="tablist" aria-label="Game status">
      {["ALL", "LIVE", "UPCOMING", "FINAL"].map((status) => (
        <button
          key={status}
          type="button"
          role="tab"
          aria-selected={value === status}
          className={`sh-status-tab ${value === status ? "is-active" : ""}`}
          onClick={() => onChange?.(status)}
        >
          {status}
        </button>
      ))}
    </div>
  );
}

export function MatchCard({ game, matchBasePath }) {
  const isLive = game.status === "LIVE";
  const clockClass = isLive ? "is-live" : game.status === "FINAL" ? "is-final" : "is-soon";
  const clock = gameClockLabel(game);

  const card = (
    <article className="sh-match sh-game">
      <div className="sh-match-logos">
        <TeamLogo src={game.homeLogo} code={game.homeCode} size="md" />
        <span className="sh-vs">V/S</span>
        <TeamLogo src={game.awayLogo} code={game.awayCode} size="md" />
      </div>

      <div className="sh-match-meta">
        <span className="sh-comp-chip">
          <i style={{ background: game.leagueColor || "var(--accent)" }} />
          {game.competition}
        </span>
        <span className={`sh-clock ${clockClass}`}>{game.status === "FINAL" ? "Final" : clock}</span>
        <span className="sh-clock-ico" aria-hidden="true">
          <IconClock size={14} />
        </span>
      </div>

      <div className="sh-match-rows">
        <div className="sh-match-row">
          <span className="sh-match-team" title={game.home}>{game.home}</span>
          <strong className="sh-match-score">{game.homeScore ?? "—"}</strong>
        </div>
        <div className="sh-match-row">
          <span className="sh-match-team" title={game.away}>{game.away}</span>
          <strong className="sh-match-score">{game.awayScore ?? "—"}</strong>
        </div>
      </div>

      <div className="sh-match-foot">
        <span className="sh-broadcast">{game.broadcast && game.broadcast !== "—" ? game.broadcast : "TV TBD"}</span>
        <span className="sh-chart-chip" aria-hidden="true">
          <IconChart size={14} />
        </span>
      </div>
    </article>
  );

  if (!matchBasePath) return card;

  return (
    <MaybeLink
      className="sh-match-link"
      to={matchPath(matchBasePath, game)}
      aria-label={`Match commentary: ${game.home} v ${game.away}`}
    >
      {card}
    </MaybeLink>
  );
}

export function ScoreboardPanel({
  games = [],
  title = "Live Score",
  note,
  rail,
  seasonLabel = "2025-2026",
  seasons,
  season,
  onSeasonChange,
  status,
  onStatusChange,
  search,
  onSearchChange,
  sourceStatus = "demo",
  sourceLabel,
  onRefresh,
  refreshing = false,
  emptyHint,
  railReset,
  matchBasePath,
}) {
  const timeZone = viewerTimeZone();

  return (
    <Panel className="sh-score-panel">
      <PanelHead
        icon={<IconCamera size={15} />}
        title={title}
        note={note}
        actions={
          <>
            {seasons?.length ? (
              <label className="sh-season-pill">
                <IconCalendar size={13} />
                <select
                  value={season}
                  onChange={(event) => onSeasonChange?.(event.target.value)}
                  aria-label="Season"
                >
                  {seasons.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <IconChevronDown size={12} />
              </label>
            ) : (
              <span className="sh-season-pill">
                <IconCalendar size={13} />
                {seasonLabel}
                <IconChevronDown size={12} />
              </span>
            )}
            {railReset ? (
              <button type="button" className="sh-rail-reset" onClick={railReset.onClick}>
                {railReset.label}
              </button>
            ) : null}
            <span
              className="sh-tz-chip"
              title={`Kickoff times in your time zone (${timeZone})`}
              aria-label={`Kickoff times in your time zone: ${timeZone}`}
            >
              <IconClock size={12} />
              {viewerTimeZoneLabel(timeZone)}
            </span>
            <SourceChip status={sourceStatus} label={sourceLabel} />
            {onRefresh ? <RefreshButton onClick={onRefresh} refreshing={refreshing} /> : null}
          </>
        }
      />

      <div className="sh-score-bar">
        {rail}
        <div className="sh-score-tools">
          <StatusTabs value={status} onChange={onStatusChange} />
          <label className="sh-search-field">
            <IconSearch size={14} />
            <input
              data-page-search
              type="search"
              value={search}
              onChange={(event) => onSearchChange?.(event.target.value)}
              placeholder="Search teams…"
              aria-label="Search teams or competitions"
            />
          </label>
        </div>
      </div>

      {games.length ? (
        <div className="sh-matches">
          {games.map((game) => (
            <MatchCard key={game.id} game={game} matchBasePath={matchBasePath} />
          ))}
        </div>
      ) : (
        <EmptyState hint={emptyHint || "Try another competition, country or day."} />
      )}
    </Panel>
  );
}
