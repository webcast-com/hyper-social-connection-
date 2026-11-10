/**
 * Serves the dashboard's built single-page document with per-route SEO.
 *
 * The dashboard is one client-rendered `index.html` for every route, so a
 * crawler would otherwise see the same title, description and canonical on
 * every URL. These helpers inject the metadata resolved by
 * `src/lib/dashboard-seo.ts` into that document and keep the SPA's own
 * scripts, styles and root element untouched.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DashboardSeo } from './dashboard-seo';

const DOCUMENT_PATH = path.join(process.cwd(), 'public', 'nfl-basketball', 'index.html');

const escapeAttribute = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const escapeText = (value: string) => escapeAttribute(value).replace(/"/g, '&quot;');

let cached: { at: number; html: string } | null = null;
const CACHE_MS = 30_000;

/** The built document, fetched through the app's own static file serving so it
 * works on serverless deployments where `public/` is not on disk. */
async function readDocument(requestUrl: string): Promise<string | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.html;
  try {
    const response = await fetch(new URL('/nfl-basketball/index.html', requestUrl), { cache: 'no-store' });
    if (response.ok) {
      const html = await response.text();
      cached = { at: Date.now(), html };
      return html;
    }
  } catch {
    // fall through to the filesystem copy
  }
  try {
    const html = await readFile(DOCUMENT_PATH, 'utf8');
    cached = { at: Date.now(), html };
    return html;
  } catch {
    return null;
  }
}

function headTags(seo: DashboardSeo): string {
  const tags = [
    `<title>${escapeText(seo.title)}</title>`,
    `<meta name="description" content="${escapeAttribute(seo.description)}" />`,
    `<meta name="keywords" content="${escapeAttribute(seo.keywords)}" />`,
    `<link rel="canonical" href="${escapeAttribute(seo.canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeAttribute(seo.title)}" />`,
    `<meta property="og:description" content="${escapeAttribute(seo.description)}" />`,
    `<meta property="og:url" content="${escapeAttribute(seo.canonical)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttribute(seo.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttribute(seo.description)}" />`,
    ...seo.jsonLd.map((entry) => `<script type="application/ld+json">${JSON.stringify(entry).replace(/</g, '\\u003c')}</script>`),
  ];
  return tags.join('\n    ');
}

/** Minimal document used when the dashboard has not been built yet. */
function fallbackDocument(seo: DashboardSeo): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${headTags(seo)}
  </head>
  <body>
    <main><h1>${escapeText(seo.title)}</h1><p>${escapeText(seo.description)}</p></main>
  </body>
</html>`;
}

/** The dashboard document for one route, with that route's SEO injected. */
export async function renderDashboardDocument(requestUrl: string, pathname: string, seo: DashboardSeo): Promise<Response> {
  const document = await readDocument(requestUrl);
  const html = document
    ? document
      .replace(/<title>[^<]*<\/title>/i, '')
      .replace(/<meta\s+name="description"[^>]*>/i, '')
      .replace(/<link\s+rel="canonical"[^>]*>/i, '')
      .replace('</head>', `    ${headTags(seo)}\n  </head>`)
    : fallbackDocument(seo);
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Scores change constantly, but the document shell itself is stable.
      'cache-control': 'public, max-age=60, stale-while-revalidate=300',
      'x-robots-tag': seo.index ? 'index, follow' : 'noindex, follow',
    },
  });
}

/** Test/debug helper: the injected head tags for one route. */
export function dashboardHeadTags(seo: DashboardSeo): string {
  return headTags(seo);
}
