import React, { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { smoothScrollTo } from "../utils/scroll";
import {
  IconBall,
  IconBell,
  IconChart,
  IconCalendar,
  IconCricket,
  IconFile,
  IconFootball,
  IconGrid,
  IconMoon,
  IconPuck,
  IconSearch,
  IconShuttle,
  IconSun,
  IconTarget,
  IconTrophy,
  IconUsers,
  IconPlay,
  LogoMark,
} from "./Icons";

export const SPORT_TABS = [
  { to: "/basketball", label: "Basketball", icon: IconBall },
  { to: "/nfl", label: "Football", icon: IconFootball },
  { to: "/cricket", label: "Cricket", icon: IconCricket },
  { to: "/badminton", label: "Badminton", icon: IconShuttle },
  { to: "/hockey", label: "Hockey", icon: IconPuck },
];

const RAIL_ITEMS = [
  { id: "overview", label: "Overview", icon: IconGrid },
  { id: "watch", label: "Watch live", icon: IconPlay },
  { id: "community", label: "Community", icon: IconUsers },
  { id: "schedule", label: "Schedule", icon: IconCalendar },
  { id: "alerts", label: "Alerts", icon: IconBell },
  { id: "news", label: "News", icon: IconFile },
  { id: "trophies", label: "Trophies", icon: IconTrophy },
  { id: "my-teams", label: "My teams", icon: IconTarget },
];

export const SECTION_TABS = [
  { id: "section-live", label: "Live", icon: IconPlay },
  { id: "section-standings", label: "Standings", icon: IconChart },
  { id: "section-filters", label: "Filters", icon: IconGrid },
  { id: "section-players", label: "Players", icon: IconUsers },
];

/**
 * Phone-only tab bar. The desktop rail and the three dashboard columns have no
 * room on a phone, so these tabs jump straight to the components that would
 * otherwise be buried: the live board, standings, the filter sidebar and the
 * player rail. Hidden above 960px, where the columns are all on screen.
 */
export function MobileSectionTabs() {
  const [active, setActive] = useState(SECTION_TABS[0].id);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const nodes = SECTION_TABS.map((tab) => document.getElementById(tab.id)).filter(Boolean);
    if (!nodes.length) return undefined;
    // No layout (jsdom, SSR) means there is nothing to track — keep the first tab.
    if (!nodes.some((node) => node.getBoundingClientRect().height > 0)) return undefined;

    let frame = 0;
    const update = () => {
      frame = 0;
      let current = nodes[0].id;
      for (const node of nodes) {
        if (node.getBoundingClientRect().top <= 132) current = node.id;
      }
      setActive(current);
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const jump = (id) => {
    setActive(id);
    smoothScrollTo(id);
  };

  return (
    <nav className="sh-site-tabs" aria-label="Page sections">
      {SECTION_TABS.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            className={`sh-site-tab ${active === tab.id ? "is-active" : ""}`}
            aria-current={active === tab.id ? "true" : undefined}
            onClick={() => jump(tab.id)}
          >
            <Icon size={17} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function IconRail() {
  const { pathname } = useLocation();
  const hub = /^\/(basketball|nfl)(?:\/|$)/.exec(pathname)?.[1];
  const overview = /^\/(basketball|nfl|cricket|badminton|hockey)(?:\/|$)/.exec(pathname)?.[1] || "basketball";
  return (
    <aside className="sh-rail" aria-label="Primary">
      <a href="/sports" className="sh-rail-logo" title="Back to Hyper Sports" aria-label="Back to Hyper Sports">
        <LogoMark size={26} />
      </a>
      <nav className="sh-rail-items" aria-label="Dashboard shortcuts">
        {RAIL_ITEMS.map((item) => {
          const Icon = item.icon;
          const destination = item.id === "overview" ? `/${overview}`
            : item.id === "schedule" && hub ? `/${hub}/upcoming`
              : item.id === "news" && hub ? `/${hub}/news` : null;
          const external = item.id === "community" ? "/groups" : item.id === "alerts" ? "/notifications" : null;
          if (external) return <a key={item.id} href={external} className="sh-rail-btn" aria-label={item.label} title={item.label}><Icon size={18} /></a>;
          if (destination) return (
            <NavLink key={item.id} to={destination} end={item.id === "overview"}
              className={({ isActive }) => `sh-rail-btn ${isActive ? "is-active" : ""}`}
              aria-label={item.label} title={item.label}>
              <Icon size={18} />
            </NavLink>
          );
          return <button key={item.id} type="button" className="sh-rail-btn" disabled
            aria-label={`${item.label} unavailable`} title={`${item.label} is not available`}><Icon size={18} /></button>;
        })}
      </nav>
      <span className="sh-rail-status" aria-hidden="true" />
    </aside>
  );
}

export function TopBar({ theme = "dark", onThemeChange, onSearch }) {
  return (
    <header className="sh-topbar">
      <div className="sh-brand">
        <a href="/sports" className="sh-brand-mark" aria-label="Back to Hyper Sports" title="Back to Hyper Sports">
          <LogoMark size={22} />
        </a>
        <span className="sh-brand-name">
          Score<span>Hub</span>
        </span>
      </div>

      <nav className="sh-sport-tabs" aria-label="Sports">
        {SPORT_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) => `sh-sport-tab ${isActive ? "is-active" : ""}`}
            >
              {({ isActive }) => (
                <>
                  {isActive ? <Icon size={16} /> : null}
                  <span>{tab.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="sh-topbar-actions">
        <button type="button" className="sh-icon-btn" aria-label="Search teams or competitions" title="Search" onClick={onSearch}>
          <IconSearch size={17} />
        </button>
        <a href="/notifications" className="sh-icon-btn" aria-label="Notifications" title="Notifications">
          <IconBell size={17} />
        </a>
        <div className="sh-theme" role="group" aria-label="Color theme">
          <button
            type="button"
            className={theme === "dark" ? "is-on" : ""}
            onClick={() => onThemeChange?.("dark")}
            aria-label="Dark theme"
            aria-pressed={theme === "dark"}
          >
            <IconMoon size={14} />
          </button>
          <button
            type="button"
            className={theme === "light" ? "is-on" : ""}
            onClick={() => onThemeChange?.("light")}
            aria-label="Light theme"
            aria-pressed={theme === "light"}
          >
            <IconSun size={14} />
          </button>
        </div>
        <span className="sh-avatar" aria-hidden="true">SH</span>
      </div>
    </header>
  );
}
