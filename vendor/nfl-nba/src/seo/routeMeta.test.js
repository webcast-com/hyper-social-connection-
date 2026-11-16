import { describe, expect, it } from "vitest";
import { DETAIL_SPORTS } from "../data/detailConfig";
import { LEAGUE_BY_COMPETITION } from "../api/espn";
import { buildPlayerIndex, buildTeamIndex } from "../utils/entities";
import {
  MATCH_COMPETITIONS,
  documentTitle,
  indexableRoutes,
  playerHasFeed,
  routeMeta,
  sportIndex,
  teamHasFeed,
} from "./routeMeta";

describe("the pages a URL can be", () => {
  it("knows exactly the teams and players the detail screens can open", () => {
    // routeMeta cannot import detailConfig (it pulls in portrait artwork), so it
    // repeats the lists. If they drift, a team's page is told it does not exist.
    for (const sport of ["basketball", "football"]) {
      const config = DETAIL_SPORTS[sport];
      expect([...sportIndex(sport).teams.keys()]).toEqual([...buildTeamIndex(config).keys()]);
      expect([...sportIndex(sport).players.keys()]).toEqual([...buildPlayerIndex(config.leaders).keys()]);
    }
    // Every NBA team in the standings has a page, not only the ones with a fixture.
    expect(routeMeta("/basketball/team/milwaukee-bucks").kind).toBe("team");
    expect(routeMeta("/basketball/team/denver-nuggets").status).toBe(200);
  });

  it("accepts in a match address only competitions the ESPN client has a feed for", () => {
    const named = [...Object.keys(MATCH_COMPETITIONS.basketball), ...Object.keys(MATCH_COMPETITIONS.football)];
    expect(named.sort()).toEqual(Object.keys(LEAGUE_BY_COMPETITION).sort());
  });

  it("gives hubs and sections a title, heading and description of their own", () => {
    const paths = [
      "/basketball", "/nfl",
      "/basketball/upcoming", "/basketball/top-scorers", "/basketball/news",
      "/nfl/upcoming", "/nfl/top-scorers", "/nfl/news",
    ];
    const pages = paths.map((path) => routeMeta(path));
    for (const [index, page] of pages.entries()) {
      expect(page.path).toBe(paths[index]);
      expect(page.status).toBe(200);
      expect(page.index).toBe(true);
      expect(page.description.length).toBeGreaterThan(70);
      expect(page.description.length).toBeLessThanOrEqual(170);
      expect(documentTitle(page).length).toBeLessThanOrEqual(75);
    }
    expect(new Set(pages.map((page) => page.title)).size).toBe(paths.length);
    expect(new Set(pages.map((page) => page.description)).size).toBe(paths.length);
    expect(new Set(pages.map((page) => page.heading)).size).toBe(paths.length);
    expect(routeMeta("/nfl/upcoming").crumbs).toEqual([
      { name: "NFL", path: "/nfl" },
      { name: "Upcoming", path: "/nfl/upcoming" },
    ]);
  });

  it("treats the entry URL as the basketball hub and a trailing slash as nothing", () => {
    expect(routeMeta("").path).toBe("/basketball");
    expect(routeMeta("/").title).toBe(routeMeta("/basketball").title);
    expect(routeMeta("/basketball/").path).toBe("/basketball");
  });

  it("puts the site's name in the document title once", () => {
    expect(documentTitle(routeMeta("/basketball"))).toBe("Basketball Scores — NBA, WNBA, EuroLeague & NCAA Live Scores | Hyper");
    expect(documentTitle(routeMeta("/cricket"))).toBe("Cricket Scores — Coming Soon to Hyper Sports");
  });
});

describe("team pages", () => {
  it("names the team, and points its other addresses at the one that is the page", () => {
    const celtics = routeMeta("/basketball/team/boston-celtics");
    expect(celtics.title).toBe("Boston Celtics — Scores, Fixtures, Squad & Standings");
    expect(celtics.heading).toBe("Boston Celtics");
    expect(celtics.description).toContain("in the NBA");
    expect(celtics.index).toBe(true);
    // The app opens the same team by its code; that is not a second page.
    expect(routeMeta("/basketball/team/BOS").path).toBe("/basketball/team/boston-celtics");
    expect(routeMeta("/basketball/team/bos").path).toBe("/basketball/team/boston-celtics");
    expect(routeMeta("/nfl/team/kansas-city-chiefs").description).toContain("football scores");
  });

  it("is a 404 for a team the app has no screen for, including the other sport's", () => {
    for (const path of ["/basketball/team/kansas-city-chiefs", "/nfl/team/boston-celtics", "/nfl/team/nope"]) {
      const page = routeMeta(path);
      expect(page.kind).toBe("not-found");
      expect(page.status).toBe(404);
      expect(page.index).toBe(false);
      expect(page.title).toContain("Team not found");
    }
  });

  it("keeps a team that can only show sample fixtures out of the index", () => {
    // The Basketball Africa League has no ESPN feed: the page is the sample.
    const thunder = routeMeta("/basketball/team/nairobi-city-thunder");
    expect(thunder.status).toBe(200);
    expect(thunder.index).toBe(false);
    // A team filed under an NFL phase still reads the NFL feed.
    const { teams } = sportIndex("football");
    const playoffTeam = [...teams.values()].find((team) => team.competitionId === "playoffs");
    expect(playoffTeam).toBeTruthy();
    expect(teamHasFeed("football", playoffTeam)).toBe(true);
    expect(routeMeta(`/nfl/team/${playoffTeam.key}`).description).toContain("in the NFL,");
    expect(teamHasFeed("basketball", null)).toBe(false);
  });

  it("takes the fuller name ESPN reports once the screen has it", () => {
    const page = routeMeta("/basketball/team/oklahoma-city", "", { name: "Oklahoma City Thunder" });
    expect(page.title).toBe("Oklahoma City Thunder — Scores, Fixtures, Squad & Standings");
    expect(page.path).toBe("/basketball/team/oklahoma-city");
  });
});

describe("player pages", () => {
  it("names the player without repeating the sample season's team or figure", () => {
    const page = routeMeta("/basketball/player/luka-doncic");
    expect(page.title).toBe("Luka Dončić — Season Stats & Player Profile");
    expect(page.description).not.toMatch(/Mavericks|33\.9/);
    expect(page.keywords.join(" ")).not.toMatch(/Mavericks/);
  });

  it("is indexable only when the profile can load from ESPN", () => {
    expect(playerHasFeed({ name: "A", espnId: "3945274" })).toBe(true);
    expect(playerHasFeed({ name: "A" })).toBe(false);
    for (const player of sportIndex("basketball").players.values()) {
      expect(routeMeta(`/basketball/player/${player.key}`).index).toBe(playerHasFeed(player));
    }
    expect(routeMeta("/nfl/player/luka-doncic").status).toBe(404);
  });
});

describe("match pages", () => {
  it("is a real fixture's page for an ESPN event id, named by competition until the teams are known", () => {
    const page = routeMeta("/basketball/match/401234567");
    expect(page.status).toBe(200);
    expect(page.index).toBe(true);
    expect(page.title).toBe("NBA Game 401234567 — Live Score & Play-by-Play");
    expect(page.entity.name).toBeNull();
    const named = routeMeta("/basketball/match/401234567", "", {
      home: "Boston Celtics", away: "New York Knicks", competition: "NBA",
    });
    expect(named.title).toBe("Boston Celtics vs New York Knicks — Live Score & Play-by-Play");
    expect(named.heading).toBe("Boston Celtics vs New York Knicks");
    expect(named.description).toContain("from the NBA");
    expect(named.path).toBe("/basketball/match/401234567");
  });

  it("keeps a competition in the address only when it changes which game is shown", () => {
    // A college game is a different feed: without the parameter the page is another game.
    const college = routeMeta("/basketball/match/401234567", "?competition=ncaam&utm_source=x");
    expect(college.path).toBe("/basketball/match/401234567?competition=ncaam");
    expect(college.title).toContain("NCAA Men's Basketball Game 401234567");
    expect(college.index).toBe(true);
    // The flagship, its phases and an unknown value all show the flagship feed.
    expect(routeMeta("/basketball/match/401234567", "?competition=nba").path).toBe("/basketball/match/401234567");
    expect(routeMeta("/nfl/match/401234567", "?competition=playoffs").path).toBe("/nfl/match/401234567");
    expect(routeMeta("/nfl/match/401234567", "?competition=playoffs").title).toContain("NFL Playoffs Game");
    expect(routeMeta("/nfl/match/401234567", "?competition=playoffs").index).toBe(true);
    expect(routeMeta("/basketball/match/401234567", "?competition=whatever").path).toBe("/basketball/match/401234567");
    expect(routeMeta("/basketball/match/401234567", "?competition=whatever").index).toBe(true);
    expect(routeMeta("/nfl/match/401234567", "?competition=cfb").path).toBe("/nfl/match/401234567?competition=cfb");
  });

  it("does not index the other sport's game on this sport's page", () => {
    const page = routeMeta("/basketball/match/401234567", "?competition=cfb");
    expect(page.index).toBe(false);
    expect(page.status).toBe(200);
  });

  it("serves a bundled sample game and keeps its invented score out of the index", () => {
    const page = routeMeta("/basketball/match/1");
    expect(page.status).toBe(200);
    expect(page.index).toBe(false);
    expect(page.entity.sample).toBe(true);
    expect(page.title).toContain("Boston Celtics vs New York Knicks");
  });

  it("stops being indexable when ESPN has no such game", () => {
    expect(routeMeta("/basketball/match/401234567", "", { notFound: true }).index).toBe(false);
  });

  it("is a 404 for anything that is not an event id", () => {
    for (const id of ["abc", "0", "12345", "401234567x", "-1", "4012345678901234567"]) {
      const page = routeMeta(`/basketball/match/${id}`);
      expect(page.status, id).toBe(404);
      expect(page.index, id).toBe(false);
    }
  });
});

describe("everything else", () => {
  it("serves the coming-soon screens without offering them to an index", () => {
    for (const sport of ["cricket", "badminton", "hockey"]) {
      const page = routeMeta(`/${sport}`);
      expect(page.status).toBe(200);
      expect(page.index).toBe(false);
      expect(page.path).toBe(`/${sport}`);
    }
  });

  it("is a 404 for an address the router would bounce to a hub", () => {
    for (const path of ["/tennis", "/cricket/scores", "/basketball/team", "/basketball/team/boston-celtics/extra", "/nfl/standings", "/%E0%A4%A"]) {
      const page = routeMeta(path);
      expect(page.status, path).toBe(404);
      expect(page.index, path).toBe(false);
    }
  });

  it("lists for a sitemap only pages that are indexable, each once", () => {
    const routes = indexableRoutes();
    const paths = routes.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain("/basketball");
    expect(paths).toContain("/nfl/top-scorers");
    expect(paths).toContain("/basketball/team/milwaukee-bucks");
    expect(paths).not.toContain("/basketball/team/nairobi-city-thunder");
    for (const route of routes) {
      const page = routeMeta(route.path);
      expect(page.index, route.path).toBe(true);
      expect(page.path, route.path).toBe(route.path);
    }
  });

  it("links every page onward, and a hub to every team page", () => {
    const hub = routeMeta("/basketball");
    const hrefs = hub.links.map((link) => link.path);
    expect(hrefs).toContain("/basketball/upcoming");
    expect(hrefs).toContain("/nfl");
    expect(hrefs).toContain("/basketball/team/boston-celtics");
    expect(hrefs.filter((href) => href.includes("/team/")).length).toBe(sportIndex("basketball").teams.size);
    for (const path of ["/nfl/news", "/nfl/team/kansas-city-chiefs", "/basketball/player/luka-doncic", "/basketball/match/401234567", "/tennis", "/cricket"]) {
      const page = routeMeta(path);
      expect(page.links.length, path).toBeGreaterThan(0);
      for (const link of page.links) expect(routeMeta(link.path).status, `${path} → ${link.path}`).toBe(200);
    }
  });
});
