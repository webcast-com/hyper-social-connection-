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

export const demoPlayerImages = {
  basketball: [nbaPortrait1, nbaPortrait2, nbaPortrait3, nbaPortrait4, nbaPortrait5],
  football: [nflPortrait1, nflPortrait2, nflPortrait3, nflPortrait4, nflPortrait5],
};

export function portraitFor(sport, name) {
  const pool = demoPlayerImages[sport] ?? demoPlayerImages.basketball;
  const seed = [...String(name)].reduce((total, char) => total + char.charCodeAt(0), 0);
  return pool[seed % pool.length];
}

export const basketballScorers = [
  {
    metric: "Points per game",
    short: "PPG",
    entries: [
      { name: "Luka Dončić", team: "Dallas Mavericks", teamAbbr: "DAL", value: "33.9", initials: "LD" },
      { name: "Shai Gilgeous-Alexander", team: "Oklahoma City", teamAbbr: "OKC", value: "31.4", initials: "SA" },
      { name: "Giannis Antetokounmpo", team: "Milwaukee Bucks", teamAbbr: "MIL", value: "30.8", initials: "GA" },
      { name: "Jayson Tatum", team: "Boston Celtics", teamAbbr: "BOS", value: "27.6", initials: "JT" },
      { name: "Tyrese Haliburton", team: "Indiana Pacers", teamAbbr: "IND", value: "24.1", initials: "TH" },
    ],
  },
  {
    metric: "Rebounds per game",
    short: "RPG",
    entries: [
      { name: "Nikola Jokić", team: "Denver Nuggets", teamAbbr: "DEN", value: "12.4", initials: "NJ" },
      { name: "Domantas Sabonis", team: "Sacramento Kings", teamAbbr: "SAC", value: "12.1", initials: "DS" },
      { name: "Rudy Gobert", team: "Minnesota", teamAbbr: "MIN", value: "11.3", initials: "RG" },
      { name: "Victor Wembanyama", team: "San Antonio Spurs", teamAbbr: "SAS", value: "10.8", initials: "VW" },
      { name: "Anthony Davis", team: "Los Angeles Lakers", teamAbbr: "LAL", value: "10.2", initials: "AD" },
    ],
  },
  {
    metric: "Assists per game",
    short: "APG",
    entries: [
      { name: "Tyrese Haliburton", team: "Indiana Pacers", teamAbbr: "IND", value: "10.9", initials: "TH" },
      { name: "Trae Young", team: "Atlanta Hawks", teamAbbr: "ATL", value: "10.4", initials: "TY" },
      { name: "Luka Dončić", team: "Dallas Mavericks", teamAbbr: "DAL", value: "9.6", initials: "LD" },
      { name: "James Harden", team: "LA Clippers", teamAbbr: "LAC", value: "9.1", initials: "JH" },
      { name: "Nikola Jokić", team: "Denver Nuggets", teamAbbr: "DEN", value: "8.9", initials: "NJ" },
    ],
  },
  {
    metric: "Blocks per game",
    short: "BPG",
    entries: [
      { name: "Victor Wembanyama", team: "San Antonio Spurs", teamAbbr: "SAS", value: "3.6", initials: "VW" },
      { name: "Brook Lopez", team: "Milwaukee Bucks", teamAbbr: "MIL", value: "2.7", initials: "BL" },
      { name: "Jaren Jackson Jr.", team: "Memphis Grizzlies", teamAbbr: "MEM", value: "2.3", initials: "JJ" },
      { name: "Rudy Gobert", team: "Minnesota", teamAbbr: "MIN", value: "2.1", initials: "RG" },
      { name: "Chet Holmgren", team: "Oklahoma City", teamAbbr: "OKC", value: "1.9", initials: "CH" },
    ],
  },
];

export const nflScorers = [
  {
    metric: "Passing yards",
    short: "PASS",
    entries: [
      { name: "Lamar Jackson", team: "Baltimore Ravens", teamAbbr: "BAL", value: "3,678", initials: "LJ" },
      { name: "Patrick Mahomes", team: "Kansas City Chiefs", teamAbbr: "KC", value: "3,512", initials: "PM" },
      { name: "Josh Allen", team: "Buffalo Bills", teamAbbr: "BUF", value: "3,401", initials: "JA" },
      { name: "Jared Goff", team: "Detroit Lions", teamAbbr: "DET", value: "3,288", initials: "JG" },
      { name: "Brock Purdy", team: "San Francisco 49ers", teamAbbr: "SF", value: "3,144", initials: "BP" },
    ],
  },
  {
    metric: "Rushing yards",
    short: "RUSH",
    entries: [
      { name: "Christian McCaffrey", team: "San Francisco 49ers", teamAbbr: "SF", value: "1,459", initials: "CM" },
      { name: "Derrick Henry", team: "Baltimore Ravens", teamAbbr: "BAL", value: "1,312", initials: "DH" },
      { name: "Saquon Barkley", team: "Philadelphia Eagles", teamAbbr: "PHI", value: "1,244", initials: "SB" },
      { name: "Bijan Robinson", team: "Atlanta Falcons", teamAbbr: "ATL", value: "1,109", initials: "BR" },
      { name: "Jahmyr Gibbs", team: "Detroit Lions", teamAbbr: "DET", value: "1,041", initials: "JG" },
    ],
  },
  {
    metric: "Receiving yards",
    short: "REC",
    entries: [
      { name: "Tyreek Hill", team: "Miami Dolphins", teamAbbr: "MIA", value: "1,799", initials: "TH" },
      { name: "CeeDee Lamb", team: "Dallas Cowboys", teamAbbr: "DAL", value: "1,614", initials: "CL" },
      { name: "Amon-Ra St. Brown", team: "Detroit Lions", teamAbbr: "DET", value: "1,422", initials: "AS" },
      { name: "A.J. Brown", team: "Philadelphia Eagles", teamAbbr: "PHI", value: "1,344", initials: "AB" },
      { name: "Nico Collins", team: "Houston Texans", teamAbbr: "HOU", value: "1,201", initials: "NC" },
    ],
  },
  {
    metric: "Sacks",
    short: "SACK",
    entries: [
      { name: "Myles Garrett", team: "Cleveland Browns", teamAbbr: "CLE", value: "14.0", initials: "MG" },
      { name: "T.J. Watt", team: "Pittsburgh Steelers", teamAbbr: "PIT", value: "13.5", initials: "TW" },
      { name: "Micah Parsons", team: "Dallas Cowboys", teamAbbr: "DAL", value: "12.0", initials: "MP" },
      { name: "Nick Bosa", team: "San Francisco 49ers", teamAbbr: "SF", value: "11.5", initials: "NB" },
      { name: "Danielle Hunter", team: "Houston Texans", teamAbbr: "HOU", value: "10.5", initials: "DH" },
    ],
  },
];
