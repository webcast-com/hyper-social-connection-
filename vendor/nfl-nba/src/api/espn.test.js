import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearEspnCache,
  formatKickoff,
  fetchBasketballSnapshot,
  isEspnDisabled,
  leagueKeyForCompetition,
  liveLeaguesFor,
  normalizeLeaderboard,
  normalizeLeaders,
  normalizeScoreboard,
  normalizeStandings,
  requestEspn,
  scoreboardUrls,
  standingsUrls,
} from "./espn";
import { shiftDateKey, toDateKey } from "../utils/dates";

const nbaScoreboard = {
  events: [
    {
      id: "401234567",
      date: "2025-11-02T00:30:00Z",
      season: { type: 2, slug: "regular-season" },
      competitions: [
        {
          competitors: [
            { homeAway: "home", score: "84", team: { displayName: "Boston Celtics", abbreviation: "BOS" } },
            { homeAway: "away", score: "79", team: { displayName: "New York Knicks", abbreviation: "NYK" } },
          ],
          venue: { fullName: "TD Garden", address: { country: "USA" } },
          status: { period: 3, displayClock: "4:32", type: { state: "in", completed: false } },
        },
      ],
    },
    {
      id: "401234568",
      date: "2025-11-02T23:00:00Z",
      competitions: [
        {
          competitors: [
            { homeAway: "home", score: "0", team: { displayName: "Real Madrid", abbreviation: "RMA" } },
            { homeAway: "away", score: "0", team: { displayName: "Olympiacos", abbreviation: "OLY" } },
          ],
          venue: { fullName: "WiZink Center", address: { country: "Spain" } },
          status: { period: 0, displayClock: "0:00", type: { state: "pre", completed: false } },
        },
      ],
    },
  ],
};

const nflScoreboard = {
  week: { number: 9 },
  events: [
    {
      id: "401671800",
      date: "2026-01-18T20:00:00Z",
      season: { type: 3, slug: "post-season" },
      competitions: [
        {
          competitors: [
            { homeAway: "home", score: "31", team: { displayName: "Kansas City Chiefs", abbreviation: "KC" } },
            { homeAway: "away", score: "27", team: { displayName: "Buffalo Bills", abbreviation: "BUF" } },
          ],
          venue: { fullName: "Arrowhead Stadium", address: { country: "USA" } },
          status: { period: 5, displayClock: "0:00", type: { state: "post", completed: true } },
        },
      ],
    },
  ],
};

const nbaStandings = {
  children: [
    {
      name: "Eastern Conference",
      standings: {
        entries: [
          {
            team: { displayName: "New York Knicks", abbreviation: "NYK" },
            stats: [
              { name: "gamesPlayed", value: 82 },
              { name: "wins", value: 50, displayValue: "50" },
              { name: "losses", value: 32, displayValue: "32" },
              { name: "winPercent", displayValue: "0.610" },
              { name: "gamesBehind", displayValue: "11.0" },
              { name: "streak", displayValue: "W2" },
            ],
          },
          {
            team: { displayName: "Boston Celtics", abbreviation: "BOS" },
            stats: [
              { name: "gamesPlayed", value: 82 },
              { name: "wins", value: 61, displayValue: "61" },
              { name: "losses", value: 21, displayValue: "21" },
              { name: "winPercent", displayValue: "0.744" },
              { name: "gamesBehind", displayValue: "-" },
              { name: "streak", displayValue: "W4" },
            ],
          },
        ],
      },
    },
  ],
};

const nflStandings = {
  children: [
    {
      name: "American Football Conference",
      children: [
        {
          name: "AFC East",
          standings: {
            entries: [
              {
                team: { displayName: "Buffalo Bills", abbreviation: "BUF" },
                stats: [
                  { name: "gamesPlayed", value: 17 },
                  { name: "wins", value: 11, displayValue: "11" },
                  { name: "losses", value: 6, displayValue: "6" },
                  { name: "ties", value: 0, displayValue: "0" },
                  { name: "winPercent", displayValue: "0.647" },
                  { name: "pointsFor", value: 451 },
                  { name: "pointsAgainst", value: 311 },
                  { name: "streak", displayValue: "W3" },
                ],
              },
            ],
          },
        },
      ],
    },
  ],
};

describe("ESPN scoreboard normalisation", () => {
  it("maps an in-progress basketball game to the page shape", () => {
    const [live] = normalizeScoreboard(nbaScoreboard, { league: "nba" });
    expect(live).toMatchObject({
      id: "401234567",
      competitionId: "nba",
      competition: "NBA",
      country: "United States",
      status: "LIVE",
      clock: "Q3 · 4:32",
      home: "Boston Celtics",
      away: "New York Knicks",
      homeCode: "BOS",
      awayCode: "NYK",
      homeScore: 84,
      awayScore: 79,
      venue: "TD Garden",
    });
  });

  it("keeps pre-game scores empty and shows the kick-off time", () => {
    const [, upcoming] = normalizeScoreboard(nbaScoreboard, { league: "nba" });
    expect(upcoming.status).toBe("UPCOMING");
    expect(upcoming.homeScore).toBeNull();
    expect(upcoming.awayScore).toBeNull();
    expect(upcoming.country).toBe("Spain");
    expect(upcoming.clock).toBe(formatKickoff("2025-11-02T23:00:00Z"));
  });

  it("supports merged basketball leagues", () => {
    const [game] = normalizeScoreboard(nbaScoreboard, { league: "euroleague" });
    expect(game.competitionId).toBe("euroleague");
    expect(game.competition).toBe("EuroLeague");
  });

  it("maps NFL postseason games and conference", () => {
    const [game] = normalizeScoreboard(nflScoreboard, { league: "nfl" });
    expect(game).toMatchObject({
      competitionId: "playoffs",
      competition: "NFL Playoffs",
      status: "FINAL",
      clock: "Final / OT",
      conference: "AFC",
      homeScore: 31,
    });
  });
});

describe("ESPN standings normalisation", () => {
  it("reads NBA conferences and sorts by win percentage", () => {
    const [group] = normalizeStandings(nbaStandings, { sport: "basketball", prefix: "NBA" });
    expect(group.group).toBe("NBA · Eastern Conference");
    expect(group.rows.map((row) => row.code)).toEqual(["BOS", "NYK"]);
    expect(group.rows[0]).toMatchObject({ p: 82, w: 61, l: 21, pct: ".744", gb: "—", streak: "W4" });
    expect(group.rows[1].gb).toBe("11.0");
  });

  it("unwraps nested NFL conference → division groups", () => {
    const groups = normalizeStandings(nflStandings, { sport: "football" });
    expect(groups).toHaveLength(1);
    expect(groups[0].group).toBe("AFC East");
    expect(groups[0].rows[0]).toMatchObject({
      team: "Buffalo Bills",
      code: "BUF",
      p: 17,
      w: 11,
      l: 6,
      t: 0,
      pct: ".647",
      pf: 451,
      pa: 311,
    });
  });

  it("tolerates empty payloads", () => {
    expect(normalizeStandings(null)).toEqual([]);
  });
});

describe("ESPN leaders normalisation", () => {
  it("reads category leaders when the endpoint provides them", () => {
    const leaders = normalizeLeaders({
      categories: [
        {
          name: "Points Per Game",
          leaders: [
            {
              displayValue: "33.9",
              athlete: {
                id: "3945274",
                displayName: "Luka Dončić",
                position: { abbreviation: "PG" },
                team: { displayName: "Dallas Mavericks", abbreviation: "DAL" },
              },
            },
          ],
        },
      ],
    });
    expect(leaders[0]).toMatchObject({
      name: "Luka Dončić",
      team: "Dallas Mavericks",
      metric: "Points Per Game",
      value: "33.9",
      initials: "LD",
    });
    expect(leaders[0].headshot).toContain("a.espncdn.com/i/headshots/nba/players/full/3945274.png");
    expect(leaders[0]).toMatchObject({ position: "PG", teamAbbr: "DAL" });
  });

  it("returns an empty list for unexpected shapes", () => {
    expect(normalizeLeaders({ nonsense: true })).toEqual([]);
  });
});

describe("ESPN leaderboard normalisation", () => {
  const payload = {
    categories: [
      {
        name: "Points Per Game",
        leaders: [
          {
            displayValue: "33.9",
            athlete: {
              id: "3945274",
              displayName: "Luka Dončić",
              team: { displayName: "Dallas Mavericks", abbreviation: "DAL" },
            },
          },
        ],
      },
    ],
  };

  it("carries a headshot so the top scorers screen can show the player", () => {
    const boards = normalizeLeaderboard(payload);
    expect(boards[0].metric).toBe("Points Per Game");
    expect(boards[0].entries[0].headshot).toContain("/i/headshots/nba/players/full/3945274.png");
  });

  it("uses the NFL headshot path for football", () => {
    const boards = normalizeLeaderboard(payload, { sport: "football" });
    expect(boards[0].entries[0].headshot).toContain("/i/headshots/nfl/players/full/3945274.png");
  });
});

describe("ESPN request layer", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearEspnCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("builds direct + proxy candidate URLs", () => {
    const urls = scoreboardUrls("nfl", { week: 9, seasonType: 2 });
    expect(urls[0]).toContain("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard");
    expect(urls[0]).toContain("week=9");
    expect(urls[0]).toContain("seasontype=2");
    expect(urls).toContain("/espn/apis/site/v2/sports/football/nfl/scoreboard?limit=100&week=9&seasontype=2");
    expect(standingsUrls("nba")[0]).toContain("/apis/v2/sports/basketball/nba/standings");
  });

  it("asks for the wider Division I board for college basketball", () => {
    const [direct, proxied] = scoreboardUrls("mens-college-basketball");
    expect(direct).toBe(
      "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?limit=500&groups=50"
    );
    expect(proxied).toBe(
      "/espn/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?limit=500&groups=50"
    );
    expect(scoreboardUrls("womens-college-basketball")[0]).toContain("womens-college-basketball/scoreboard?limit=500&groups=50");
    // dated requests keep the extra parameters
    expect(scoreboardUrls("mens-college-basketball", { date: "20261110" })[0]).toContain("dates=20261110");
    // every other league keeps its existing URL
    expect(scoreboardUrls("nba")[0]).toBe(
      "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?limit=100"
    );
  });

  it("falls back to the same-origin proxy and caches the payload", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ events: [] }) });
    global.fetch = fetchMock;

    const data = await requestEspn(["https://site.api.espn.com/fail", "/espn/fail"], { ttl: 1000 });
    expect(data).toEqual({ events: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await requestEspn(["https://site.api.espn.com/fail", "/espn/fail"], { ttl: 1000 });
    expect(fetchMock).toHaveBeenCalledTimes(2); // served from cache
  });

  it("surfaces an error when every endpoint fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(requestEspn(["https://site.api.espn.com/down"])).rejects.toThrow("Failed to fetch");
  });

  it("is disabled inside the test environment", () => {
    expect(isEspnDisabled()).toBe(true);
  });
});

describe("NCAA league routing", () => {
  it("keeps the flagship and Division I college boards on the default view", () => {
    expect(liveLeaguesFor("basketball")).toEqual([
      "nba",
      "wnba",
      "nbl",
      "euroleague",
      "mens-college-basketball",
      "womens-college-basketball",
    ]);
    expect(liveLeaguesFor("football", "all")).toEqual(["nfl"]);
  });

  it("fetches college football on its own once that competition is selected", () => {
    expect(liveLeaguesFor("football", "cfb")).toEqual(["college-football"]);
  });

  it("maps competition ids to ESPN league keys", () => {
    expect(leagueKeyForCompetition("ncaam")).toBe("mens-college-basketball");
    expect(leagueKeyForCompetition("cfb")).toBe("college-football");
    expect(leagueKeyForCompetition("nfl")).toBe("nfl");
    expect(leagueKeyForCompetition(undefined)).toBeNull();
  });
});

describe("live games across the local midnight", () => {
  const originalFetch = global.fetch;
  const today = toDateKey();
  const yesterday = shiftDateKey(today, -1);

  const espnGame = (id, { state = "in", home = "Boston Celtics", away = "New York Knicks" } = {}) => ({
    id,
    date: "2026-11-04T00:30:00Z",
    competitions: [
      {
        competitors: [
          { homeAway: "home", score: "84", team: { displayName: home, abbreviation: "BOS" } },
          { homeAway: "away", score: "79", team: { displayName: away, abbreviation: "NYK" } },
        ],
        venue: { fullName: "TD Garden" },
        status: { period: 3, displayClock: "4:32", type: { state, completed: state === "post" } },
      },
    ],
  });

  const respond = (payload) => Promise.resolve({ ok: true, json: async () => payload });

  beforeEach(() => {
    clearEspnCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("keeps last night's still-live game on the viewer's today", async () => {
    global.fetch = vi.fn((url) => {
      if (String(url).includes(`dates=${today}`)) return respond({ events: [espnGame("today-live")] });
      if (String(url).includes(`dates=${yesterday}`)) {
        return respond({ events: [espnGame("carry-over"), espnGame("yesterday-final", { state: "post" })] });
      }
      return respond({ events: [] });
    });

    const snapshot = await fetchBasketballSnapshot({ date: today });
    const ids = snapshot.games.map((game) => game.id);

    expect(ids[0]).toBe("carry-over"); // leading, because it is what is live now
    expect(ids).toContain("today-live");
    expect(ids).not.toContain("yesterday-final");
  });

  it("does not ask for yesterday when another day is selected", async () => {
    global.fetch = vi.fn(() => respond({ events: [] }));

    await fetchBasketballSnapshot({ date: shiftDateKey(today, -3) });
    const urls = global.fetch.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes(`dates=${yesterday}`))).toBe(false);
  });

  it("does not list the same game twice", async () => {
    global.fetch = vi.fn(() => respond({ events: [espnGame("shared")] }));

    const snapshot = await fetchBasketballSnapshot({ date: today });
    expect(snapshot.games.filter((game) => game.id === "shared")).toHaveLength(1);
  });
});
