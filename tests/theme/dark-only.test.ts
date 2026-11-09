import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import manifest from '../../src/app/manifest';

test('the server renders a dark document without reading stored or system theme preferences', async () => {
  const result = await build({
    stdin: { contents: "export { default, viewport } from './src/app/layout';", resolveDir: process.cwd() },
    bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external',
    plugins: [{ name: 'layout-boundaries', setup(builder) {
      builder.onResolve({ filter: /^(\.\/globals\.css|@\/components\/(Navbar|SiteFooter)|@\/lib\/(prisma|viewer)|@vercel\/analytics\/next)$/ },
        (args) => ({ path: args.path, namespace: 'layout-fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'layout-fixture' }, () => ({
        contents: `export const hasDatabase = false; export const prisma = {};
          export const getViewer = async () => null; export const Analytics = () => null;
          export default function Component() { return null; }`, loader: 'js',
      }));
    } }],
  });
  const loaded = { exports: {} as { default: (props: { children: React.ReactNode }) => Promise<React.ReactElement>; viewport: { colorScheme: string; themeColor: string } } };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), loaded, loaded.exports);
  const html = renderToStaticMarkup(await loaded.exports.default({ children: createElement('p', null, 'Content') }));
  assert.match(html, /<html[^>]*class="dark"/);
  assert.doesNotMatch(html, /localStorage|prefers-color-scheme/);
  assert.equal(loaded.exports.viewport.colorScheme, 'dark');
  assert.equal(loaded.exports.viewport.themeColor, '#08111f');
});

test('installed app uses a dark launch background', () => {
  assert.equal(manifest().background_color, '#08111f');
  assert.equal(manifest().theme_color, '#08111f');
});
