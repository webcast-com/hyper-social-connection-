/** Leaderboards for the Top scorers screen (demo data, ESPN overrides when live). */

// Portrait art bundled with the app. Real ESPN headshots replace it as soon as
// the leaders feed answers; until then each row keeps the same artwork.
import nbaPortrait1 from "../assets/players/nba-portrait-1.jpg";
import nbaPortrait2 from "../assets/players/nba-portrait-2.jpg";
import nbaPortrait3 from "../assets/players/nba-portrait-3.jpg";
import nbaPortrait4 from "../assets/players/nba-portrait-4.jpg";
import nbaPortrait5 from "../assets/players/nba-portrait-5.jpg";
import nflPortrait1 from "../assets/players/nfl-portrait-1.jpg";
import nflPortrait2 from "../assets/players/nfl-portrait-2.jpg";
import nflPortrait3 from "../assets/players/nfl-portrait-3.jpg";
import nflPortrait4 from "../assets/players/nfl-portrait-4.jpg";
import nflPortrait5 from "../assets/players/nfl-portrait-5.jpg";
import { basketballScorers, nflScorers } from "./scorerBoards";

// Re-exported so every existing importer keeps working unchanged.
export { basketballScorers, nflScorers };

export const demoPlayerImages = {
  basketball: [nbaPortrait1, nbaPortrait2, nbaPortrait3, nbaPortrait4, nbaPortrait5],
  football: [nflPortrait1, nflPortrait2, nflPortrait3, nflPortrait4, nflPortrait5],
};

export function portraitFor(sport, name) {
  const pool = demoPlayerImages[sport] ?? demoPlayerImages.basketball;
  const seed = [...String(name)].reduce((total, char) => total + char.charCodeAt(0), 0);
  return pool[seed % pool.length];
}


