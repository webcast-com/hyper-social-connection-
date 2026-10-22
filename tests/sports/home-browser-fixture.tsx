import { createRoot } from 'react-dom/client';
import Home from '../../src/app/page';
import PredictionsPage from '../../src/app/sports/predictions/page';
import Navbar from '../../src/components/Navbar';
import type { OddsBoard } from '../../src/lib/espn-odds';
import type { SportsBoard } from '../../src/lib/sports';

declare global {
  interface Window {
    renderPredictionsReview: (status?: OddsBoard['status'], signedIn?: boolean) => Promise<void>;
    oddsReviewBoard: OddsBoard;
    predictionPosts: Record<string, FormDataEntryValue>[];
    homeReviewBoard: SportsBoard;
    homeReviewUser: { id: number; name: string; avatar: null } | null;
    renderHomeReview: (signedIn: boolean, demo?: boolean, scenario?: 'match' | 'race' | 'missing-score') => Promise<void>;
  }
}
const root = createRoot(document.getElementById('root')!);
let key = 0;
window.renderHomeReview = async (signedIn, demo = false, scenario = 'match') => {
  window.homeReviewUser = signedIn ? { id: 1, name: 'Review User', avatar: null } : null;
  window.homeReviewBoard = {
    mode: demo ? 'demo' : 'live', sources: [], fetchedAt: new Date().toISOString(),
    events: [
      { id: 'review-epl', source: demo ? 'demo' : 'espn', sport: 'football', league: 'epl', leagueName: 'Premier League',
        status: 'live', startAt: '2026-10-22T18:00:00Z', detail: 'Extra time — second half of an extended match',
        home: { name: 'Very Long International Home Club Name', score: 12, logo: '/team.svg' }, away: { name: 'Very Long International Away Club Name', score: 10, logo: '/team.svg' } },
      { id: 'review-nba', source: demo ? 'demo' : 'espn', sport: 'basketball', league: 'nba', leagueName: 'NBA',
        status: 'final', startAt: '2026-10-22T18:00:00Z', detail: 'Final after overtime',
        home: { name: 'Golden State Warriors', score: 184 }, away: { name: 'Denver Nuggets', score: 183 } },
    ],
    predictions: [{ id: 'unrelated', source: demo ? 'demo' : 'manual', federation: 'UEFA', market: '1X2', startAt: '2026-10-22T18:00:00Z',
      homeTeam: 'Real Madrid', awayTeam: 'Bayern Munich', prediction: '1X', competition: 'Champions League' }],
  };
  if (scenario === 'race') window.homeReviewBoard.events.unshift({
    id: 'review-f1', source: 'espn', sport: 'motorsport', league: 'f1', leagueName: 'Formula 1',
    status: 'live', startAt: '2026-10-22T18:00:00Z',
    home: { name: 'Leading Driver' }, away: { name: 'Second Driver' },
    race: { title: 'Review Grand Prix', entries: [{ name: 'Leading Driver', position: 1 }, { name: 'Second Driver', position: 2 }] },
  });
  if (scenario === 'missing-score') {
    window.homeReviewBoard.events[0].home.score = null;
    window.homeReviewBoard.events[0].away.score = null;
  }
  const home = await Home();
  root.render(<div key={++key}>
    <Navbar user={window.homeReviewUser} unreadCount={signedIn ? 2 : 0} />
    <main className="app-main app-surface max-w-7xl mx-auto">{home}</main>
  </div>);
};

// Provider HTTP and viewer boundaries are mocked; render the actual async route.
window.renderPredictionsReview = async (status = 'empty', signedIn = false) => {
  window.homeReviewUser = signedIn ? { id: 1, name: 'Review User', avatar: null } : null;
  window.predictionPosts = [];
  window.oddsReviewBoard = {
    status, fetchedAt: '2026-10-22T00:00:00Z', truncated: false,
    sources: [{ path: 'soccer/eng.1', date: null, ok: status !== 'unavailable', count: 8 }],
    matches: status === 'ready' || status === 'partial' ? Array.from({ length: 8 }, (_, i) => ({
      id: `odds-${i}`, sport: 'football', league: 'Premier League', path: 'soccer/eng.1',
      home_team: 'Very Long International Home Club Name', away_team: 'Very Long International Away Club Name',
      home_logo: null, away_logo: null, kickoff: '2030-10-22T18:00:00Z', venue: 'Review Stadium',
      is_premium: i >= 6, odds: { home: 1.8, away: 3.2, draw: 3.5, over_under: 2.5, spread: null, provider: 'Review bookmaker' },
    })) : [],
  };
  const content = await PredictionsPage();
  root.render(<div key={++key}>
    <Navbar user={window.homeReviewUser} />
    <main className="app-main app-surface max-w-7xl mx-auto">{content}</main>
  </div>);
};
