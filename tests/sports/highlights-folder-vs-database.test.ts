import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createFolderStore, type FolderStore } from '../../src/lib/highlights-folder';
import {
  findStoredHighlightClip, findStoredNewsMedia, highlightsStore, newsClipsNeedingMedia, readEventClips,
  readFeedClips, readRecentClipRefs, readRecentEventRefs, readStoredClip, sweepCellKey,
  type HighlightsIndexQuery, type StoredClip,
} from '../../src/lib/highlights-index';
import { hasDatabase, rawExecute, rawQuery } from '../../src/lib/prisma';
import { highlightAnchorId } from '../../src/lib/sports-anchor';
import { LEAGUES, library, matchClip, random } from './highlights-library';

/**
 * The folder against the table itself.
 *
 * The same clips are stored in Postgres, through the site's own SQL, and in a
 * folder; then every read the site makes is asked of both and the answers are
 * compared. This is the direct form of "the folder works the way the table
 * did": not a model of the SQL, the SQL.
 *
 * It needs a throwaway database, so it only runs when asked:
 *
 *   bash scripts/dev-db.sh start
 *   HIGHLIGHTS_COMPARE=1 DATABASE_URL=postgres://postgres@127.0.0.1:55432/<db> DATABASE_SSL=false \
 *     npx tsx --test tests/sports/highlights-folder-vs-database.test.ts
 *
 * It refuses to run against a table that already holds clips.
 */

const enabled = process.env.HIGHLIGHTS_COMPARE === '1' && hasDatabase;
const skip = enabled ? false : 'set HIGHLIGHTS_COMPARE=1 and point DATABASE_URL at a throwaway database';

let dir = '';
let folder: FolderStore;
let clips: StoredClip[] = [];

before(async () => {
  if (!enabled) return;
  // Creates the tables when they are missing; an empty read is enough for that.
  await highlightsStore.summary();
  const held = await rawQuery<{ n: number }>('SELECT count(*)::int AS "n" FROM "sports_highlight_clips"');
  assert.equal(held[0]?.n, 0, 'this test writes clips: it only runs against an empty table');

  dir = await mkdtemp(path.join(tmpdir(), 'highlights-compare-'));
  folder = createFolderStore(dir);
  clips = library(21);
  const batches: StoredClip[][] = [
    clips.slice(0, 250),
    clips.slice(200, 480),
    clips.slice(440).concat(clips.slice(0, 60).map((stored): StoredClip => (stored.kind === 'match'
      ? { ...stored, clip: { ...stored.clip, status: 'final', title: `${stored.clip.title} (updated)`, mp4: null, duration: null } }
      : stored))),
  ];
  for (const batch of batches) {
    const [inTable, inFolder] = [await highlightsStore.store(batch), await folder.store(batch)];
    assert.equal(inFolder, inTable, 'both report the same number of rows written');
  }
  // Renditions for some league clips, by the write a play or a pre-warm makes.
  for (const stored of clips.filter((entry) => entry.kind === 'league').slice(0, 30)) {
    if (stored.kind !== 'league') continue;
    const media = { mp4: `https://espnmedia-cdn.akamaized.net/espn/${stored.clip.clipId}.mp4`, hls: null, page: null, thumbnail: 'https://a.espncdn.com/r.jpg', duration: 33 };
    assert.equal(await folder.storeNewsMedia(stored.clip.clipId, media), await highlightsStore.storeNewsMedia(stored.clip.clipId, media));
  }
  // The listing read again afterwards, as every pass does.
  const listing = clips.filter((entry) => entry.kind === 'league');
  assert.equal(await folder.store(listing), await highlightsStore.store(listing));
  await folder.flush();
  // Read back from disk by a new store, as the next run and the site do.
  folder = createFolderStore(dir);
});

after(async () => {
  if (!enabled) return;
  await rawExecute('TRUNCATE "sports_highlight_clips", "sports_highlight_probes", "sports_highlight_sweeps"');
  if (dir) await rm(dir, { recursive: true, force: true });
});

test('the index page: 600 queries, the same answer from the folder and the table', { skip }, async () => {
  const next = random(5);
  const pick = <T>(values: T[]) => values[Math.floor(next() * values.length)];
  const queries: HighlightsIndexQuery[] = [{}, { limit: 60 }, { offset: 640 }, { offset: 9_999 }, { kind: 'league', limit: 60 }];
  for (let index = 0; index < 600; index += 1) {
    queries.push({
      kind: pick([null, null, 'match', 'league'] as const),
      league: pick([null, null, ...LEAGUES, 'not-a-league']),
      status: pick([null, null, null, 'final', 'live', 'upcoming'] as const),
      days: pick([null, 0, -3, 1, 2, 7, 30, 90, 400]),
      limit: pick([1, 5, 24, 60, 200, 0]),
      offset: pick([0, 0, 0, 3, 24, 60, 119, 300, -1]),
    });
  }
  for (const query of queries) {
    const [table, files] = [await highlightsStore.read(query), await folder.read(query)];
    const label = JSON.stringify(query);
    assert.equal(table.ok, true, label);
    assert.deepEqual(files.match, table.match, `match clips: ${label}`);
    assert.deepEqual(files.league, table.league, `league clips: ${label}`);
    assert.equal(files.remaining, table.remaining, `remaining: ${label}`);
    assert.equal(files.sourceUrl, table.sourceUrl, `source: ${label}`);
    assert.deepEqual(files.byLeague, table.byLeague, label);
    assert.deepEqual([...files.byStatus].sort((a, b) => a.status.localeCompare(b.status)), [...table.byStatus].sort((a, b) => a.status.localeCompare(b.status)), label);
    const { lastSweepAt: a, sweptCells: b, ...filesSummary } = files.summary;
    const { lastSweepAt: c, sweptCells: d, ...tableSummary } = table.summary;
    assert.deepEqual(filesSummary, tableSummary, label);
    void a; void b; void c; void d;
  }
});

test('the feed, one clip, one fixture, the sitemap lists, renditions', { skip }, async () => {
  for (const [days, limit] of [[7, 12], [30, 300], [0, 300], [365, 50], [2, 1], [1, 5]] as const) {
    const [table, files] = [await readFeedClips(days, limit), await folder.files.feed(days ? new Date(Date.now() - Math.min(365, days) * 86_400_000) : null, limit)];
    assert.deepEqual(files.clips, table.clips, `feed ${days}/${limit}`);
    assert.equal(files.remaining, table.remaining, `feed remaining ${days}/${limit}`);
    assert.equal(files.sourceUrl, table.sourceUrl);
  }

  let fixtures = 0;
  for (const stored of clips) {
    if (stored.kind !== 'match') continue;
    const id = stored.clip.id;
    assert.deepEqual(await folder.files.matchClip(id), (await readStoredClip(id)).clip, `clip ${id}`);
    assert.deepEqual(await folder.files.matchClipByAnchor(highlightAnchorId({ id })), await findStoredHighlightClip(highlightAnchorId({ id })), `anchor ${id}`);
    const fixture = stored.clip.eventId.split('-').slice(0, 3).join('-');
    for (const eventId of [stored.clip.eventId, fixture]) {
      for (const limit of [24, 2]) {
        assert.deepEqual(await folder.files.eventClips(eventId, limit), (await readEventClips(eventId, limit)).clips, `fixture ${eventId}`);
        fixtures += 1;
      }
    }
  }
  assert.ok(fixtures > 1_000);
  for (const id of ['48999999', 'nope', 'espn-epl-7', 'espn-epl-7000', 'espn-nope-700090', '']) {
    assert.deepEqual(await folder.files.matchClip(id), (await readStoredClip(id)).clip);
    if (id) assert.deepEqual(await folder.files.eventClips(id, 24), (await readEventClips(id)).clips, `fixture ${id}`);
  }
  // The one place the two differ, on purpose. Asked for a bare competition
  // (`espn-epl`), the SQL's prefix match returns that competition's newest
  // clips. No page asks that — both callers pass a whole fixture id — and the
  // folder answers it with nothing rather than keep a key holding every
  // fixture of a competition.
  assert.ok((await readEventClips('espn-epl')).clips.length > 0);
  assert.deepEqual(await folder.files.eventClips('espn-epl', 24), []);

  for (const limit of [2_000, 100, 7]) {
    assert.deepEqual(await folder.files.clipRefs(limit), (await readRecentClipRefs(limit)).refs, `clip refs ${limit}`);
    assert.deepEqual(await folder.files.eventRefs(limit), (await readRecentEventRefs(limit)).refs, `event refs ${limit}`);
  }

  for (const stored of clips) {
    if (stored.kind !== 'league') continue;
    assert.deepEqual(await folder.findNewsMedia(stored.clip.clipId), await findStoredNewsMedia(stored.clip.clipId), stored.clip.clipId);
  }
  for (const limit of [12, 6, 1]) {
    assert.deepEqual(await folder.newsClipsNeedingMedia(limit), await newsClipsNeedingMedia(limit), `needing ${limit}`);
  }
});

test('probes and scoreboard cells answer alike', { skip }, async () => {
  const hour = 3_600_000;
  const probes = ['probe:epl:1', 'probe:epl:2', 'probe:nba:3', 'probe:nba:4', 'sweep:epl:20261119', 'junk'];
  const same = async (label: string) => {
    for (const window of [24 * hour, 1, 0]) {
      assert.deepEqual([...await folder.probeable(probes, window)].sort(), [...await highlightsStore.probeable(probes, window)].sort(), `${label}, window ${window}`);
    }
  };
  await same('before anything is recorded');
  for (const entries of [
    [{ key: 'probe:epl:1', clips: 4 }, { key: 'probe:epl:2', clips: 0 }],
    [{ key: 'probe:epl:1', clips: 0 }, { key: 'probe:nba:3', clips: 0 }, { key: 'junk', clips: 9 }],
  ]) {
    await highlightsStore.recordProbes(entries);
    await folder.recordProbes(entries);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await same('after a record');
  }

  const cells = [sweepCellKey('epl', '20261119'), sweepCellKey('nba', '20261119'), sweepCellKey('ucl', '20261118'), 'probe:epl:1'];
  const alike = async (label: string) => {
    for (const ttl of [6 * hour, 1, 0]) {
      assert.deepEqual([...await folder.freshCells(cells, ttl)].sort(), [...await highlightsStore.freshCells(cells, ttl)].sort(), `${label}, ttl ${ttl}`);
    }
  };
  await alike('before anything is recorded');
  const walked = [{ key: cells[0], games: 3, clips: 7 }, { key: cells[1], games: 0, clips: 0 }, { key: 'junk', games: 1, clips: 1 }];
  await highlightsStore.recordCells(walked);
  await folder.recordCells(walked);
  await new Promise((resolve) => setTimeout(resolve, 20));
  await alike('after a pass');
  await highlightsStore.recordCells(walked.slice(0, 1));
  await folder.recordCells(walked.slice(0, 1));
  const [table, files] = [await highlightsStore.summary(), await folder.summary()];
  assert.equal(files.sweptCells, table.sweptCells, 'scoreboards walked');
  assert.equal(files.sweptCells, 2);
  assert.ok(Math.abs(Date.parse(files.lastSweepAt!) - Date.parse(table.lastSweepAt!)) < 5_000, 'last sweep');
  assert.equal(matchClip(1).id, '48000001');
});
