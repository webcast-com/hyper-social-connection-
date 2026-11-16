import type { NextRequest } from 'next/server';
import { serveDashboard } from '@/lib/dashboard-document';

export const dynamic = 'force-dynamic';

/** `/nfl-basketball/basketball` — the basketball hub. */
export async function GET(request: NextRequest) {
  return serveDashboard(request.url, '/nfl-basketball/basketball');
}
