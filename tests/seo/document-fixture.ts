import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Reads the dashboard's built document, the same source
 * `src/lib/dashboard-document.ts` rewrites at request time.
 */
export async function dashboardDocumentHtml(): Promise<string> {
  const file = path.join(process.cwd(), 'public', 'nfl-basketball', 'index.html');
  const html = await readFile(file, 'utf8');
  if (!html.includes('<div id="root">')) throw new Error('the dashboard bundle is missing its root element — rebuild it with npm run build:nfl-basketball');
  return html;
}

export function stripBuiltHead(html: string): string {
  return html
    .replace(/<title>[^<]*<\/title>/i, '')
    .replace(/<meta\s+name="description"[^>]*>/i, '')
    .replace(/<link\s+rel="canonical"[^>]*>/i, '');
}
