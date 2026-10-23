import { createRoot } from 'react-dom/client';
import Home from '../../src/app/page';
import PredictionsPage from '../../src/app/sports/predictions/page';
import MatchDetailsPage from '../../src/app/sports/matches/[league]/[eventId]/page';
import { parseMatchDetails, resolveMatch, type MatchBoard } from '../../src/lib/espn-match';
import { summaryFixture } from './match-fixture';
import AboutPage from '../../src/app/about/page';
import PrivacyPage from '../../src/app/privacy/page';
import SiteFooter from '../../src/components/SiteFooter';
import Navbar from '../../src/components/Navbar';
import type { OddsBoard } from '../../src/lib/espn-odds';
import type { SportsBoard } from '../../src/lib/sports';

declare global {
  interface Window {
    renderInformationReview: (page: 'about' | 'privacy') => void;
    matchReviewBoard: MatchBoard;
    renderMatchDetailsReview: (mode?: 'ready' | 'empty' | 'unavailable' | 'basketball', returnTo?: string, season?: number) => Promise<void>;
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
      { details: { league: 'epl', eventId: '401234567' }, id: 'review-epl', source: demo ? 'demo' : 'espn', sport: 'football', league: 'epl', leagueName: 'Premier League',
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
      details: { league: 'epl', eventId: String(401234567 + i) }, id: `odds-${i}`, sport: 'football', league: 'Premier League', path: 'soccer/eng.1',
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

window.renderMatchDetailsReview = async (mode = 'ready', returnTo, season) => {
  window.homeReviewUser = null;
  const reference = { league: mode === 'basketball' ? 'nba' : 'epl', eventId: '401234567' };
  const raw = summaryFixture(mode === 'basketball' ? 'basketball' : 'football');
  const original = mode === 'empty' ? raw : { ...raw, header: { ...raw.header, round: { displayName: 'Quarter-finals' } }, gameInfo: { ...raw.gameInfo, attendance: 0, officials: [{ displayName: 'Reported Referee', position: { name: 'Referee' } }] } };
  const fixture = season ? { ...original, header: { ...original.header, season: { year: season } } } : original;
  const match = mode === 'unavailable' ? null : parseMatchDetails(mode === 'empty' ? { header: fixture.header } : fixture, reference);
  window.matchReviewBoard = { match, status: match ? 'ready' : 'unavailable', fetchedAt: '2026-10-23T18:00:00Z',
    source: { url: resolveMatch(reference.league, reference.eventId).url, ok: !!match, httpStatus: match ? 200 : 403,
      ...(match ? {} : { error: 'ESPN HTTP 403', errorKind: 'http' as const, responseMetadata: { server: 'example-edge' } }) } };
  const content = await MatchDetailsPage({ params: Promise.resolve(reference), searchParams: Promise.resolve(returnTo ? { returnTo } : {}) });
  root.render(<div key={++key}><Navbar user={null} /><main className="app-main app-surface max-w-7xl mx-auto">{content}</main></div>);
};

window.renderInformationReview = (page) => {
  root.render(<div key={++key}><Navbar user={null} /><main className="app-main app-surface max-w-7xl mx-auto">{page === 'about' ? <AboutPage /> : <PrivacyPage />}</main><SiteFooter /></div>);
};
