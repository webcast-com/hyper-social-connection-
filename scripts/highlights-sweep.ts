/**
 * Collect highlight clips from ESPN into the folder of JSON files the site
 * reads its stored clip list from.
 *
 *   npm run highlights:sweep -- --dir ../highlights-data/data/highlights
 *
 * This is the same sweeper the site ran against Postgres
 * (src/lib/highlights-sweep.ts), pointed at a folder instead
 * (src/lib/highlights-folder.ts): the same bounded passes, the same rules about
 * what is asked again and what never is. The scheduled workflow
 * (.github/workflows/highlights-sweep.yml) runs it and commits the folder to
 * the `highlights-data` branch. Only the list is written. The videos stay on
 * ESPN.
 *
 * Options
 *   --dir <path>      the folder to read and write (required)
 *   --passes <n>      passes to run at most (default 8, at most 60)
 *   --pause <ms>      wait between passes (default 4000)
 *   --days <n>        how far back to walk scoreboards (default 7, at most 30)
 *   --league <slug>   walk one competition completely instead of the catalog
 *   --warm <n>        league videos to resolve a playable file for (default 24)
 *   --dry-run         ask ESPN and report, but write nothing
 *   --report <file>   also write the report, as Markdown, to this file
 *
 * Exit status: 0 when the run did its work (including "nothing new"), 1 when
 * ESPN answered nothing at all or the folder could not be read or written. On 1
 * nothing has been written, so the workflow has nothing to commit.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createFolderStore } from '../src/lib/highlights-folder';
import { EXPLICIT_INTERVAL_MS, LEAGUE_INTERVAL_MS, REPROBE_EMPTY_AFTER_MS, runHighlightsSweep, type SweepPass } from '../src/lib/highlights-sweep';
import { hasResolvedNewsMedia, mediaProbeKey, resolveVideoNewsMedia } from '../src/lib/espn-video-news-feed';
import { MAX_MEDIA_WARM } from '../src/lib/highlights-index';

type Options = {
  dir: string; passes: number; pause: number; days: number | null; league: string | null;
  warm: number; dryRun: boolean; report: string | null;
};

function parse(argv: string[]): Options {
  const options: Options = { dir: '', passes: 8, pause: 4_000, days: null, league: null, warm: 24, dryRun: false, report: null };
  const number = (name: string, value: string | undefined, min: number, max: number) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`${name} needs a number`);
    return Math.max(min, Math.min(max, Math.trunc(parsed)));
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => argv[++index];
    if (arg === '--dir') options.dir = value() ?? '';
    else if (arg === '--passes') options.passes = number(arg, value(), 1, 60);
    else if (arg === '--pause') options.pause = number(arg, value(), 0, 60_000);
    else if (arg === '--days') options.days = number(arg, value(), 1, 30);
    else if (arg === '--league') options.league = value() || null;
    else if (arg === '--warm') options.warm = number(arg, value(), 0, 200);
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--report') options.report = value() || null;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.dir) throw new Error('--dir <folder> is required');
  options.dir = path.resolve(options.dir);
  return options;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<number> {
  const options = parse(process.argv.slice(2));
  const store = createFolderStore(options.dir);
  const before = await store.summary();

  // The sweeper's own rate limit is per process and is there for page loads.
  // Here the pause between passes is real; only the limiter's clock is moved on.
  let clock = Date.now();
  const step = (options.league ? LEAGUE_INTERVAL_MS : EXPLICIT_INTERVAL_MS) + 1_000;

  const passes: SweepPass[] = [];
  for (let pass = 0; pass < options.passes; pass += 1) {
    if (pass > 0) await wait(options.pause);
    clock += step;
    const result = await runHighlightsSweep({ store, force: true, league: options.league, days: options.days, now: () => clock });
    passes.push(result);
    console.log(`pass ${pass + 1}: ${result.ok ? 'ok' : `not run (${result.reason ?? 'unknown'})`} · ${result.cells} scoreboards · ${result.games} games · ${result.clips} match clips · ${result.leagueClips} league clips · ${result.requests} requests · ${result.durationMs} ms${result.truncated ? ' · more waiting' : ''}`);
    if (!result.ok) break;
    // Scoreboards were waiting and not one answered: ESPN is not reachable, and
    // asking seven more times would not change that.
    if (result.truncated && result.cells === 0) break;
    // Nothing left that is due: every scoreboard has been walked recently.
    if (!result.truncated) break;
  }

  // League video: resolve a playable file for clips that have none. The site
  // used to store one when a reader pressed play; it cannot write here, so the
  // job does it, newest first, a bounded number per run.
  let warmed = 0;
  let warmAsked = 0;
  while (warmAsked < options.warm) {
    const needing = await store.newsClipsNeedingMedia(MAX_MEDIA_WARM);
    if (!needing.length) break;
    const askable = await store.probeable(needing.map((row) => mediaProbeKey(row.clipId)), REPROBE_EMPTY_AFTER_MS);
    const due = needing.filter((row) => askable.has(mediaProbeKey(row.clipId)) && !hasResolvedNewsMedia(row.clipId));
    if (!due.length) break;
    for (const row of due) {
      if (warmAsked >= options.warm) break;
      warmAsked += 1;
      const media = await resolveVideoNewsMedia(row.clipId, store);
      if (media.mp4 || media.hls) warmed += 1;
      await store.idle();
    }
  }
  await store.idle();

  const after = await store.summary();
  const ran = passes.filter((pass) => pass.ok);
  const total = (key: 'cells' | 'games' | 'clips' | 'leagueClips' | 'requests' | 'mediaWarmed') => ran.reduce((sum, pass) => sum + pass[key], 0);
  const answered = total('cells');
  const failed = ran.length === 0 || (answered === 0 && ran.some((pass) => pass.truncated));

  let written: string[] = [];
  if (!options.dryRun && !failed) {
    written = await store.flush();
    // Read back what was just written, from disk, and check it adds up.
    const check = createFolderStore(options.dir);
    const index = await check.files.index();
    const months = Object.values(index.months).reduce((sum, n) => sum + n, 0);
    const cube = Object.values(index.cube).reduce((sum, n) => sum + n, 0);
    if (index.clips !== months || index.clips !== cube || index.clips !== after.clips) {
      throw new Error(`the folder does not add up after writing: index ${index.clips}, months ${months}, kinds ${cube}, expected ${after.clips}`);
    }
  }

  const report = [
    `### Highlights sweep${options.dryRun ? ' (dry run, nothing written)' : ''}`,
    '',
    failed
      ? '**ESPN answered nothing, so nothing was written.**'
      : `**${after.clips - before.clips} new ${after.clips - before.clips === 1 ? 'clip' : 'clips'}** · ${after.clips.toLocaleString('en')} stored (${after.matchClips} match, ${after.leagueClips} league video) across ${after.competitions} competitions`,
    '',
    `- Passes: ${ran.length} of ${options.passes} allowed${ran.at(-1)?.truncated ? ' (more scoreboards are waiting for the next run)' : ''}`,
    `- Scoreboards walked: ${answered} · games asked: ${total('games')} · requests to ESPN: ${total('requests') + warmAsked}`,
    `- Match clips read: ${total('clips')} · league clips read: ${total('leagueClips')} · league videos made playable: ${total('mediaWarmed') + warmed}`,
    `- Oldest clip: ${after.oldestAt ?? 'none'} · newest: ${after.newestAt ?? 'none'}`,
    `- Files written: ${options.dryRun ? 'none (dry run)' : written.length}`,
    ...(passes.some((pass) => !pass.ok) ? [`- A pass did not run: ${passes.find((pass) => !pass.ok)?.reason ?? 'unknown'}`] : []),
    '',
  ].join('\n');
  console.log(`\n${report}`);
  if (options.report) await writeFile(options.report, report, 'utf8');
  return failed ? 1 : 0;
}

main().then(
  (status) => { process.exitCode = status; },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
