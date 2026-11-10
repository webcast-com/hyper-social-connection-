import { getPageMetadata } from '@/lib/seo';
import { SPORTS_LEAGUE_PAGES } from '@/lib/sports-league-pages';
import SportsLeagueHandoff from '@/components/SportsLeagueHandoff';

const page = SPORTS_LEAGUE_PAGES.nba;

/** The NBA board moved to the dashboard; this URL canonicalises to it. */
export const metadata = getPageMetadata({
  title: page.name,
  description: page.description,
  path: page.path,
  index: false,
  canonicalPath: page.dashboardPath,
});

export default function NbaSportsPage() {
  return <SportsLeagueHandoff name={page.name} dashboardPath={page.dashboardPath} />;
}
