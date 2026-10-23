import { getPageMetadata } from '@/lib/seo';
import { SPORTS_LEAGUE_PAGES } from '@/lib/sports-league-pages';
import SportsLeaguePage from '@/components/SportsLeaguePage';

const page = SPORTS_LEAGUE_PAGES.nfl;
export const metadata = getPageMetadata({ title: page.name, description: page.description, path: page.path });
export const dynamic = 'force-dynamic';
export default function LeaguePage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <SportsLeaguePage league="nfl" {...props} />;
}
