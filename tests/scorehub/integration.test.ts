import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import nextConfig from '../../next.config';

// Snapshot of the unmodified main-branch ScoreHub files integrated here.
const files: Record<string, string> = {
  'README.md': '473047536796fa8e53772b1ec2260790024ab780f64362254c587876cd5af998',
  'index.htm': '0aecb1ec1db0fd75740c59d5a5f8fe626877b66478cd4a25edc302f84078d40e',
  'script.js': '49699bfd2b7618a6473e496535a565f4b1d1cc1a2f7e3ea2ec137c9bbaea44c5',
  'style.css': 'f418aeb13debbec04bc4281b4809a05b2c716efd9f50bada3b377491d30c7785',
};

test('ScoreHub static files match the selected main-branch source', async () => {
  for (const [name, hash] of Object.entries(files)) {
    assert.equal(createHash('sha256').update(await readFile(`public/scorehub/${name}`)).digest('hex'), hash, name);
  }
});

test('ScoreHub opens at the original document location and the demo is noindex', async () => {
  const redirects = await nextConfig.redirects!();
  assert.ok(redirects.some((rule) => rule.source === '/scorehub' && rule.destination === '/scorehub/index.htm'));
  const headers = await nextConfig.headers!();
  assert.ok(headers.some((rule) => rule.source === '/scorehub/:path*' && rule.headers.some((header) => header.key === 'X-Robots-Tag' && header.value === 'noindex, nofollow')));
});
