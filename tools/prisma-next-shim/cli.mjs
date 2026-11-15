#!/usr/bin/env node
// Prisma Compute's deploy step migrates the database by running
//   prisma-next contract emit --config prisma.config.ts
//   prisma-next db init --config prisma.config.ts --db <DATABASE_URL>
// (see @prisma/compute-sdk, src/apply-migrations.ts). The `prisma-next` command
// it looks for is the pre-release name of the CLI that now ships as `prisma`,
// and the package published under the old name carries an older toolchain than
// the one this repo's contract was emitted with. So this file is the whole
// `prisma-next` command here: it hands its arguments to the `prisma` CLI this
// repo already installs, unchanged.
//
// Remove this package once the deploy step calls `prisma` directly.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));

let cli;
try {
  const manifestPath = require.resolve('prisma/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.prisma;
  if (!bin) throw new Error('the prisma package declares no `prisma` command');
  cli = path.resolve(path.dirname(manifestPath), bin);
} catch (error) {
  console.error(`prisma-next: could not find the prisma CLI from ${process.cwd()}: ${error.message}`);
  console.error('prisma-next: run `npm install` (prisma is a devDependency of this repo).');
  process.exit(127);
}

const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit' });
if (result.error) {
  console.error(`prisma-next: could not start the prisma CLI: ${result.error.message}`);
  process.exit(1);
}
if (result.signal) process.kill(process.pid, result.signal);
process.exit(result.status ?? 1);
