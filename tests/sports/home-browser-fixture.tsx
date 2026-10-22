import { createRoot } from 'react-dom/client';
import Home from '../../src/app/page';
import Navbar from '../../src/components/Navbar';
import type { SportsBoard } from '../../src/lib/sports';

declare global {
  interface Window {
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
      { id: 'review-ipl', source: demo ? 'demo' : 'thesportsdb', sport: 'cricket', league: 'ipl', leagueName: 'Indian Premier League',
        status: 'final', startAt: '2026-10-22T18:00:00Z', detail: 'Home won by 4 wickets',
        home: { name: 'Mumbai Indians', score: 184 }, away: { name: 'Chennai Super Kings', score: 183 } },
    ],
    predictions: [{ id: 'unrelated', source: demo ? 'demo' : 'rapidapi', federation: 'UEFA', market: '1X2', startAt: '2026-10-22T18:00:00Z',
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
