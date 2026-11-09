import { describe, expect, it } from "vitest";
import {
  formatKickoff,
  gameClockLabel,
  viewerTimeZone,
  viewerTimeZoneLabel,
} from "./dates";

const now = new Date("2025-11-02T10:00:00Z");

describe("formatKickoff", () => {
  it("renders the kickoff on the viewer's clock", () => {
    expect(formatKickoff("2025-11-02T23:00:00Z", { timeZone: "UTC", now })).toBe("Today · 23:00");
  });

  it("follows the viewer's day boundary, not the arena's", () => {
    // 01:30 on 3 Nov in Nairobi (UTC+3) is still 22:30 on 2 Nov for a UTC viewer
    expect(formatKickoff("2025-11-02T22:30:00Z", { timeZone: "Africa/Nairobi", now })).toBe(
      "Tomorrow · 01:30"
    );
    expect(formatKickoff("2025-11-02T22:30:00Z", { timeZone: "UTC", now })).toBe("Today · 22:30");
  });

  it("names the weekday for kickoffs further out", () => {
    expect(formatKickoff("2025-11-12T18:45:00Z", { timeZone: "America/New_York", now })).toBe(
      "Wed 12 Nov · 13:45"
    );
  });

  it("falls back for missing or invalid dates", () => {
    expect(formatKickoff(null, { timeZone: "UTC", now })).toBe("TBD");
    expect(formatKickoff("not-a-date", { timeZone: "UTC", now })).toBe("TBD");
  });

  it("defaults to the device time zone", () => {
    expect(formatKickoff("2025-11-02T12:30:00Z", { now })).toMatch(/\d{2}:\d{2}$/);
  });
});

describe("gameClockLabel", () => {
  it("recomputes upcoming times from startTime in the viewer's zone", () => {
    const game = { status: "UPCOMING", startTime: "2025-11-02T23:00:00Z", clock: "Old label" };
    expect(gameClockLabel(game)).toBe(formatKickoff("2025-11-02T23:00:00Z"));
  });

  it("leaves live and final clocks alone", () => {
    expect(gameClockLabel({ status: "LIVE", clock: "Q3 · 04:32" })).toBe("Q3 · 04:32");
    expect(gameClockLabel({ status: "FINAL", clock: "Final" })).toBe("Final");
  });
});

describe("viewerTimeZone", () => {
  it("reports the device zone with a compact label", () => {
    expect(viewerTimeZone()).toMatch(/\w/);
    expect(viewerTimeZoneLabel()).toMatch(/\w/);
    expect(viewerTimeZoneLabel("Africa/Nairobi")).toMatch(/GMT\+3|EAT/);
  });
});
