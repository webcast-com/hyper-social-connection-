import React from "react";
import { Link, useInRouterContext } from "react-router-dom";
import { IconRefresh } from "./Icons";

/**
 * Renders a router link when the component sits inside a <Router>, and a plain
 * element otherwise, so the dashboards stay usable as standalone components.
 */
export function MaybeLink({ to, children, ...rest }) {
  const inRouter = useInRouterContext();
  if (!inRouter) return <span {...rest}>{children}</span>;
  return (
    <Link to={to} {...rest}>
      {children}
    </Link>
  );
}

export function Panel({ children, className = "", as: Tag = "section", ...rest }) {
  return (
    <Tag className={`sh-panel ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}

export function PanelHead({ icon, title, note, actions, children }) {
  return (
    <div className="sh-panel-head">
      <div className="sh-panel-heading">
        {icon ? <span className="sh-panel-icon">{icon}</span> : null}
        <span className="sh-panel-title">{title}</span>
        {note ? <span className="sh-panel-note">{note}</span> : null}
      </div>
      {actions || children ? <div className="sh-panel-actions">{actions}{children}</div> : null}
    </div>
  );
}

const SOURCE_TONES = {
  live: "live",
  refreshing: "live",
  stale: "warn",
  offline: "warn",
  custom: "custom",
  demo: "demo",
  loading: "demo",
};

export function SourceChip({ status = "demo", label }) {
  const tone = SOURCE_TONES[status] ?? "demo";
  return (
    <span className={`sh-source sh-source-${tone}`} title={label}>
      <i className="sh-source-dot" />
      {label}
    </span>
  );
}

export function RefreshButton({ onClick, refreshing = false }) {
  return (
    <button
      type="button"
      className="sh-icon-btn"
      onClick={onClick}
      disabled={refreshing}
      aria-label="Refresh ESPN data"
      title="Refresh ESPN data"
    >
      <IconRefresh size={16} className={refreshing ? "is-spinning" : undefined} />
    </button>
  );
}

export function EmptyState({ title = "No matches match these filters.", hint }) {
  return (
    <div className="sh-empty">
      <div className="sh-empty-ball" aria-hidden="true" />
      <div className="sh-empty-title">{title}</div>
      {hint ? <div className="sh-empty-hint">{hint}</div> : null}
    </div>
  );
}

export function TeamLogo({ src, code = "—", size = "md" }) {
  const [failedSrc, setFailedSrc] = React.useState(null);
  if (!src || src === failedSrc) {
    return (
      <span className={`sh-crest sh-crest-${size}`} aria-hidden="true">
        {typeof code === "string" && code.trim() ? code : "—"}
      </span>
    );
  }
  return (
    <img
      className={`sh-team-logo sh-team-logo-${size}`}
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailedSrc(src)}
    />
  );
}

export function Flag({ code, label }) {
  const [broken, setBroken] = React.useState(false);
  if (!code || broken) {
    return <span className="sh-flag sh-flag-fallback" aria-hidden="true">{label.slice(0, 2)}</span>;
  }
  return (
    <img
      className="sh-flag"
      src={`https://flagcdn.com/w40/${code}.png`}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}

export function metricShort(metric = "") {
  const value = metric.toLowerCase();
  if (value.includes("point")) return "PTS";
  if (value.includes("rebound")) return "REB";
  if (value.includes("assist")) return "AST";
  if (value.includes("block")) return "BLK";
  if (value.includes("steal")) return "STL";
  if (value.includes("passing")) return "PASS";
  if (value.includes("rushing")) return "RUSH";
  if (value.includes("receiving")) return "REC";
  if (value.includes("sack")) return "SACK";
  return metric.split(/\s+/)[0]?.slice(0, 4).toUpperCase() || "STAT";
}
