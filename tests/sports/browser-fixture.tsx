import { createRoot } from 'react-dom/client';
import SportsBoardView from '../../src/components/SportsBoard';
import { SPORTS_COMPETITIONS } from '../../src/lib/sports-catalog';
import type { SportsBoard } from '../../src/lib/sports';

declare global {
  interface Window {
    renderSports: (mode: SportsBoard['mode'] | 'empty') => void;
  }
}
const root = createRoot(document.getElementById('root')!);
let key = 0;
window.renderSports = (mode) => root.render(<SportsBoardView key={++key} initial={{
  mode: mode === 'empty' ? 'live' : mode,
  fetchedAt: new Date().toISOString(), predictions: [], sources: [],
  events: mode === 'empty' ? [] : SPORTS_COMPETITIONS.map((league) => ({
    id: league.slug, source: mode === 'demo' ? 'demo' : 'espn',
    sport: league.kind, league: league.slug, leagueName: league.name,
    status: league.slug === 'epl' ? 'live' : league.slug === 'mlb' ? 'final' : 'upcoming',
    startAt: '2026-10-22T18:00:00Z',
    home: { name: `${league.name} Home`, score: 2 }, away: { name: `${league.name} Away`, score: 1 },
  })),
}} />);
