import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardHeadTags } from '../../src/lib/dashboard-document';
import { DASHBOARD_BASKETBALL, dashboardSeoFor } from '../../src/lib/dashboard-seo';
import { dashboardDocumentHtml, stripBuiltHead } from './document-fixture';

/**
 * `renderDashboardDocument` rewrites the built dashboard document in place. These
 * checks run the same string rewriting over a copy of the built document, so the
 * SPA's root element, stylesheet and script tags always survive the injection.
 */
const documentFor = async (pathname: string) => {
  const html = await dashboardDocumentHtml();
  const seo = dashboardSeoFor(pathname);
  return {
    seo,
    html: html
      .replace(/<title>[^<]*<\/title>/i, '')
      .replace(/<meta\s+name="description"[^>]*>/i, '')
      .replace(/<link\s+rel="canonical"[^>]*>/i, '')
      .replace('</head>', `    ${dashboardHeadTags(seo)}\n  </head>`),
  };
};

test('the SPA document keeps its root element, styles and scripts after SEO injection', async () => {
  const { html } = await documentFor(DASHBOARD_BASKETBALL);
  assert.match(html, /<div id="root">/);
  assert.match(html, /<script type="module"[^>]*src="[^"]*assets\/index-[^"]*\.js"/);
  assert.match(html, /<link rel="stylesheet"[^>]*assets\/index-[^"]*\.css/);
  assert.match(html, /<html lang="en">/);
  assert.equal((html.match(/<title>/g) || []).length, 1, 'exactly one title tag');
});

test('injected head tags replace the built document title, description and canonical', async () => {
  const { html, seo } = await documentFor(DASHBOARD_BASKETBALL);
  const head = html.slice(0, html.indexOf('</head>'));
  assert.match(head, new RegExp(`<title>${seo.title.replace(/&/g, '&amp;')}</title>`));
  assert.match(head, new RegExp(`<link rel="canonical" href="${seo.canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" />`));
  assert.ok(!head.includes('ScoreHub'), 'the built document title is replaced');
  assert.ok(html.includes('<script type="application/ld+json">'));
});

test('a different route produces different head tags in the same document', async () => {
  const basketball = await documentFor(DASHBOARD_BASKETBALL);
  const nfl = await documentFor('/nfl-basketball/nfl');
  assert.notEqual(basketball.html, nfl.html);
  const title = (seo: { title: string }) => `<title>${seo.title.replace(/&/g, '&amp;')}</title>`;
  assert.ok(basketball.html.includes(title(basketball.seo)));
  assert.ok(nfl.html.includes(title(nfl.seo)));
  assert.ok(!nfl.html.includes(title(basketball.seo)));
  assert.equal((nfl.html.match(/<script type="module"/g) || []).length, 1, 'the bundle script is not duplicated');
});

test('the built document can be stripped of its own head metadata', async () => {
  const stripped = stripBuiltHead(await dashboardDocumentHtml());
  assert.ok(!stripped.match(/<title>[^<]*<\/title>/i));
  assert.ok(!stripped.match(/<meta\s+name="description"/i));
  assert.ok(!stripped.match(/<link\s+rel="canonical"/i));
  assert.match(stripped, /<div id="root">/);
});
