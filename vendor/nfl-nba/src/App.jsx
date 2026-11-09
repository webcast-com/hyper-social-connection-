import React, { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import BasketballPage from "./pages/BasketballPage";
import NFLPage from "./pages/NFLPage";
import ComingSoonPage from "./pages/ComingSoonPage";
import TeamPage from "./pages/TeamPage";
import PlayerPage from "./pages/PlayerPage";
import NewsPage from "./pages/NewsPage";
import TopScorersPage from "./pages/TopScorersPage";
import UpcomingPage from "./pages/UpcomingPage";
import MatchPage from "./pages/MatchPage";
import { IconRail, TopBar } from "./components/Shell";
import { SubNav } from "./components/SubNav";

const THEME_KEY = "scorehub:theme";

function initialTheme() {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  }
  return "dark";
}

export default function App() {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (typeof localStorage !== "undefined") localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const focusSearch = useCallback(() => {
    const input = document.querySelector("[data-page-search]");
    if (input) {
      input.focus();
      input.select?.();
    }
  }, []);

  return (
    <div className="sh-app">
      <IconRail />
      <div className="sh-shell">
        <TopBar theme={theme} onThemeChange={setTheme} onSearch={focusSearch} />
        <SubNav />
        <Routes>
          <Route path="/" element={<Navigate to="/basketball" replace />} />
          <Route path="/basketball" element={<BasketballPage />} />
          <Route path="/nfl" element={<NFLPage />} />
          <Route path="/basketball/team/:teamKey" element={<TeamPage sport="basketball" />} />
          <Route path="/basketball/player/:playerKey" element={<PlayerPage sport="basketball" />} />
          <Route path="/nfl/team/:teamKey" element={<TeamPage sport="football" />} />
          <Route path="/nfl/player/:playerKey" element={<PlayerPage sport="football" />} />
          <Route path="/basketball/upcoming" element={<UpcomingPage sport="basketball" />} />
          <Route path="/nfl/upcoming" element={<UpcomingPage sport="football" />} />
          <Route path="/basketball/top-scorers" element={<TopScorersPage sport="basketball" />} />
          <Route path="/nfl/top-scorers" element={<TopScorersPage sport="football" />} />
          <Route path="/basketball/news" element={<NewsPage sport="basketball" />} />
          <Route path="/nfl/news" element={<NewsPage sport="football" />} />
          <Route path="/basketball/match/:matchId" element={<MatchPage sport="basketball" />} />
          <Route path="/nfl/match/:matchId" element={<MatchPage sport="football" />} />
          <Route path="/cricket" element={<ComingSoonPage sport="Cricket" />} />
          <Route path="/badminton" element={<ComingSoonPage sport="Badminton" />} />
          <Route path="/hockey" element={<ComingSoonPage sport="Hockey" />} />
          <Route path="*" element={<Navigate to="/basketball" replace />} />
        </Routes>
      </div>
    </div>
  );
}
