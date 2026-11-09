import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import App from "./App";
import { routerBase } from "./routerBase";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.documentElement.removeAttribute("data-theme"); });

function mount(path) {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  return render(<MemoryRouter basename={routerBase("/nfl-basketball/")} initialEntries={[`/nfl-basketball${path}`]}><App /></MemoryRouter>);
}

describe("integrated dashboard navigation", () => {
  it.each(["/nfl-basketball", "/nfl-basketball/"])("opens the entry URL %s and redirects to basketball", async (entry) => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const view = render(<MemoryRouter basename={routerBase("/nfl-basketball/")} initialEntries={[entry]}><App /></MemoryRouter>);
    expect(await view.findByText("Basketball Center")).toBeTruthy();
    expect(view.getByRole("link", { name: "Football" }).getAttribute("href")).toBe("/nfl-basketball/nfl");
  });

  it("supports the dashboard's standalone root development base", () => {
    expect(routerBase("/")).toBe("/");
    expect(routerBase("/nfl-basketball/")).toBe("/nfl-basketball");
  });

  it("moves between basketball, NFL and their respective sections under the prefix", async () => {
    const view = mount("/basketball");
    const tabs = within(view.getByRole("navigation", { name: "Sports" }));
    expect(tabs.getByRole("link", { name: "Football" }).getAttribute("href")).toBe("/nfl-basketball/nfl");
    fireEvent.click(tabs.getByRole("link", { name: "Football" }));
    expect(await view.findByText("NFL Center")).toBeTruthy();
    const sections = within(view.getByRole("navigation", { name: "Sections" }));
    expect(sections.getByRole("link", { name: "News" }).getAttribute("href")).toBe("/nfl-basketball/nfl/news");
    fireEvent.click(sections.getByRole("link", { name: "News" }));
    expect((await view.findByRole("heading", { level: 1 })).textContent).toBe("Latest news");
    expect(view.container.textContent).toContain("Football newsroom");
    fireEvent.click(sections.getByRole("link", { name: "Upcoming" }));
    expect(view.container.textContent).toContain("Football schedule");
    fireEvent.click(tabs.getByRole("link", { name: "Basketball" }));
    expect(await view.findByText("Basketball Center")).toBeTruthy();
  });

  it("wires the rail to real destinations and marks unavailable features", async () => {
    const view = mount("/nfl");
    const shortcuts = within(view.getByRole("navigation", { name: "Dashboard shortcuts" }));
    expect(shortcuts.getByRole("link", { name: "Community" }).getAttribute("href")).toBe("/groups");
    expect(shortcuts.getByRole("link", { name: "Alerts" }).getAttribute("href")).toBe("/notifications");
    expect(view.getAllByRole("link", { name: "Back to Hyper Sports" }).every((link) => link.getAttribute("href") === "/sports")).toBe(true);
    expect(shortcuts.getByRole("button", { name: "Watch live unavailable" }).disabled).toBe(true);
    expect(shortcuts.getByRole("button", { name: "Trophies unavailable" }).disabled).toBe(true);
    expect(shortcuts.getByRole("link", { name: "Schedule" }).getAttribute("href")).toBe("/nfl-basketball/nfl/upcoming");
    fireEvent.click(shortcuts.getByRole("link", { name: "Schedule" }));
    expect(await view.findByText("Football schedule")).toBeTruthy();
    fireEvent.click(shortcuts.getByRole("link", { name: "News" }));
    expect(await view.findByText("Football newsroom")).toBeTruthy();
    fireEvent.click(shortcuts.getByRole("link", { name: "Overview" }));
    expect(await view.findByText("NFL Center")).toBeTruthy();
  });

  it.each([
    ["/basketball/team/boston-celtics", "Boston Celtics"],
    ["/basketball/player/luka-doncic", "Luka Dončić"],
    ["/nfl/team/kansas-city-chiefs", "Kansas City Chiefs"],
  ])("opens the nested detail route %s directly", async (path, heading) => {
    const view = mount(path);
    expect((await view.findByRole("heading", { level: 1 })).textContent).toBe(heading);
    expect(within(view.getByRole("navigation", { name: "Breadcrumb" })).getAllByRole("link")[0].getAttribute("href")).toMatch(/^\/nfl-basketball\//);
  });

  it("opens a match URL with its competition query", async () => {
    const view = mount("/basketball/match/7?competition=ncaam");
    expect(view.container.querySelector(".sh-match-hero")).toBeTruthy();
    expect(view.container.textContent).toContain("Sample play-by-play");
  });

  it("starts on deep links and browser back and forward stay inside the dashboard", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    window.history.replaceState(null, "", "/nfl-basketball/nfl/news");
    const view = render(<BrowserRouter basename={routerBase("/nfl-basketball/")}><App /></BrowserRouter>);
    expect(await view.findByText("Football newsroom")).toBeTruthy();
    const sections = within(view.getByRole("navigation", { name: "Sections" }));
    fireEvent.click(sections.getByRole("link", { name: "Upcoming" }));
    expect(window.location.pathname).toBe("/nfl-basketball/nfl/upcoming");
    window.history.back();
    await waitFor(() => expect(window.location.pathname).toBe("/nfl-basketball/nfl/news"));
    expect(await view.findByText("Football newsroom")).toBeTruthy();
    window.history.forward();
    await waitFor(() => expect(window.location.pathname).toBe("/nfl-basketball/nfl/upcoming"));
    expect(await view.findByText("Football schedule")).toBeTruthy();
  });
});
