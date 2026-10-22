import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { getSiteUrl } from '../../src/lib/site-url';
import { getPageMetadata } from '../../src/lib/seo';
import { getSiteMetadata } from '../../src/components/SEO/SEOMeta';
import robots from '../../src/app/robots';
import nextConfig from '../../next.config';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getPrivacyContact } from '../../src/lib/privacy-contact';

async function withEnv(values: Record<string, string | undefined>, run: () => void | Promise<void>) {
  const original = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  try { await run(); }
  finally { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}

// Execute the real server metadata exports, substituting only DB/provider/viewer
// and unused UI/action boundaries. No production database or ESPN calls.
async function loadMetadataModule(path: string, fixture: Record<string, unknown>) {
  const result = await build({
    stdin: { contents: path.endsWith('sitemap.ts') ? `export { default } from './${path}';` : `export { generateMetadata } from './${path}';`, resolveDir: process.cwd() },
    bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external',
    plugins: [{ name: 'seo-server-fixtures', setup(builder) {
      builder.onResolve({ filter: /^@\/(lib\/(prisma|viewer|espn-match-feed)|components\/|app\/.*actions)/ }, (args) => ({ path: args.path, namespace: 'seo-boundary' }));
      builder.onLoad({ filter: /.*/, namespace: 'seo-boundary' }, () => ({ contents: `
        export const hasDatabase = fixture.hasDatabase ?? true;
        export const prisma = fixture.db;
        export const getMatchDetails = async () => fixture.board;
        export const getViewer = async () => null;
        export const getProfileShareCount = async () => 0;
        export const getMyGroupInvites = async () => [];
        export const StartCallButton = () => null;
        export default function Component() { return null; }
      `, loader: 'js' }));
    } }],
  });
  const loaded = { exports: {} as { default: () => Promise<Array<{ url: string; lastModified?: unknown }>>; generateMetadata: (input: { params: Promise<Record<string, string>> }) => Promise<import('next').Metadata> } };
  new Function('require', 'module', 'exports', 'fixture', result.outputFiles[0].text)(createRequire(import.meta.url), loaded, loaded.exports, fixture);
  return loaded.exports;
}

const publicEnv = { NEXT_PUBLIC_SITE_URL: undefined, VERCEL_URL: 'deployment-preview.vercel.app', VERCEL_ENV: 'production' };
test('default SEO origin is hyper.co.ke, never a Vercel preview or localhost', async () => {
  await withEnv(publicEnv, () => assert.equal(getSiteUrl(), 'https://hyper.co.ke'));
});
test('explicit origins are normalized and both Hyper HTTP/www variants canonicalize to HTTPS apex', async () => {
  for (const value of ['https://hyper.co.ke/', 'http://hyper.co.ke', 'https://www.hyper.co.ke/path?query=1', ' https://hyper.co.ke/ ']) {
    await withEnv({ NEXT_PUBLIC_SITE_URL: value }, () => assert.equal(getSiteUrl(), 'https://hyper.co.ke'));
  }
  await withEnv({ NEXT_PUBLIC_SITE_URL: 'http://localhost:4000/path' }, () => assert.equal(getSiteUrl(), 'http://localhost:4000'));
});
test('malformed or credential-bearing site configuration safely falls back without leaking credentials', async () => {
  for (const value of ['', 'not a url', 'javascript:alert(1)', 'https://user:private-value@example.test/', 'https://hyper-social-connection.vercel.app', 'https://deployment-preview.vercel.app', 'https://3010-example.e2b.app']) {
    await withEnv({ NEXT_PUBLIC_SITE_URL: value }, () => assert.equal(getSiteUrl(), 'https://hyper.co.ke'));
  }
});
test('site metadata supplies the production base and images without imposing a homepage canonical on every page', async () => {
  await withEnv(publicEnv, () => {
    const metadata = getSiteMetadata(getSiteUrl());
    assert.equal(new URL(String(metadata.metadataBase)).origin, 'https://hyper.co.ke');
    assert.equal(metadata.alternates, undefined);
    assert.equal(metadata.openGraph?.url, 'https://hyper.co.ke');
    assert.deepEqual(metadata.twitter?.images, ['/og-image.png']);
    assert.deepEqual(metadata.robots && typeof metadata.robots === 'object' && metadata.robots?.index, true);
  });
});
test('page canonical, Open Graph and Twitter resolve to one production URL and image', async () => {
  await withEnv(publicEnv, () => {
    const metadata = getPageMetadata({ title: 'Review match', description: 'Reported details.', path: '/sports/matches/epl/401234567' });
    assert.equal(metadata.alternates?.canonical, 'https://hyper.co.ke/sports/matches/epl/401234567');
    assert.equal(metadata.openGraph?.url, metadata.alternates?.canonical);
    assert.deepEqual(metadata.twitter?.images, ['https://hyper.co.ke/og-image.png']);
    assert.equal(metadata.title, 'Review match');
  });
});
test('preview deployments prevent indexing through metadata and a global HTTP header', async () => {
  await withEnv({ ...publicEnv, VERCEL_ENV: 'preview' }, async () => {
    const metadata = getPageMetadata({ title: 'Preview', description: 'Preview', path: '/' });
    assert.equal(typeof metadata.robots === 'object' && metadata.robots?.index, false);
    const root = getSiteMetadata(getSiteUrl());
    assert.equal(typeof root.robots === 'object' && root.robots?.index, false);
    assert.deepEqual(await nextConfig.headers!(), [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }]);
  });
  await withEnv(publicEnv, async () => assert.deepEqual(await nextConfig.headers!(), []));
});
test('robots advertises the real host and sitemap while retaining API/account crawl restrictions', async () => {
  await withEnv(publicEnv, () => {
    const value = robots();
    assert.equal(value.host, 'https://hyper.co.ke');
    assert.equal(value.sitemap, 'https://hyper.co.ke/sitemap.xml');
    assert.ok(JSON.stringify(value.rules).includes('/api/'));
    assert.ok(JSON.stringify(value.rules).includes('/settings'));
  });
});
test('offline sitemap lists only indexable static routes on the real domain, without fake modification dates', async () => {
  await withEnv(publicEnv, async () => {
    const loaded = await loadMetadataModule('src/app/sitemap.ts', { hasDatabase: false });
    const rows = await loaded.default();
    assert.deepEqual(rows.map((row) => row.url), ['https://hyper.co.ke/', 'https://hyper.co.ke/discover', 'https://hyper.co.ke/groups', 'https://hyper.co.ke/sports', 'https://hyper.co.ke/sports/predictions', 'https://hyper.co.ke/about', 'https://hyper.co.ke/privacy', 'https://hyper.co.ke/login', 'https://hyper.co.ke/signup', 'https://hyper.co.ke/search']);
    assert.ok(rows.every((row) => row.lastModified === undefined));
  });
});
test('dynamic sitemap queries require public profiles, public groups and public published posts', async () => {
  await withEnv(publicEnv, async () => {
    const queries: Record<string, unknown> = {};
    const db = Object.fromEntries(['user', 'group', 'post'].map((kind) => [kind, { findMany: async (query: unknown) => { queries[kind] = query; return [{ id: 7, createdAt: new Date('2026-01-01') }]; } }]));
    const loaded = await loadMetadataModule('src/app/sitemap.ts', { db });
    const rows = await loaded.default();
    assert.ok(rows.some((row) => row.url === 'https://hyper.co.ke/post/7'));
    assert.match(JSON.stringify(queries.user), /"profileVisibility":"public"/);
    assert.match(JSON.stringify(queries.group), /"privacy":"public"/);
    assert.match(JSON.stringify(queries.post), /"privacy":"public"/);
    assert.match(JSON.stringify(queries.post), /"group":\{"privacy":"public"\}/);
    assert.match(JSON.stringify(queries.post), /"scheduledAt":\{"lte":/);
    assert.ok(rows.some((row) => row.url.endsWith('/search')));
  });
});
test('public posts get a dedicated article canonical and private/unpublished posts do not leak content', async () => {
  await withEnv(publicEnv, async () => {
    const base = { content: 'PRIVATE-CONTENT-MARKER', privacy: 'public', user: { profileVisibility: 'public' }, group: null, scheduledAt: null };
    let row: unknown = base;
    const loaded = await loadMetadataModule('src/app/post/[id]/page.tsx', { db: { post: { findUnique: async () => row } } });
    const input = { params: Promise.resolve({ id: '7' }) };
    const metadata = await loaded.generateMetadata(input);
    assert.equal(metadata.alternates?.canonical, 'https://hyper.co.ke/post/7');
    assert.equal(metadata.description, base.content);
    assert.equal(metadata.openGraph && 'type' in metadata.openGraph && metadata.openGraph.type, 'article');
    for (const value of [null, { ...base, privacy: 'friends' }, { ...base, user: { profileVisibility: 'followers' } }, { ...base, group: { privacy: 'private' } }, { ...base, scheduledAt: new Date('2099-01-01') }]) {
      row = value;
      const hidden = await loaded.generateMetadata(input);
      assert.equal(typeof hidden.robots === 'object' && hidden.robots?.index, false);
      assert.ok(!JSON.stringify(hidden).includes(base.content));
    }
  });
});
test('private profile and group metadata are noindex and omit private descriptions', async () => {
  await withEnv(publicEnv, async () => {
    for (const kind of ['profile', 'groups']) {
      const model = kind === 'profile' ? 'user' : 'group';
      const row = { name: 'Reported Name', bio: 'PRIVATE-BIO', description: 'PRIVATE-DESCRIPTION', avatar: null, coverPhoto: 'PRIVATE-COVER', profileVisibility: 'private', privacy: 'private' };
      const loaded = await loadMetadataModule(`src/app/${kind}/[id]/page.tsx`, { db: { [model]: { findUnique: async () => row } } });
      const metadata = await loaded.generateMetadata({ params: Promise.resolve({ id: '7' }) });
      assert.equal(typeof metadata.robots === 'object' && metadata.robots?.index, false);
      assert.ok(!JSON.stringify(metadata).includes('PRIVATE-'));
    }
  });
});
test('match metadata uses the event canonical and title; upstream outages are noindex', async () => {
  await withEnv(publicEnv, async () => {
    const fixture: { board: { status: string; match: { title: string } | null } } = { board: { status: 'ready', match: { title: 'Away Club vs Home Club' } } };
    const loaded = await loadMetadataModule('src/app/sports/matches/[league]/[eventId]/page.tsx', fixture);
    const input = { params: Promise.resolve({ league: 'epl', eventId: '401234567' }) };
    const metadata = await loaded.generateMetadata(input);
    assert.equal(metadata.alternates?.canonical, 'https://hyper.co.ke/sports/matches/epl/401234567');
    assert.match(String(metadata.title), /Away Club vs Home Club/);
    fixture.board = { status: 'unavailable', match: null };
    const unavailable = await loaded.generateMetadata(input);
    assert.equal(typeof unavailable.robots === 'object' && unavailable.robots?.index, false);
  });
});

test('every public entry page allows indexing, has a self-canonical and is not blocked by robots', async () => {
  await withEnv(publicEnv, async () => {
    const pages = [
      ['/about', await import('../../src/app/about/page')],
      ['/privacy', await import('../../src/app/privacy/page')],
      ['/login', await import('../../src/app/login/layout')],
      ['/signup', await import('../../src/app/signup/layout')],
      ['/search', await import('../../src/app/search/layout')],
    ] as const;
    const rules = robots().rules;
    assert.ok(!Array.isArray(rules));
    for (const [path, page] of pages) {
      const metadata = page.metadata;
      assert.equal(typeof metadata.robots === 'object' && metadata.robots?.index, true);
      assert.equal(metadata.alternates?.canonical, `https://hyper.co.ke${path}`);
      assert.ok(!JSON.stringify(rules).includes(`"${path}"`));
    }
    for (const path of ['/settings', '/messages', '/notifications', '/api/']) assert.ok(JSON.stringify(rules).includes(path));
  });
});

test('About and Privacy render readable guest content and shared footer links without an account', async () => {
  await withEnv({ PRIVACY_CONTACT_EMAIL: undefined }, async () => {
    const about = await import('../../src/app/about/page');
    const privacy = await import('../../src/app/privacy/page');
    const footer = await import('../../src/components/SiteFooter');
    const aboutHtml = renderToStaticMarkup(createElement(about.default));
    const privacyHtml = renderToStaticMarkup(createElement(privacy.default));
    assert.match(aboutHtml, /<h1[^>]*>About Hyper<\/h1>/);
    assert.match(privacyHtml, /<h1[^>]*>Privacy notice<\/h1>/);
    assert.match(privacyHtml, /has not yet published a dedicated privacy contact/);
    assert.ok(!privacyHtml.includes('mailto:'));
    const footerHtml = renderToStaticMarkup(createElement(footer.default));
    assert.ok(footerHtml.includes('href="/about"'));
    assert.ok(footerHtml.includes('href="/privacy"'));
  });
});

test('privacy contact only publishes a valid operator-supplied address, never an invented inbox', async () => {
  for (const email of [undefined, '', 'not-an-address', 'private@example.test?subject=x', 'one@example.test\nother@example.test']) {
    await withEnv({ PRIVACY_CONTACT_EMAIL: email }, () => assert.equal(getPrivacyContact(), null));
  }
  await withEnv({ PRIVACY_CONTACT_EMAIL: 'privacy@example.test' }, async () => {
    assert.equal(getPrivacyContact(), 'privacy@example.test');
    const privacy = await import('../../src/app/privacy/page');
    assert.ok(renderToStaticMarkup(createElement(privacy.default)).includes('href="mailto:privacy@example.test"'));
  });
});
