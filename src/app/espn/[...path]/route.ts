import { dashboardEspnProxy } from '@/lib/nfl-basketball-proxy';

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return dashboardEspnProxy(request, 'site', (await params).path);
}
