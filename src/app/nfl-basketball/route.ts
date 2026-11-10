import type { NextRequest } from 'next/server';
import { dashboardSeoFor } from '@/lib/dashboard-seo';
import { renderDashboardDocument } from '@/lib/dashboard-document';

export const dynamic = 'force-dynamic';

/** `/nfl-basketball` — the SPA sends visitors to the basketball hub. */
export async function GET(request: NextRequest) {
  return renderDashboardDocument(request.url, '/nfl-basketball', dashboardSeoFor('/nfl-basketball'));
}
