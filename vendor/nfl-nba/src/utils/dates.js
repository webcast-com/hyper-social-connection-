const DATE_KEY_LENGTH = 8;

/** Date → YYYYMMDD (local, matching ESPN's `dates` parameter). */
export function toDateKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("");
}

/** YYYYMMDD → local Date at midday, avoiding DST edge cases. */
export function fromDateKey(key) {
  const digits = String(key ?? "").replace(/\D/g, "");
  if (digits.length !== DATE_KEY_LENGTH) return null;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function shiftDateKey(key, days) {
  const date = fromDateKey(key) ?? new Date();
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

/** "Today · Sun 2 Nov" style label for the scoreboard date stepper. */
export function formatDateKeyLabel(key) {
  const date = fromDateKey(key);
  if (!date) return "Today";
  const today = toDateKey(new Date());
  const prefix = key === today ? "Today" : null;
  let formatted;
  try {
    formatted = date.toLocaleDateString([], {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    formatted = key;
  }
  return prefix ? `${prefix} · ${formatted}` : formatted;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Ten day window with the selected date highlighted (as in the live-score rail). */
export function buildDateRail(selectedKey, { before = 4, total = 10 } = {}) {
  const anchor = fromDateKey(selectedKey) ?? new Date();
  const items = [];
  for (let offset = -before; offset < total - before; offset += 1) {
    const date = new Date(anchor);
    date.setDate(anchor.getDate() + offset);
    const key = toDateKey(date);
    items.push({
      key,
      day: String(date.getDate()).padStart(2, "0"),
      weekday: WEEKDAYS[date.getDay()],
      title: formatDateKeyLabel(key),
    });
  }
  return items;
}

/** Week rail used by the NFL page. */
export function buildWeekRail(total = 18) {
  return Array.from({ length: total }, (_, index) => {
    const week = index + 1;
    return { key: String(week), day: String(week), weekday: "Wk", title: `Week ${week}` };
  });
}

const SEASON_START_MONTH = 8; // basketball seasons tip off around September/October

/** Season start year (e.g. 2025 for the 2025-2026 season) for a YYYYMMDD date. */
export function seasonStartForDate(key) {
  const date = fromDateKey(key) ?? new Date();
  return date.getMonth() >= SEASON_START_MONTH
    ? date.getFullYear()
    : date.getFullYear() - 1;
}

/** "2025-2026" label for a season start year. */
export function seasonLabel(startYear) {
  return `${startYear}-${startYear + 1}`;
}

/** Descending season options, newest first. */
export function buildSeasonOptions(currentStart, count = 5) {
  return Array.from({ length: count }, (_, index) => {
    const start = currentStart - index;
    return { value: String(start), label: seasonLabel(start) };
  });
}

/** A representative in-season date (1 February) for a season start year. */
export function seasonSampleDate(startYear) {
  return `${startYear + 1}0201`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The device's IANA time zone. Kickoff times are always rendered in it. */
export function viewerTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Compact label for the active zone, e.g. "GMT+3" (falls back to "EAT", then the city). */
export function viewerTimeZoneLabel(timeZone = viewerTimeZone()) {
  for (const timeZoneName of ["shortOffset", "short"]) {
    try {
      const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName })
        .formatToParts(new Date())
        .find((entry) => entry.type === "timeZoneName");
      if (part?.value) return part.value;
    } catch {
      // try the next strategy
    }
  }
  return String(timeZone).split("/").pop().replace(/_/g, " ") || "UTC";
}

function zonedDayKey(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const pick = (type) => parts.find((part) => part.type === type)?.value ?? "";
    return `${pick("year")}-${pick("month")}-${pick("day")}`;
  } catch {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate()
    ).padStart(2, "0")}`;
  }
}

/**
 * Kickoff label in the viewer's own time zone — "Today · 20:00",
 * "Tomorrow · 19:30", "Wed 5 Nov · 19:30" — so nothing is hard-coded to an
 * arena's clock. Pass `timeZone`/`now` to make it deterministic in tests.
 */
export function formatKickoff(isoDate, { timeZone = viewerTimeZone(), now = new Date() } = {}) {
  if (isoDate === null || isoDate === undefined || isoDate === "") return "TBD";
  const date = isoDate instanceof Date ? isoDate : new Date(isoDate);
  if (!date || Number.isNaN(date.getTime())) return "TBD";

  let time;
  try {
    time = new Intl.DateTimeFormat([], {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
  } catch {
    time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  }

  let dayLabel = "";
  try {
    const delta = Math.round(
      (Date.parse(`${zonedDayKey(date, timeZone)}T00:00:00Z`) -
        Date.parse(`${zonedDayKey(now, timeZone)}T00:00:00Z`)) / DAY_MS
    );
    if (delta === 0) dayLabel = "Today";
    else if (delta === 1) dayLabel = "Tomorrow";
    else if (delta === -1) dayLabel = "Yesterday";
    else {
      const parts = new Intl.DateTimeFormat([], {
        timeZone,
        weekday: "short",
        day: "numeric",
        month: "short",
      }).formatToParts(date);
      const pick = (type) => parts.find((part) => part.type === type)?.value ?? "";
      dayLabel = [pick("weekday"), pick("day"), pick("month")].filter(Boolean).join(" ");
    }
  } catch {
    dayLabel = "";
  }

  return dayLabel ? `${dayLabel} · ${time}` : time;
}

/** Clock text for a game: upcoming games are re-rendered from `startTime` in the viewer's zone. */
export function gameClockLabel(game = {}) {
  if (game.status === "UPCOMING" && game.startTime) return formatKickoff(game.startTime);
  return game.clock ?? "";
}
