import React from "react";
import { NavLink, useLocation } from "react-router-dom";

const SCREENS = [
  { label: "Live", path: "", end: true },
  { label: "Upcoming", path: "/upcoming", end: false },
  { label: "Top scorers", path: "/top-scorers", end: false },
  { label: "News", path: "/news", end: false },
];

/** Sport-aware secondary navigation shared by every screen of a hub. */
export function SubNav() {
  const { pathname } = useLocation();
  const sportPath = pathname.startsWith("/nfl") ? "/nfl" : "/basketball";

  if (!pathname.startsWith("/basketball") && !pathname.startsWith("/nfl")) return null;

  // A match screen belongs to the live-score flow, so keep "Live" lit there too.
  const onMatch = pathname.startsWith(`${sportPath}/match/`);

  return (
    <nav className="sh-subnav" aria-label="Sections">
      {SCREENS.map((screen) => (
        <NavLink
          key={screen.label}
          to={`${sportPath}${screen.path}`}
          end={screen.end}
          className={({ isActive }) =>
            `sh-subnav-link ${isActive || (screen.end && onMatch) ? "is-active" : ""}`
          }
        >
          {screen.label}
        </NavLink>
      ))}
    </nav>
  );
}
