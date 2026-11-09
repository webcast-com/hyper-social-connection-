/** Sample newsroom copy used for the first paint and offline mode. */

// Photography bundled with the app so the newsroom still has artwork offline.
import bballCourtAction from "../assets/news/bball-court-action.jpg";
import bballGame1 from "../assets/news/bball-game-1.jpg";
import bballGame2 from "../assets/news/bball-game-2.jpg";
import bballGame3 from "../assets/news/bball-game-3.jpg";
import bballGame4 from "../assets/news/bball-game-4.jpg";
import bballCourt2 from "../assets/news/bball-court-2.jpg";
import nflTackle1 from "../assets/news/nfl-tackle-1.jpg";
import nflTackle2 from "../assets/news/nfl-tackle-2.jpg";
import nflTackle3 from "../assets/news/nfl-tackle-3.jpg";
import nflTackle4 from "../assets/news/nfl-tackle-4.jpg";
import nflPlayerRed from "../assets/news/nfl-player-red.jpg";
import nflPreSnap from "../assets/news/nfl-pre-snap.jpg";

export const demoNewsImages = {
  basketball: [bballCourtAction, bballGame1, bballGame2, bballGame3, bballGame4, bballCourt2],
  football: [nflTackle1, nflTackle2, nflTackle3, nflTackle4, nflPlayerRed, nflPreSnap],
};

export const basketballNews = [
  {
    id: "bal-final",
    tag: "Basketball Africa League",
    accent: "#22a06b",
    title: "Nairobi City Thunder book their place in the BAL final",
    summary:
      "A 22-point night from the bench and a fourth-quarter run in Kigali sent the Thunder through to their first BAL final.",
    author: "ScoreHub Desk",
    published: "2h ago",
    readTime: "4 min read",
    image: bballCourtAction,
  },
  {
    id: "euroleague-round",
    tag: "EuroLeague",
    accent: "#f0a02a",
    title: "Real Madrid edge Olympiacos in a quarter-final classic",
    summary:
      "The WiZink Center stayed on its feet as Madrid closed the game on a 9-2 run to keep the series alive.",
    author: "Elena Costa",
    published: "4h ago",
    readTime: "5 min read",
    image: bballGame1,
  },
  {
    id: "wnba-race",
    tag: "WNBA",
    accent: "#e8590c",
    title: "Aces hold off Liberty to tighten the playoff race",
    summary:
      "Las Vegas leaned on its defence in the final three minutes, forcing two turnovers that decided a 91-87 result.",
    author: "Maya Turner",
    published: "6h ago",
    readTime: "3 min read",
    image: bballGame2,
  },
  {
    id: "nba-celtics",
    tag: "NBA",
    accent: "#1d428a",
    title: "Celtics' bench minutes are quietly winning the East",
    summary:
      "Boston's second unit has out-scored opponents in six straight games, a swing that is showing up in the standings table.",
    author: "Jordan Ellis",
    published: "9h ago",
    readTime: "6 min read",
    image: bballGame3,
  },
  {
    id: "acb-derby",
    tag: "Liga ACB",
    accent: "#c8102e",
    title: "Barcelona and Valencia meet with the table on the line",
    summary:
      "Saturday's Palau Blaugrana fixture could decide who takes top seed into the ACB playoffs.",
    author: "Pau Ferrer",
    published: "12h ago",
    readTime: "4 min read",
    image: bballGame4,
  },
  {
    id: "nbl-sydney",
    tag: "NBL",
    accent: "#0b6bb3",
    title: "Sydney Kings fall short as Melbourne close out late",
    summary:
      "Melbourne United finished on a 12-4 run to take a 102-98 road win and split the season series.",
    author: "Tom Bradley",
    published: "1d ago",
    readTime: "3 min read",
    image: bballCourt2,
  },
];

export const nflNews = [
  {
    id: "kc-buf",
    tag: "NFL",
    accent: "#1d428a",
    title: "Chiefs and Bills trade blows in an AFC heavyweight bout",
    summary:
      "Kansas City leads 24-20 at Arrowhead with the third quarter winding down and both defences on their heels.",
    author: "ScoreHub Desk",
    published: "1h ago",
    readTime: "4 min read",
    image: nflTackle1,
  },
  {
    id: "niners-cowboys",
    tag: "NFL",
    accent: "#aa3b3b",
    title: "49ers' front seven sets the tone against Dallas",
    summary:
      "San Francisco has three sacks before half-time and a 14-10 lead at Levi's Stadium.",
    author: "Danielle Reed",
    published: "3h ago",
    readTime: "5 min read",
    image: nflTackle2,
  },
  {
    id: "playoffs-picture",
    tag: "NFL Playoffs",
    accent: "#7c3aed",
    title: "Ravens' playoff path runs through Baltimore again",
    summary:
      "Sunday's meeting with Cincinnati will decide the AFC North seed and a home wildcard game.",
    author: "Chris Nolan",
    published: "5h ago",
    readTime: "6 min read",
    image: nflTackle3,
  },
  {
    id: "lions-packers",
    tag: "NFL",
    accent: "#1f6feb",
    title: "Lions survive Packers' fourth-quarter surge",
    summary:
      "Detroit's defence held on a goal-line stand with 41 seconds left to preserve a 31-27 win at Ford Field.",
    author: "Alicia Grant",
    published: "8h ago",
    readTime: "3 min read",
    image: nflTackle4,
  },
  {
    id: "afc-north",
    tag: "NFL",
    accent: "#0f766e",
    title: "AFC North is still a three-team race with four weeks left",
    summary:
      "Baltimore, Cincinnati and Cleveland are separated by a single game heading into the weekend.",
    author: "Marcus Lee",
    published: "11h ago",
    readTime: "5 min read",
    image: nflPlayerRed,
  },
  {
    id: "draft-watch",
    tag: "NFL Draft",
    accent: "#b45309",
    title: "Five prospects who helped themselves this weekend",
    summary:
      "A pair of edge rushers and a tackle with 34-inch arms moved up boards after standout pro-day numbers.",
    author: "Nina Patel",
    published: "1d ago",
    readTime: "7 min read",
    image: nflPreSnap,
  },
];
