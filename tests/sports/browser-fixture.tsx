import { createRoot } from 'react-dom/client';
import SportsBoardView from '../../src/components/SportsBoard';
import { SPORTS_COMPETITIONS } from '../../src/lib/sports-catalog';
import type { SportsBoard } from '../../src/lib/sports';

declare global {
  interface Window {
    renderSports: (mode: SportsBoard['mode'] | 'empty', stress?: boolean) => void;
  }
}
const root = createRoot(document.getElementById('root')!);
let key = 0;
window.renderSports = (mode, stress = false) => root.render(<SportsBoardView key={++key} initial={{
  mode: mode === 'empty' ? 'live' : mode,
  fetchedAt: new Date().toISOString(), predictions: [], sources: [],
  events: mode === 'empty' ? [] : SPORTS_COMPETITIONS.map((league) => ({
    race: league.slug === 'f1' && !stress ? { title: 'Review Grand Prix', entries: [{ name: 'Leading Driver', position: 1 }, { name: 'Second Driver', position: 2 }] } : undefined,
    details: { league: league.slug, eventId: '401234567' },
    id: league.slug, source: mode === 'demo' ? 'demo' : 'espn',
    sport: league.kind, league: league.slug, leagueName: league.name,
    status: stress ? 'final' : league.slug === 'epl' ? 'live' : league.slug === 'mlb' ? 'final' : 'upcoming',
    startAt: '2026-10-22T18:00:00Z',
    detail: stress ? 'Home won by four wickets after an extended international competition final' : null,
    home: { name: stress ? 'Very Long International Home Club Name' : `${league.name} Home`, score: stress ? 184 : 2 },
    away: { name: stress ? 'Very Long International Away Club Name' : `${league.name} Away`, score: stress ? 183 : 1 },
  })),
}} />);
