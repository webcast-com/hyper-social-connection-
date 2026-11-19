import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createFolderStore } from '../../src/lib/highlights-folder';
import { dayPath, eventKeysOf, lookupPath, type FileRow } from '../../src/lib/highlights-files';
import { resetHighlightsFiles } from '../../src/lib/highlights-github';
import {
  findStoredHighlightClip, findStoredNewsMedia, highlightsStore, readEventClips, readFeedClips,
  readRecentClipRefs, readRecentEventRefs, readStoredClip, sweepCellKey, uniqueRows,
  type ClipRow, type HighlightsIndexQuery, type StoredClip,
} from '../../src/lib/highlights-index';
import { CELLS_PER_PASS, GAMES_PER_PASS, resetHighlightsSweep, runHighlightsSweep } from '../../src/lib/highlights-sweep';
import { highlightAnchorId } from '../../src/lib/sports-anchor';
import { DAY, LEAGUES, NOW, leagueClip, library, matchClip, random } from './highlights-library';

/**
 * The stored clip list kept as a folder of JSON files.
 *
 * The claim under test is that the folder answers every question the Postgres
 * table answered, the same way. So the first half stores clips through the
 * folder's writer and checks each read against a plain in-memory model of the
 * table: the rows, in insertion order, sorted and filtered the way the SQL
 * does it. The second half serves the folder over HTTP and reads it through
 * the site's own functions, which is the path a deployed page takes.
 *
 * Nothing here needs a database or ESPN.
 */

/** The table, as plain rows: what was inserted, in the order it was inserted. */
type ModelRow = ClipRow & { seq: number; at: number | null };

function model(batches: StoredClip[][]): ModelRow[] {
  const rows = new Map<string, ModelRow>();
  let seq = 0;
  for (const batch of batches) {
    for (const row of uniqueRows(batch)) {
      const held = rows.get(row.external_key);
      if (held) {
        // ON CONFLICT: the row keeps its place, its date and its fixture.
        Object.assign(held, {
          title: row.title, description: row.description,
          duration: row.duration ?? held.duration, thumbnail: row.thumbnail ?? held.thumbnail,
          mp4: row.mp4 ?? held.mp4, hls: row.hls ?? held.hls, page: row.page ?? held.page,
          event_name: row.event_name, league_name: row.league_name, home: row.home, away: row.away,
          home_logo: row.home_logo, away_logo: row.away_logo, teams: row.teams,
          source_url: row.source_url, status: row.status,
        });
        held.playable = !!held.mp4;
        continue;
      }
      seq += 1;
      const at = row.occurred_at ? new Date(row.occurred_at).getTime() : null;
      rows.set(row.external_key, { ...row, seq, at });
    }
  }
  // occurred_at DESC NULLS LAST, id DESC
  return [...rows.values()].sort((a, b) => {
    if (a.at !== b.at) {
      if (a.at === null) return 1;
      if (b.at === null) return -1;
      return b.at - a.at;
    }
    return b.seq - a.seq;
  });
}

function expected(rows: ModelRow[], query: HighlightsIndexQuery, now: number) {
  const days = query.days && query.days > 0 ? Math.min(365, Math.trunc(query.days)) : 0;
  const since = days ? now - days * DAY : null;
  const limit = Number.isFinite(query.limit) ? Math.min(60, Math.max(1, Math.trunc(query.limit as number))) : 24;
  const offset = Math.max(0, Math.trunc(query.offset ?? 0));
  const all = rows.filter((row) => (!query.kind || row.kind === query.kind)
    && (!query.league || row.league === query.league)
    && (!query.status || row.status === query.status)
    && (since === null || (row.at !== null && row.at >= since)));
  const page = all.slice(offset, offset + limit);
  return {
    match: page.filter((row) => row.kind === 'match').map((row) => row.clip_id),
    league: page.filter((row) => row.kind === 'league').map((row) => row.clip_id),
    remaining: Math.max(0, all.length - offset - page.length),
    total: all.length,
  };
}

let dir = '';
let rows: ModelRow[] = [];
const batches: StoredClip[][] = [];

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'highlights-folder-'));
  const clips = library();
  // Stored the way a sweeper stores: in pieces, with clips seen again later —
  // some of them changed — and across more than one run of the job.
  batches.push(clips.slice(0, 200), clips.slice(150, 420));
  const first = createFolderStore(dir, { now: () => NOW });
  for (const batch of batches) await first.store(batch);
  await first.flush();

  const again = clips.slice(380).concat(
    // A live clip that has since finished, and a clip whose file ESPN no longer lists.
    clips.slice(0, 40).map((stored): StoredClip => (stored.kind === 'match'
      ? { ...stored, clip: { ...stored.clip, status: 'final', title: `${stored.clip.title} (updated)`, mp4: null } }
      : stored)),
  );
  batches.push(again);
  const second = createFolderStore(dir, { now: () => NOW + 3_600_000 });
  await second.store(again);
  await second.flush();
  rows = model(batches);
});

after(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

test('every page of the index is the page the table would return', async () => {
  const store = createFolderStore(dir, { now: () => Date.now() });
  const next = random(11);
  const pick = <T>(values: T[]) => values[Math.floor(next() * values.length)];
  const queries: HighlightsIndexQuery[] = [{}, { limit: 60 }, { offset: 600, limit: 60 }, { offset: 5_000 }];
  for (let index = 0; index < 400; index += 1) {
    queries.push({
      kind: pick([null, null, 'match', 'league'] as const),
      league: pick([null, null, ...LEAGUES]),
      status: pick([null, null, null, 'final', 'live', 'upcoming'] as const),
      days: pick([null, 0, 1, 2, 7, 30, 90, 400]),
      limit: pick([1, 5, 24, 60, 200]),
      offset: pick([0, 0, 0, 3, 24, 60, 119, 300]),
    });
  }

  for (const query of queries) {
    const now = Date.now();
    const read = await store.read(query);
    const want = expected(rows, query, now);
    const label = JSON.stringify(query);
    assert.equal(read.ok, true, label);
    assert.deepEqual(read.match.map((clip) => clip.id), want.match, `match clips, in order: ${label}`);
    assert.deepEqual(read.league.map((clip) => clip.clipId), want.league, `league clips, in order: ${label}`);
    assert.equal(read.remaining, want.remaining, `remaining: ${label}`);
  }
});

test('the totals beside a page are the whole list, whatever the filter', async () => {
  const store = createFolderStore(dir);
  const read = await store.read({ league: 'nba', status: 'live', limit: 1 });
  const perLeague = new Map<string, number>();
  for (const row of rows) perLeague.set(row.league, (perLeague.get(row.league) ?? 0) + 1);
  const wantLeagues = [...perLeague].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  assert.deepEqual(read.byLeague.map((entry) => [entry.league, entry.total]), wantLeagues);
  for (const status of ['final', 'live', 'upcoming'] as const) {
    assert.equal(
      read.byStatus.find((entry) => entry.status === status)?.total,
      rows.filter((row) => row.kind === 'match' && row.status === status).length,
      status,
    );
  }

  const dated = rows.filter((row) => row.at !== null).map((row) => row.at as number);
  assert.equal(read.summary.ok, true);
  assert.equal(read.summary.clips, rows.length);
  assert.equal(read.summary.matchClips, rows.filter((row) => row.kind === 'match').length);
  assert.equal(read.summary.leagueClips, rows.filter((row) => row.kind === 'league').length);
  assert.equal(read.summary.competitions, perLeague.size);
  assert.equal(read.summary.oldestAt, new Date(Math.min(...dated)).toISOString());
  assert.equal(read.summary.newestAt, new Date(Math.max(...dated)).toISOString());
  assert.equal(read.store, 'repository', 'and the page is told the list is one it cannot add to');
});

test('a clip seen again is refreshed by the table’s rules, and never moves', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'highlights-upsert-'));
  try {
    const store = createFolderStore(folder, { now: () => NOW });
    const original = matchClip(1, { status: 'live', duration: 61 });
    assert.equal(await store.store([{ kind: 'match', clip: original, sourceUrl: 'https://site.api.espn.com/a' }]), 1);

    // Seen again: finished now, retitled, listed without its file or its length,
    // and (wrongly) with a different date and fixture.
    const written = await store.store([{
      kind: 'match',
      sourceUrl: 'https://site.api.espn.com/b',
      clip: { ...original, status: 'final', title: 'Full time', mp4: null, duration: null, startAt: new Date(NOW - 40 * DAY).toISOString(), eventId: 'espn-epl-999999' },
    }]);
    assert.equal(written, 1, 'a refreshed row is a written row, as the table counts it');

    const read = await store.read({});
    assert.equal(read.summary.clips, 1, 'one row per clip, however often it is seen');
    const clip = read.match[0];
    assert.equal(clip.title, 'Full time');
    assert.equal(clip.status, 'final');
    assert.equal(clip.mp4, original.mp4, 'media is never overwritten with nothing');
    assert.equal(clip.duration, 61);
    assert.equal(clip.playable, true, 'playable follows the media that is kept');
    assert.equal(clip.startAt, original.startAt, 'the date it was first stored with is kept');
    assert.equal(clip.eventId, original.eventId);
    assert.deepEqual(read.byStatus, [{ status: 'final', total: 1 }], 'and the counts follow the new state');

    await store.flush();
    const day = JSON.parse(await readFile(path.join(folder, dayPath(original.startAt!.slice(0, 10))), 'utf8')) as { rows: FileRow[] };
    assert.equal(day.rows.length, 1);
    assert.equal(day.rows[0].source_url, 'https://site.api.espn.com/b');
    assert.equal(day.rows[0].seq, 1);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('a run that changes nothing writes nothing', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'highlights-stable-'));
  try {
    const clips = library(3).slice(0, 60);
    const first = createFolderStore(folder, { now: () => NOW });
    await first.store(clips);
    const written = await first.flush();
    assert.ok(written.includes('index.json'));
    assert.ok(written.some((file) => file.startsWith('clips/')));
    assert.ok(written.some((file) => file.startsWith('months/')));
    assert.ok(written.some((file) => file.startsWith('lookup/')));
    assert.deepEqual(await first.flush(), [], 'a second flush has nothing left to write');

    // The same clips, read again the same day: no file changes, so no commit.
    const second = createFolderStore(folder, { now: () => NOW + 60_000 });
    await second.store(clips);
    assert.deepEqual(await second.flush(), []);

    // One new clip touches its own day, the counts, and one lookup file.
    const third = createFolderStore(folder, { now: () => NOW + 120_000 });
    await third.store([{ kind: 'match', clip: matchClip(9_001) }]);
    const changed = await third.flush();
    assert.equal(changed.filter((file) => file.startsWith('clips/')).length, 1);
    assert.equal(changed.filter((file) => file.startsWith('months/')).length, 1);
    assert.ok(changed.includes('index.json'));
    assert.ok(changed.length <= 6, `one clip rewrote ${changed.length} files: ${changed.join(', ')}`);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('lookup files follow the id, so old ones stop changing', () => {
  assert.equal(lookupPath('c:48201234'), 'lookup/n/4820.json');
  assert.equal(lookupPath('x:match:48201234'), 'lookup/n/4820.json', 'every key of one clip shares a file');
  assert.equal(lookupPath('e:espn-epl-704123'), 'lookup/n/70.json');
  assert.match(lookupPath('c:no-number-here'), /^lookup\/h\/[0-9a-f]{2}\.json$/);
  assert.deepEqual(eventKeysOf('espn-epl-704123'), ['espn-epl-704123'], 'a fixture id is never shortened to its competition');
  assert.deepEqual(eventKeysOf('espn-epl-704123-704128'), ['espn-epl-704123-704128', 'espn-epl-704123']);
  assert.deepEqual(eventKeysOf('espn-premier-league-704123'), ['espn-premier-league-704123']);
});

test('probes: a collection that had clips is never asked again, an empty one is after a day', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'highlights-probes-'));
  try {
    let clock = NOW;
    const store = createFolderStore(folder, { now: () => clock });
    const keys = ['probe:epl:1', 'probe:epl:2', 'probe:epl:3', 'media:49000001', 'other:1'];
    assert.deepEqual([...await store.probeable(keys, DAY)].sort(), ['media:49000001', 'probe:epl:1', 'probe:epl:2', 'probe:epl:3'],
      'nothing asked yet, so everything is askable; a key of another kind is ignored');

    await store.recordProbes([{ key: 'probe:epl:1', clips: 3 }, { key: 'probe:epl:2', clips: 0 }, { key: 'media:49000001', clips: 0 }]);
    assert.deepEqual([...await store.probeable(keys, DAY)], ['probe:epl:3']);

    clock += DAY + 1_000;
    assert.deepEqual([...await store.probeable(keys, DAY)].sort(), ['media:49000001', 'probe:epl:2', 'probe:epl:3'],
      'a day later the empty ones are worth asking again; the one with clips never is');

    // An empty answer after a full one does not forget the clips.
    await store.recordProbes([{ key: 'probe:epl:1', clips: 0 }]);
    assert.equal((await store.probeable(['probe:epl:1'], DAY)).size, 0);

    await store.flush();
    const reopened = createFolderStore(folder, { now: () => clock });
    assert.deepEqual([...await reopened.probeable(keys, DAY)].sort(), ['media:49000001', 'probe:epl:2', 'probe:epl:3'], 'and it survives the run');
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('cells: a scoreboard walked recently is skipped, and the count outlives old cells', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'highlights-cells-'));
  try {
    let clock = NOW;
    const store = createFolderStore(folder, { now: () => clock });
    const a = sweepCellKey('epl', '20261119');
    const b = sweepCellKey('nba', '20261119');
    assert.equal((await store.freshCells([a, b], 6 * 3_600_000)).size, 0);
    await store.recordCells([{ key: a, games: 4, clips: 9 }]);
    assert.deepEqual([...await store.freshCells([a, b], 6 * 3_600_000)], [a]);
    clock += 6 * 3_600_000 + 1;
    assert.equal((await store.freshCells([a, b], 6 * 3_600_000)).size, 0, 'stale after its interval');
    await store.recordCells([{ key: a, games: 4, clips: 9 }, { key: b, games: 0, clips: 0 }]);
    let summary = await store.summary();
    assert.equal(summary.sweptCells, 2, 'walking a scoreboard again is not a new scoreboard');
    assert.equal(summary.lastSweepAt, new Date(clock).toISOString());
    await store.flush();

    // Six weeks on, the old cells are dropped from the file; the total is not.
    clock += 45 * DAY;
    const later = createFolderStore(folder, { now: () => clock });
    await later.recordCells([{ key: sweepCellKey('epl', '20270103'), games: 1, clips: 1 }]);
    await later.flush();
    const file = JSON.parse(await readFile(path.join(folder, 'state/cells.json'), 'utf8')) as { cells: Record<string, unknown> };
    assert.deepEqual(Object.keys(file.cells), [sweepCellKey('epl', '20270103')]);
    summary = await createFolderStore(folder).summary();
    assert.equal(summary.sweptCells, 3);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('a league video gets its playable file once, and keeps it', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'highlights-media-'));
  try {
    const store = createFolderStore(folder, { now: () => NOW });
    const clips = [1, 2, 3].map((n): StoredClip => ({ kind: 'league', clip: leagueClip(n), sourceUrl: 'https://site.api.espn.com/news' }));
    await store.store(clips);
    assert.deepEqual((await store.newsClipsNeedingMedia(99)).map((row) => row.clipId), ['49000001', '49000002', '49000003'], 'newest first');
    assert.equal(await store.findNewsMedia('49000002'), null);

    assert.equal(await store.storeNewsMedia('49000002', { mp4: null, hls: null, page: null, thumbnail: null, duration: null }), 0,
      'a rendition that cannot play is not stored');
    const media = { mp4: 'https://espnmedia-cdn.akamaized.net/espn/49000002.mp4', hls: null, page: null, thumbnail: 'https://a.espncdn.com/t.jpg', duration: 77 };
    assert.equal(await store.storeNewsMedia('49000002', media), 1);
    assert.equal(await store.storeNewsMedia('49009999', media), 0, 'nothing to update for a clip that is not stored');

    assert.deepEqual((await store.newsClipsNeedingMedia(99)).map((row) => row.clipId), ['49000001', '49000003']);
    const found = await store.findNewsMedia('49000002');
    assert.equal(found?.mp4, media.mp4);
    assert.equal(found?.duration, 77);
    assert.equal(found?.thumbnail, media.thumbnail, 'the rendition fills a gap the listing left');

    // The listing is read again every pass, and carries no file: the file stays.
    await store.store(clips);
    assert.equal((await store.findNewsMedia('49000002'))?.mp4, media.mp4);
    await store.flush();
    assert.equal((await createFolderStore(folder).findNewsMedia('49000002'))?.mp4, media.mp4);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('a file that is there but unreadable stops the run instead of being overwritten', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'highlights-broken-'));
  try {
    const store = createFolderStore(folder, { now: () => NOW });
    await store.store([{ kind: 'match', clip: matchClip(1) }]);
    await store.flush();
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path.join(folder, 'index.json'), '{ not json', 'utf8');
    const broken = createFolderStore(folder, { now: () => NOW });
    await assert.rejects(() => broken.store([{ kind: 'match', clip: matchClip(2) }]), /index\.json/);
    assert.equal(await readFile(path.join(folder, 'index.json'), 'utf8'), '{ not json');
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

/* ── The sweeper, writing to a folder ───────────────────────────────────── */

const scoreboard = (eventId: string) => ({
  events: [{
    id: eventId,
    date: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    competitions: [{
      status: { type: { state: 'post', shortDetail: 'Final' } },
      competitors: [
        { homeAway: 'home', team: { displayName: 'Hosts', abbreviation: 'HOS' }, score: '2' },
        { homeAway: 'away', team: { displayName: 'Visitors', abbreviation: 'VIS' }, score: '1' },
      ],
    }],
  }],
});

const collection = (id: string) => ({
  videos: [{
    id: Number(id),
    source: 'espn',
    headline: `Highlights ${id}`,
    description: `Highlights ${id}`,
    duration: 42,
    thumbnail: `https://espnmedia-cdn.akamaized.net/espn/media/common/2026/1119/${id}.jpg`,
    links: {
      source: { href: `https://espnmedia-cdn.akamaized.net/espn/media/16x9/2026/1119/${id}.mp4` },
      web: { href: `https://www.espn.com/video/clip/_/id/${id}` },
    },
  }],
});

async function withEspn(run: () => Promise<void>): Promise<string[]> {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = ((input: unknown) => {
    const url = String(input);
    urls.push(url);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.includes('/videos?event=')) return Promise.resolve(json(collection(new URL(url).searchParams.get('event') ?? '0')));
    if (url.includes('/scoreboard')) {
      // One game per scoreboard, with an id unique to the competition and date.
      const league = url.split('/sports/')[1]?.split('/scoreboard')[0] ?? 'x';
      let h = 0;
      for (const char of `${league}${url.match(/dates=(\d{8})/)?.[1] ?? ''}`) h = (Math.imul(h, 31) + char.charCodeAt(0)) >>> 0;
      return Promise.resolve(json(scoreboard(String(401_000_000 + (h % 900_000)))));
    }
    return Promise.resolve(json({ articles: [] }));
  }) as typeof fetch;
  try { await run(); } finally { globalThis.fetch = original; }
  return urls;
}

test('the ordinary sweeper fills the folder, and the next run carries on from it', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'highlights-sweep-'));
  try {
    resetHighlightsSweep();
    const first = createFolderStore(folder);
    let firstGames = 0;
    const urls = await withEspn(async () => {
      const pass = await runHighlightsSweep({ store: first, force: true });
      assert.equal(pass.ok, true);
      assert.equal(pass.cells, CELLS_PER_PASS);
      assert.equal(pass.games, GAMES_PER_PASS);
      assert.equal(pass.clips, GAMES_PER_PASS);
      assert.equal(pass.summary.clips, GAMES_PER_PASS, 'the report counts what is in the folder');
      assert.equal(pass.summary.sweptCells, CELLS_PER_PASS);
      firstGames = pass.games;
    });
    await first.idle();
    await first.flush();
    const asked = new Set(urls.filter((url) => url.includes('/scoreboard')));
    assert.equal(asked.size, CELLS_PER_PASS);

    // A new process, as the next scheduled run is: it reads the folder and
    // walks the scoreboards the first run did not reach, and no game twice.
    resetHighlightsSweep();
    const second = createFolderStore(folder);
    const later = await withEspn(async () => {
      const pass = await runHighlightsSweep({ store: second, force: true });
      assert.equal(pass.ok, true);
      assert.equal(pass.cells, CELLS_PER_PASS);
      assert.equal(pass.summary.clips, firstGames + pass.clips);
      assert.equal(pass.summary.sweptCells, CELLS_PER_PASS * 2);
    });
    const repeated = later.filter((url) => url.includes('/scoreboard') && asked.has(url));
    assert.deepEqual(repeated, [], 'no scoreboard walked by the first run is walked again');
    const firstCollections = new Set(urls.filter((url) => url.includes('/videos?event=')));
    assert.deepEqual(later.filter((url) => firstCollections.has(url)), [], 'and no game is asked twice');

    await second.idle();
    await second.flush();
    const read = await createFolderStore(folder).read({ limit: 60 });
    assert.equal(read.match.length, GAMES_PER_PASS * 2);
    assert.ok(read.match.every((clip) => clip.playable && clip.mp4?.endsWith('.mp4')));
  } finally {
    resetHighlightsSweep();
    await rm(folder, { recursive: true, force: true });
  }
});

/* ── The site, reading the folder over HTTP ─────────────────────────────── */

let server: Server | null = null;
let base = '';
let serving = true;
let missing = false;
const requested: string[] = [];

before(async () => {
  server = createServer((request, response) => {
    const file = decodeURIComponent((request.url ?? '/').split('?')[0]).replace(/^\/data\//, '');
    requested.push(file);
    if (!serving) { response.writeHead(503).end('unavailable'); return; }
    if (missing || file.includes('..')) { response.writeHead(404).end('Not Found'); return; }
    readFile(path.join(dir, file)).then(
      (body) => response.writeHead(200, { 'content-type': 'application/json' }).end(body),
      () => response.writeHead(404).end('Not Found'),
    );
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/data`;
});

after(async () => {
  delete process.env.HIGHLIGHTS_DATA_URL;
  delete process.env.HIGHLIGHTS_STORE;
  resetHighlightsFiles();
  await new Promise<void>((resolve) => { if (server) server.close(() => resolve()); else resolve(); });
});

async function onSite(run: () => Promise<void>): Promise<void> {
  process.env.HIGHLIGHTS_DATA_URL = `${base}/`;
  delete process.env.HIGHLIGHTS_STORE;
  serving = true;
  missing = false;
  requested.length = 0;
  resetHighlightsFiles();
  try { await run(); } finally {
    delete process.env.HIGHLIGHTS_DATA_URL;
    resetHighlightsFiles();
  }
}

test('without the folder’s address the site behaves exactly as before', async () => {
  delete process.env.HIGHLIGHTS_DATA_URL;
  assert.equal(highlightsStore.available(), false);
  assert.equal((await highlightsStore.read({})).reason, 'no-database');
  assert.equal((await readFeedClips(7)).reason, 'no-database');
});

test('the site reads the folder: the index page', async () => {
  await onSite(async () => {
    assert.equal(highlightsStore.available(), true, 'no database, and the stored list is there all the same');
    assert.equal(highlightsStore.readOnly?.(), true);

    const now = Date.now();
    const queries: HighlightsIndexQuery[] = [{}, { kind: 'league', limit: 60 }, { league: 'nba', status: 'final', days: 30, offset: 24 }, { days: 7, limit: 12, kind: 'match' }];
    for (const query of queries) {
      const read = await highlightsStore.read(query);
      const want = expected(rows, query, now);
      assert.equal(read.ok, true);
      assert.deepEqual(read.match.map((clip) => clip.id), want.match, JSON.stringify(query));
      assert.deepEqual(read.league.map((clip) => clip.clipId), want.league, JSON.stringify(query));
      assert.equal(read.remaining, want.remaining, JSON.stringify(query));
      assert.equal(read.summary.clips, rows.length);
    }
  });
});

test('the site reads the folder: the feed, one clip, one fixture, the sitemap', async () => {
  await onSite(async () => {
    const now = Date.now();
    const matches = rows.filter((row) => row.kind === 'match');

    const feed = await readFeedClips(30, 300);
    const inWindow = matches.filter((row) => row.at !== null && row.at >= now - 30 * DAY);
    assert.equal(feed.ok, true);
    assert.deepEqual(feed.clips.map((clip) => clip.id), inWindow.slice(0, 300).map((row) => row.clip_id));
    assert.equal(feed.remaining, Math.max(0, inWindow.length - 300));

    const everything = await readFeedClips(0, 50);
    assert.deepEqual(everything.clips.map((clip) => clip.id), matches.slice(0, 50).map((row) => row.clip_id));
    assert.equal(everything.remaining, matches.length - 50);

    // One clip, by the id in its URL — whatever case a crawler sends it in.
    const some = matches[137];
    const one = await readStoredClip(some.clip_id.toUpperCase());
    assert.equal(one.ok, true);
    assert.equal(one.clip?.id, some.clip_id);
    assert.equal(one.clip?.title, some.title);
    assert.deepEqual(await readStoredClip('48999999'), { ok: true, clip: null }, 'a clip that is not stored is still a good read');

    const anchored = await findStoredHighlightClip(highlightAnchorId({ id: some.clip_id }));
    assert.equal(anchored?.id, some.clip_id);
    assert.equal(await findStoredHighlightClip('no-such-anchor'), null);

    // One fixture: its own id, and the same fixture under a competition suffix.
    const suffixed = matches.find((row) => /-\d+-\d+$/.test(row.event_id ?? ''))!;
    const fixture = suffixed.event_id!.replace(/-\d+$/, '');
    const wanted = matches.filter((row) => row.event_id === fixture || row.event_id!.startsWith(`${fixture}-`));
    assert.ok(wanted.length >= 2, 'the fixture has clips under both forms of its id');
    const event = await readEventClips(fixture);
    assert.deepEqual(event.clips.map((clip) => clip.id), wanted.slice(0, 24).map((row) => row.clip_id));
    assert.deepEqual((await readEventClips('espn-epl')).clips, [], 'a competition is not a fixture');

    const refs = await readRecentClipRefs(2_000);
    assert.deepEqual(refs.refs.map((ref) => ref.id), matches.map((row) => row.clip_id));
    assert.equal(refs.refs[0].at?.getTime(), matches[0].at);

    // Fixtures, newest first, each with the number of clips it has.
    const groups = new Map<string, { eventId: string; at: number | null; clips: number }>();
    for (const row of matches) {
      const key = `${row.event_id}|${row.league}`;
      const group = groups.get(key) ?? { eventId: row.event_id!, at: null, clips: 0 };
      group.clips += 1;
      if (row.at !== null && (group.at === null || row.at > group.at)) group.at = row.at;
      groups.set(key, group);
    }
    const wantEvents = [...groups.values()].sort((a, b) => {
      if (a.at !== b.at) return (b.at ?? -Infinity) - (a.at ?? -Infinity);
      return a.eventId < b.eventId ? 1 : -1;
    });
    const events = await readRecentEventRefs(2_000);
    assert.equal(events.ok, true);
    assert.deepEqual(events.refs.map((ref) => [ref.eventId, ref.clips]), wantEvents.map((group) => [group.eventId, group.clips]));
    const top = await readRecentEventRefs(25);
    assert.deepEqual(top.refs.map((ref) => ref.eventId), wantEvents.slice(0, 25).map((group) => group.eventId));
  });
});

test('the site reads a league video’s stored file from the folder', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'highlights-site-media-'));
  const previous = dir;
  try {
    const store = createFolderStore(folder, { now: () => NOW });
    await store.store([{ kind: 'league', clip: leagueClip(5) }]);
    await store.storeNewsMedia('49000005', { mp4: 'https://espnmedia-cdn.akamaized.net/espn/5.mp4', hls: null, page: null, thumbnail: null, duration: 12 });
    await store.flush();
    dir = folder;
    await onSite(async () => {
      assert.equal((await findStoredNewsMedia('49000005'))?.mp4, 'https://espnmedia-cdn.akamaized.net/espn/5.mp4');
      assert.equal(await findStoredNewsMedia('49000006'), null);
    });
  } finally {
    dir = previous;
    await rm(folder, { recursive: true, force: true });
  }
});

test('a page of the index costs a few small files, and a second read costs none', async () => {
  await onSite(async () => {
    await highlightsStore.read({ limit: 24 });
    const first = requested.length;
    assert.ok(first <= 6, `the first page asked for ${first} files: ${requested.join(', ')}`);
    assert.ok(requested.includes('index.json'));
    for (const file of requested) {
      const size = (await stat(path.join(dir, file))).size;
      assert.ok(size < 400_000, `${file} is ${size} bytes`);
    }
    await highlightsStore.read({ limit: 24 });
    assert.equal(requested.length, first, 'what is already held is not asked for again');
    // A filter may need days the first page did not; asked once, then held too.
    await highlightsStore.read({ limit: 24, league: 'epl' });
    const filtered = requested.length;
    await highlightsStore.read({ limit: 24, league: 'epl' });
    await highlightsStore.read({ limit: 12, league: 'epl', offset: 3 });
    assert.equal(requested.length, filtered);
    assert.equal(new Set(requested).size, requested.length, 'and no file is ever asked for twice');

    // Deep into the list: the days in between are counted, not opened.
    requested.length = 0;
    resetHighlightsFiles();
    await highlightsStore.read({ limit: 24, offset: 480 });
    const days = requested.filter((file) => file.startsWith('clips/'));
    assert.ok(days.length <= 8, `skipping 480 clips opened ${days.length} day files`);
  });
});

test('the site cannot write to the folder, and asks ESPN for nothing', async () => {
  await onSite(async () => {
    assert.equal(await highlightsStore.store([{ kind: 'match', clip: matchClip(77_777) }]), 0);
    assert.equal(await highlightsStore.storeNewsMedia('49000001', { mp4: 'https://espnmedia-cdn.akamaized.net/a.mp4', hls: null, page: null, thumbnail: null, duration: 1 }), 0);
    assert.deepEqual(await highlightsStore.newsClipsNeedingMedia(6), []);

    resetHighlightsSweep();
    const urls = await withEspn(async () => {
      // `withEspn` replaces fetch, so the folder is read first, through the real one.
    });
    assert.deepEqual(urls, []);
    const summary = await highlightsStore.summary();
    const original = globalThis.fetch;
    const asked: string[] = [];
    globalThis.fetch = ((input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith(base)) asked.push(url);
      return original(input as Parameters<typeof fetch>[0], init);
    }) as typeof fetch;
    try {
      const pass = await runHighlightsSweep({ force: true });
      assert.equal(pass.ok, false);
      assert.equal(pass.reason, 'scheduled', 'the list is filled by the scheduled job, not by a page');
      assert.equal(pass.requests, 0);
      assert.equal(pass.summary.clips, summary.clips, 'and the report still carries the real totals');
    } finally {
      globalThis.fetch = original;
      resetHighlightsSweep();
    }
    assert.deepEqual(asked, [], 'no request left for ESPN');
  });
});

test('when GitHub does not answer, the last copy is served; with no copy, the live board is the fallback', async () => {
  await onSite(async () => {
    const good = await highlightsStore.read({ limit: 24 });
    assert.equal(good.ok, true);
    serving = false;

    // Past the two minutes a file is trusted for, with the server refusing.
    const realNow = Date.now;
    Date.now = () => realNow() + 10 * 60_000;
    try {
      const stale = await highlightsStore.read({ limit: 24 });
      assert.equal(stale.ok, true, 'an outage costs freshness, not the clips');
      assert.deepEqual(stale.match.map((clip) => clip.id), good.match.map((clip) => clip.id));
    } finally {
      Date.now = realNow;
    }

    // A process that never managed to read anything says so, and does not throw.
    resetHighlightsFiles();
    const none = await highlightsStore.read({});
    assert.equal(none.ok, false);
    assert.equal(none.reason, 'query-failed');
    assert.equal(none.store, 'repository');
    assert.deepEqual(none.match, []);
    assert.equal((await readFeedClips(7)).ok, false);
    assert.equal((await readStoredClip('48000001')).ok, false);
    assert.deepEqual((await readRecentClipRefs()).refs, []);
    assert.equal(await findStoredHighlightClip('48000001'), null);
    assert.equal((await highlightsStore.summary()).ok, false);
  });
});

test('before the first scheduled run there is no folder: an empty list, not an error', async () => {
  await onSite(async () => {
    missing = true;
    const read = await highlightsStore.read({});
    assert.equal(read.ok, true);
    assert.equal(read.summary.clips, 0);
    assert.deepEqual(read.match, []);
    assert.equal(read.remaining, 0);
    assert.deepEqual((await readFeedClips(7)).clips, []);
    assert.deepEqual(await readStoredClip('48000001'), { ok: true, clip: null });
    assert.deepEqual((await readRecentEventRefs()).refs, []);
  });
});

test('HIGHLIGHTS_STORE=database keeps the list in Postgres even when the folder is known', async () => {
  await onSite(async () => {
    process.env.HIGHLIGHTS_STORE = 'database';
    try {
      assert.equal(highlightsStore.available(), false, 'no database in this test, so nothing is available');
      assert.equal((await highlightsStore.read({})).reason, 'no-database');
      assert.deepEqual(requested, [], 'and the folder is not asked');
    } finally {
      delete process.env.HIGHLIGHTS_STORE;
    }
  });
});

test('the folder holds only small text files', async () => {
  const walk = async (folder: string): Promise<string[]> => {
    const found: string[] = [];
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) found.push(...await walk(full));
      else found.push(full);
    }
    return found;
  };
  const all = await walk(dir);
  assert.ok(all.length > 20);
  assert.ok(all.every((file) => file.endsWith('.json')), 'no video, no image: only the list');
  let bytes = 0;
  for (const file of all) bytes += (await stat(file)).size;
  // 660 clips. A clip is under a kilobyte of text plus its share of the indexes.
  assert.ok(bytes / rows.length < 1_500, `${Math.round(bytes / rows.length)} bytes per clip`);
});
