import SportsBoardView from './SportsBoard';
import { emptyBrowserBoard } from '@/lib/espn-browser';
import { scopeLeagueFilters, sportsFiltersFromRecord, sportsFilterHref } from '@/lib/sports-filters';
import type { SportsLeaguePage as League } from '@/lib/sports-league-pages';

export default async function SportsLeaguePage({ league, searchParams }: { league: League; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = scopeLeagueFilters(sportsFiltersFromRecord(await searchParams), league);
  const board = emptyBrowserBoard();
  return <SportsBoardView key={sportsFilterHref(filters, league)} initial={board} initialFilters={filters} leaguePage={league} />;
}
