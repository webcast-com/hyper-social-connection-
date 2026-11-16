/**
 * Serves the dashboard's built single-page document with per-route SEO.
 *
 * The dashboard is one client-rendered `index.html` for every route, so a
 * crawler would otherwise see the same title, description and canonical on
 * every URL, and an empty `<div id="root">` for a body. These helpers write the
 * route's metadata (resolved by `src/lib/dashboard-seo.ts`) into the head, and
 * its headline, description, breadcrumb and onward links into the root element,
 * where the app replaces them as soon as it starts. The SPA's own scripts and
 * styles are left untouched.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { dashboardRobots, dashboardSeoFor, type DashboardSeo } from './dashboard-seo';

const DOCUMENT_PATH = path.join(process.cwd(), 'public', 'nfl-basketball', 'index.html');

const escapeAttribute = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const escapeText = (value: string) => escapeAttribute(value);

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
      // Anything else that answers on this address is not the built document.
      if (html.includes('<div id="root">')) {
        cached = { at: Date.now(), html };
        return html;
      }
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

/**
 * The route's head tags.
 *
 * Tags the app rewrites on client-side navigation carry `data-route-meta`, and
 * structured data carries the path it describes, so the app can tell which of
 * them still belong to the page on screen.
 */
function headTags(seo: DashboardSeo): string {
  const robots = dashboardRobots(seo);
  const tags = [
    `<title>${escapeText(seo.title)}</title>`,
    `<meta name="description" content="${escapeAttribute(seo.description)}" />`,
    seo.keywords ? `<meta name="keywords" content="${escapeAttribute(seo.keywords)}" />` : null,
    seo.canonical ? `<link rel="canonical" href="${escapeAttribute(seo.canonical)}" />` : null,
    // An indexable page needs no robots tag; one that is not says so in the
    // document as well as in the response header.
    robots === 'index, follow' ? null : `<meta name="robots" content="${robots}" data-route-meta />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Hyper" />`,
    `<meta property="og:title" content="${escapeAttribute(seo.title)}" />`,
    `<meta property="og:description" content="${escapeAttribute(seo.description)}" />`,
    seo.canonical ? `<meta property="og:url" content="${escapeAttribute(seo.canonical)}" />` : null,
    `<meta property="og:image" content="${escapeAttribute(seo.image.url)}" />`,
    `<meta property="og:image:width" content="${seo.image.width}" />`,
    `<meta property="og:image:height" content="${seo.image.height}" />`,
    `<meta property="og:image:alt" content="${escapeAttribute(seo.image.alt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttribute(seo.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttribute(seo.description)}" />`,
    `<meta name="twitter:image" content="${escapeAttribute(seo.image.url)}" />`,
    ...seo.jsonLd.map((entry) => `<script type="application/ld+json" data-route="${escapeAttribute(seo.path)}">${JSON.stringify(entry).replace(/</g, '\\u003c')}</script>`),
  ];
  return tags.filter((tag): tag is string => tag !== null).join('\n    ');
}

/**
 * What the root element holds until the app starts: the page's breadcrumb,
 * headline, description and the links that lead on from it.
 *
 * The app draws all of these itself a moment later, so a visitor sees the same
 * page either way; a crawler that does not run scripts gets a document with a
 * headline and links in it instead of an empty element. Only words about the
 * page go here — never a score, a record or a fixture, which the server does not
 * know.
 */
function bodyContent(seo: DashboardSeo): string {
  const crumbs = seo.crumbs.map((crumb) => (
    crumb.href === seo.path
      ? `<li aria-current="page">${escapeText(crumb.name)}</li>`
      : `<li><a href="${escapeAttribute(crumb.href)}">${escapeText(crumb.name)}</a></li>`
  )).join('');
  const links = seo.links.map((link) => `<li><a href="${escapeAttribute(link.href)}">${escapeText(link.name)}</a></li>`).join('');
  return [
    '<div class="sh-prerender">',
    `<nav aria-label="Breadcrumb"><ol>${crumbs}</ol></nav>`,
    `<h1>${escapeText(seo.heading)}</h1>`,
    `<p>${escapeText(seo.description)}</p>`,
    links ? `<nav aria-label="Related pages"><ul>${links}</ul></nav>` : '',
    '</div>',
  ].join('');
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
    <div id="root">${bodyContent(seo)}</div>
  </body>
</html>`;
}

/**
 * One route's document: the built document with its own head metadata replaced
 * by the route's, and the route's content placed in the root element.
 *
 * Replacements are passed as functions so that a `$` in a name or a JSON value
 * is written as itself rather than read as a replacement pattern.
 */
export function dashboardDocumentHtml(document: string | null, seo: DashboardSeo): string {
  if (!document) return fallbackDocument(seo);
  const stripped = document
    .replace(/[ \t]*<meta\s+name="description"[^>]*>\n?/i, '')
    .replace(/[ \t]*<meta\s+name="keywords"[^>]*>\n?/i, '')
    .replace(/[ \t]*<meta\s+name="robots"[^>]*>\n?/i, '')
    .replace(/[ \t]*<link\s+rel="canonical"[^>]*>\n?/i, '');
  // The route's tags take the built title's place, ahead of the stylesheet and
  // the script, so the title is among the first things a parser reads.
  const TITLE = /<title>[^<]*<\/title>/i;
  const withHead = TITLE.test(stripped)
    ? stripped.replace(TITLE, () => headTags(seo))
    : stripped.replace('</head>', () => `    ${headTags(seo)}\n  </head>`);
  return withHead.replace(/<div id="root">\s*<\/div>/, () => `<div id="root">${bodyContent(seo)}</div>`);
}

/** Response headers for one route's document. */
export function dashboardDocumentHeaders(seo: DashboardSeo): Record<string, string> {
  const robots = dashboardRobots(seo);
  return {
    'content-type': 'text/html; charset=utf-8',
    // Scores change constantly, but the document shell itself is stable.
    'cache-control': 'public, max-age=60, stale-while-revalidate=300',
    // Sharing and search previews may use the page's image at full size.
    'x-robots-tag': robots === 'index, follow' ? 'index, follow, max-image-preview:large' : robots,
  };
}

/** The dashboard document for one route, with that route's SEO injected. */
export async function renderDashboardDocument(requestUrl: string, seo: DashboardSeo): Promise<Response> {
  const document = await readDocument(requestUrl);
  // A URL the app has no screen for is answered with the app all the same — it
  // shows its own "not found" — and with the status that says so.
  return new Response(dashboardDocumentHtml(document, seo), { status: seo.status, headers: dashboardDocumentHeaders(seo) });
}

/** Serve the dashboard document for the path a request asked for. */
export async function serveDashboard(requestUrl: string, pathname: string): Promise<Response> {
  return renderDashboardDocument(requestUrl, dashboardSeoFor(pathname, new URL(requestUrl).search));
}

/** Test/debug helper: the injected head tags for one route. */
export function dashboardHeadTags(seo: DashboardSeo): string {
  return headTags(seo);
}

/** Test/debug helper: the content placed in the root element for one route. */
export function dashboardBodyContent(seo: DashboardSeo): string {
  return bodyContent(seo);
}
