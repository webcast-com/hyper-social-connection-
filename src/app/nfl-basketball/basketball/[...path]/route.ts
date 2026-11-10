import type { NextRequest } from 'next/server';
import { dashboardSeoFor } from '@/lib/dashboard-seo';
import { renderDashboardDocument } from '@/lib/dashboard-document';

export const dynamic = 'force-dynamic';

/**
 * `/nfl-basketball/basketball/*` — teams, players, matches, upcoming fixtures,
 * top scorers and news. Assets live under `/nfl-basketball/assets`, so this
 * handler never intercepts them.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  const pathname = `/nfl-basketball/basketball/${path.join('/')}`;
  return renderDashboardDocument(request.url, pathname, dashboardSeoFor(pathname));
}
