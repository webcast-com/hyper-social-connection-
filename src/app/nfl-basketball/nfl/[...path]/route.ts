import type { NextRequest } from 'next/server';
import { serveDashboard } from '@/lib/dashboard-document';

export const dynamic = 'force-dynamic';

/** `/nfl-basketball/nfl/*` — teams, players, matches, fixtures, scorers, news. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  return serveDashboard(request.url, `/nfl-basketball/nfl/${path.map(encodeURIComponent).join('/')}`);
}
