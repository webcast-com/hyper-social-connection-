import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import { loadMatchSummary, loadTeamDetail } from "../api/espn";
import { resetDocumentMeta } from "./documentMeta";

vi.mock("../api/espn", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, isEspnDisabled: () => false, loadMatchSummary: vi.fn(), loadTeamDetail: vi.fn() };
});

const HOST_HEAD = `
  <title>Basketball Scores — NBA, WNBA, EuroLeague &amp; NCAA Live Scores | Hyper</title>
  <meta name="description" content="served" />
  <link rel="canonical" href="https://hyper.co.ke/nfl-basketball/basketball" />
  <meta property="og:url" content="https://hyper.co.ke/nfl-basketball/basketball" />
  <script type="application/ld+json" data-route="/nfl-basketball/basketball">{"@type":"CollectionPage"}</script>
`;

beforeEach(() => {
  // The document as the host serves it for the basketball hub.
  document.head.innerHTML = HOST_HEAD;
  resetDocumentMeta();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  loadMatchSummary.mockReset();
  loadMatchSummary.mockResolvedValue({ plays: [], teams: [], venue: null, state: null });
  loadTeamDetail.mockReset();
  loadTeamDetail.mockRejectedValue(new Error("offline"));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.head.innerHTML = "";
  document.documentElement.removeAttribute("data-theme");
});

const mount = (path) =>
  render(
    <MemoryRouter basename="/nfl-basketball" initialEntries={[`/nfl-basketball${path}`]}>
      <App />
    </MemoryRouter>
  );

const head = (selector) => document.head.querySelector(selector);
const canonical = () => head('link[rel="canonical"]')?.getAttribute("href") ?? null;
const description = () => head('meta[name="description"]')?.getAttribute("content");
const robots = () => head('meta[name="robots"]')?.getAttribute("content") ?? null;

describe("document metadata follows the screen", () => {
  it("leaves the served hub's tags saying what the host said", async () => {
    mount("/basketball");
    await waitFor(() => expect(description()).toContain("Live basketball scores"));
    expect(document.title).toBe("Basketball Scores — NBA, WNBA, EuroLeague & NCAA Live Scores | Hyper");
    expect(canonical()).toBe("https://hyper.co.ke/nfl-basketball/basketball");
    expect(robots()).toBeNull();
    expect(document.head.querySelectorAll('script[type="application/ld+json"]').length).toBe(1);
    expect(document.head.querySelectorAll('link[rel="canonical"]').length).toBe(1);
  });

  it("rewrites title, description, canonical and sharing tags on navigation", async () => {
    const view = mount("/basketball");
    const tabs = within(view.getByRole("navigation", { name: "Sports" }));
    fireEvent.click(tabs.getByRole("link", { name: "Football" }));
    await waitFor(() => expect(document.title).toBe("NFL Scores — Live American Football Scores, Standings & Fixtures | Hyper"));
    // The public origin the host named is kept; the path is the new screen's.
    expect(canonical()).toBe("https://hyper.co.ke/nfl-basketball/nfl");
    expect(head('meta[property="og:url"]').getAttribute("content")).toBe("https://hyper.co.ke/nfl-basketball/nfl");
    expect(head('meta[property="og:title"]').getAttribute("content")).toBe(document.title);
    expect(description()).toContain("Live NFL scores");
    // The hub's structured data described the page that was left.
    expect(document.head.querySelectorAll('script[type="application/ld+json"]').length).toBe(0);

    const sections = within(view.getByRole("navigation", { name: "Sections" }));
    fireEvent.click(sections.getByRole("link", { name: "News" }));
    await waitFor(() => expect(document.title).toBe("NFL News — Headlines, Match Reports & Previews | Hyper"));
    expect(canonical()).toBe("https://hyper.co.ke/nfl-basketball/nfl/news");
  });

  it("names a match after its teams once ESPN has reported them", async () => {
    loadMatchSummary.mockResolvedValue({
      plays: [], state: "in", statusText: "2nd · 4:11", venue: null,
      teams: [
        { name: "Duke Blue Devils", abbreviation: "DUKE", homeAway: "home", score: "68", logo: null },
        { name: "North Carolina Tar Heels", abbreviation: "UNC", homeAway: "away", score: "64", logo: null },
      ],
    });
    const view = mount("/basketball/match/401700001?competition=ncaam");
    expect(document.title).toBe("NCAA Men's Basketball Game 401700001 — Live Score & Play-by-Play | Hyper");
    await waitFor(() =>
      expect(document.title).toBe("Duke Blue Devils vs North Carolina Tar Heels — Live Score & Play-by-Play | Hyper")
    );
    expect(canonical()).toBe("https://hyper.co.ke/nfl-basketball/basketball/match/401700001?competition=ncaam");
    expect(robots()).toBeNull();
    expect(view.getByRole("heading", { level: 1 }).textContent).toBe("Duke Blue Devils vs North Carolina Tar Heels");
  });

  it("marks a match ESPN does not know as one not to index, and lifts the mark on leaving", async () => {
    const view = mount("/basketball/match/401799999");
    await view.findByText("We couldn't find that match");
    await waitFor(() => expect(robots()).toBe("noindex, follow"));
    fireEvent.click(view.getByRole("link", { name: "Back to Basketball" }));
    await waitFor(() => expect(document.title).toContain("Basketball Scores"));
    expect(robots()).toBeNull();
  });

  it("gives an address with no screen no canonical and a noindex", async () => {
    mount("/basketball/team/not-a-team");
    await waitFor(() => expect(document.title).toBe("Team not found — Basketball on Hyper"));
    expect(canonical()).toBeNull();
    expect(head('meta[property="og:url"]')).toBeNull();
    expect(robots()).toBe("noindex, follow");
  });

  it("does not index a sample game, and uses the name ESPN gives a team", async () => {
    mount("/basketball/match/1");
    await waitFor(() => expect(document.title).toContain("Boston Celtics vs New York Knicks"));
    expect(robots()).toBe("noindex, follow");
    cleanup();

    loadTeamDetail.mockResolvedValue({ info: { name: "Oklahoma City Thunder", logo: null }, games: [], roster: [] });
    mount("/basketball/team/oklahoma-city");
    await waitFor(() => expect(document.title).toBe("Oklahoma City Thunder — Scores, Fixtures, Squad & Standings | Hyper"));
    expect(canonical()).toBe("https://hyper.co.ke/nfl-basketball/basketball/team/oklahoma-city");
    expect(robots()).toBeNull();
  });

  it("leaves a robots tag the host wrote for the whole deployment alone", async () => {
    document.head.insertAdjacentHTML("beforeend", '<meta name="robots" content="noindex, nofollow" />');
    mount("/basketball");
    await waitFor(() => expect(description()).toContain("Live basketball scores"));
    expect(robots()).toBe("noindex, nofollow");
  });

  it("falls back to the page's own origin when the host named none", async () => {
    document.head.innerHTML = "";
    resetDocumentMeta();
    mount("/nfl/upcoming");
    await waitFor(() => expect(document.title).toBe("NFL Schedule — Upcoming Games & Kick-off Times | Hyper"));
    expect(canonical()).toBe(`${window.location.origin}/nfl-basketball/nfl/upcoming`);
  });
});

describe("one headline per screen", () => {
  it.each([
    ["/basketball", "Basketball live scores, fixtures and standings"],
    ["/nfl", "NFL live scores, fixtures and standings"],
    ["/basketball/upcoming", "Upcoming basketball fixtures"],
    ["/nfl/upcoming", "Upcoming NFL games"],
    ["/basketball/top-scorers", "Basketball top scorers"],
    ["/nfl/top-scorers", "NFL top scorers"],
    ["/basketball/news", "Basketball news"],
    ["/nfl/news", "NFL news"],
    ["/basketball/team/boston-celtics", "Boston Celtics"],
    ["/basketball/player/luka-doncic", "Luka Dončić"],
    ["/basketball/match/1", "Boston Celtics vs New York Knicks"],
    ["/cricket", "Cricket coverage is coming soon"],
    ["/tennis", "Page not found"],
  ])("%s has the headline the host pre-renders for it", async (path, heading) => {
    const { routeMeta } = await import("./routeMeta");
    const view = mount(path);
    const headings = view.getAllByRole("heading", { level: 1 });
    expect(headings.map((node) => node.textContent)).toEqual([heading]);
    expect(routeMeta(path).heading).toBe(heading);
  });

  it("says an unknown address is not a page instead of showing the basketball scores", async () => {
    const view = mount("/tennis/scores");
    expect(view.getByRole("heading", { level: 1 }).textContent).toBe("Page not found");
    await waitFor(() => expect(robots()).toBe("noindex, follow"));
    expect(canonical()).toBeNull();
    expect(view.getByRole("link", { name: "NFL scores" }).getAttribute("href")).toBe("/nfl-basketball/nfl");
  });
});
