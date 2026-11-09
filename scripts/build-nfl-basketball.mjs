import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const app = resolve('vendor/nfl-nba');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
function run(args) {
  const result = spawnSync(npm, args, { cwd: app, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// The separate app has its own locked React/Vite toolchain.
if (!existsSync(resolve(app, 'node_modules/.bin/vite'))) run(['ci', '--include=dev', '--no-audit', '--no-fund']);
run(['run', 'build', '--', '--base=/nfl-basketball/', '--outDir=../../public/nfl-basketball', '--emptyOutDir']);
