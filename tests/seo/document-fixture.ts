import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Reads the dashboard's built document, the same source
 * `src/lib/dashboard-document.ts` rewrites at request time.
 */
export async function builtDashboardDocument(): Promise<string> {
  const file = path.join(process.cwd(), 'public', 'nfl-basketball', 'index.html');
  const html = await readFile(file, 'utf8');
  if (!html.includes('<div id="root">')) throw new Error('the dashboard bundle is missing its root element — rebuild it with npm run build:nfl-basketball');
  return html;
}

/** The content of one head tag, or null when the document has no such tag. */
export function headValue(html: string, tag: RegExp): string | null {
  const head = html.slice(0, html.indexOf('</head>'));
  return head.match(tag)?.[1] ?? null;
}

export const count = (html: string, pattern: RegExp) => (html.match(pattern) ?? []).length;
