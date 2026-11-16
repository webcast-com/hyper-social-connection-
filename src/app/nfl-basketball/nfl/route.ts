import type { NextRequest } from 'next/server';
import { serveDashboard } from '@/lib/dashboard-document';

export const dynamic = 'force-dynamic';

/** `/nfl-basketball/nfl` — the NFL hub. */
export async function GET(request: NextRequest) {
  return serveDashboard(request.url, '/nfl-basketball/nfl');
}
