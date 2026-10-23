import SportsBoardView from './SportsBoard';
import { getSportsBoard } from '@/lib/sports';
import { scopeLeagueFilters, sportsFiltersFromRecord, sportsFilterHref } from '@/lib/sports-filters';
import type { SportsLeaguePage as League } from '@/lib/sports-league-pages';

export default async function SportsLeaguePage({ league, searchParams }: { league: League; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = scopeLeagueFilters(sportsFiltersFromRecord(await searchParams), league);
  const board = await getSportsBoard();
  return <SportsBoardView key={sportsFilterHref(filters, league)} initial={board} initialFilters={filters} leaguePage={league} />;
}
