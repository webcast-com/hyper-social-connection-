import type { NextRequest } from 'next/server';
import { serveDashboard } from '@/lib/dashboard-document';

export const dynamic = 'force-dynamic';

/** A file name: the last segment has an extension. */
const FILE = /\.[a-z0-9]{1,8}$/i;

/**
 * Every other address under `/nfl-basketball`.
 *
 * The built files in `public/nfl-basketball` are served before this handler is
 * reached, and the two sport folders have handlers of their own. What is left is
 * the "coming soon" screens, which get their own metadata, and addresses the
 * app has no screen for, which are answered as not found rather than with an
 * unlabelled copy of the document.
 *
 * A request for a file that is not there — a script from an earlier build, most
 * often — is a plain 404. Answering it with the HTML document would hand a
 * browser a page where it asked for a script, and would make the document's own
 * address (`index.html`) fetch itself when the dashboard has not been built.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  if (path[0] === 'assets' || FILE.test(path[path.length - 1] ?? '')) {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex' } });
  }
  return serveDashboard(request.url, `/nfl-basketball/${path.map(encodeURIComponent).join('/')}`);
}
