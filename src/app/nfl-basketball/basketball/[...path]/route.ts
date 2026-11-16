import type { NextRequest } from 'next/server';
import { serveDashboard } from '@/lib/dashboard-document';

export const dynamic = 'force-dynamic';

/**
 * `/nfl-basketball/basketball/*` — teams, players, matches, upcoming fixtures,
 * top scorers and news. Assets live under `/nfl-basketball/assets`, so this
 * handler never intercepts them.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  return serveDashboard(request.url, `/nfl-basketball/basketball/${path.map(encodeURIComponent).join('/')}`);
}
