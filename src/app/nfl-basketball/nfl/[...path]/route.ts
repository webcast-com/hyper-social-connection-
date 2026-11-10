import type { NextRequest } from 'next/server';
import { dashboardSeoFor } from '@/lib/dashboard-seo';
import { renderDashboardDocument } from '@/lib/dashboard-document';

export const dynamic = 'force-dynamic';

/** `/nfl-basketball/nfl/*` — teams, players, matches, fixtures, scorers, news. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  const pathname = `/nfl-basketball/nfl/${path.join('/')}`;
  return renderDashboardDocument(request.url, pathname, dashboardSeoFor(pathname));
}
