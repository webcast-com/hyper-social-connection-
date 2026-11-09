import React, { useState } from "react";
import { IconChevronDown } from "./Icons";
import { Flag } from "./ui";

export const FLAG_CODES = {
  "United States": "us",
  Argentina: "ar",
  Australia: "au",
  China: "cn",
  Egypt: "eg",
  France: "fr",
  Germany: "de",
  Greece: "gr",
  Italy: "it",
  Japan: "jp",
  Kenya: "ke",
  Nigeria: "ng",
  Philippines: "ph",
  Senegal: "sn",
  Serbia: "rs",
  "South Korea": "kr",
  Spain: "es",
  "United Kingdom": "gb",
  Europe: "eu",
  Africa: null,
};

function SideHead({ children, count, collapsible, expanded, onToggle }) {
  return (
    <div className="sh-side-head">
      <span>{children}</span>
      <span className="sh-side-head-meta">
        {typeof count === "number" ? <span className="sh-side-count">{count}</span> : null}
        {collapsible ? (
          <button
            type="button"
            className="sh-side-toggle"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${children}`}
            title={expanded ? "Collapse" : "Show all"}
          >
            <IconChevronDown size={15} className={expanded ? "is-up" : ""} />
          </button>
        ) : (
          <IconChevronDown size={15} className="is-up" />
        )}
      </span>
    </div>
  );
}

function SideRow({ badge, badgeColor, label, tag, meta, active, onClick, ariaLabel, title, flagCode }) {
  return (
    <button
      type="button"
      className={`sh-league ${badge ? "" : "sh-league-plain"} ${active ? "is-active" : ""}`}
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      title={title ?? label}
    >
      {badge ? (
        <span
          aria-hidden="true"
          className="sh-league-badge sh-league-badge-sm"
          style={{ background: badgeColor || "linear-gradient(140deg, #334155, #1e293b)" }}
        >
          {badge}
        </span>
      ) : (
        <Flag code={flagCode ?? FLAG_CODES[label]} label={label} />
      )}
      <span className="sh-league-name">{label}</span>
      {tag ? <span className={`sh-league-tag ${tag === "W" ? "is-w" : ""}`}>{tag}</span> : null}
      {meta ? <span className="sh-league-meta">{meta}</span> : null}
      <IconChevronDown size={14} className={`sh-league-chev ${active ? "is-up" : ""}`} />
    </button>
  );
}

function SideSection({ title, count, scroll, empty, children }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="sh-leagues">
      <SideHead
        count={count}
        collapsible={scroll}
        expanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
      >
        {title}
      </SideHead>
      {empty ? (
        <div className="sh-side-empty">{empty}</div>
      ) : (
        <div className={`sh-league-list ${scroll && !expanded ? "sh-side-scroll" : ""}`}>
          {children}
        </div>
      )}
    </section>
  );
}

export function LeagueSidebar({
  title = "Popular Leagues",
  leagues = [],
  activeLeague = "all",
  onLeague,
  groupsBefore = [],
  groups = [],
}) {
  const renderGroups = (list) =>
    list.map((group) => (
      <SideSection
        key={group.title}
        title={group.title}
        count={group.showCount === false ? undefined : group.items.length}
        scroll={group.scroll}
        empty={group.empty}
      >
        {group.items.map((item) => (
          <SideRow
            key={item.key}
            badge={item.badge}
            badgeColor={item.color}
            label={item.label}
            flagCode={item.flagCode}
            active={item.active}
            onClick={item.onClick}
            ariaLabel={item.ariaLabel}
            meta={item.meta}
            title={item.title}
          />
        ))}
      </SideSection>
    ));

  return (
    <aside className="sh-sidebar" id="section-filters" aria-label="Competition filters">
      {renderGroups(groupsBefore)}

      <SideSection
        title={title}
        count={leagues.length}
        scroll
        empty={leagues.length ? null : "No competitions match these filters yet."}
      >
        {leagues.map((league) => {
          const active = activeLeague === league.id;
          return (
            <SideRow
              key={league.id}
              badge={league.short || league.name.slice(0, 3).toUpperCase()}
              badgeColor={`linear-gradient(140deg, ${league.color || "#334155"}, ${(league.color || "#334155")}99)`}
              label={league.name}
              tag={league.tag}
              active={active}
              onClick={() => onLeague?.(league.id)}
              ariaLabel={`Competition: ${league.name}`}
            />
          );
        })}
      </SideSection>

      {renderGroups(groups)}
    </aside>
  );
}
