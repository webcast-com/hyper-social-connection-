/**
 * The stored highlights index as a folder on disk: the half that writes.
 *
 * `createFolderStore(dir)` is a `HighlightsStore` — the same surface the
 * sweeper drives against Postgres — backed by the JSON files described in
 * `highlights-files.ts`. The scheduled job (`scripts/highlights-sweep.ts`) runs
 * the ordinary sweeper against it and commits the folder to the repository's
 * `highlights-data` branch, where the site reads it. The site never imports
 * this file: it uses `node:fs`, and a deployed site cannot write to disk.
 *
 * It keeps the table's rules exactly:
 *
 *   - one row per `external_key`; a clip seen again refreshes its row
 *   - media, and the URLs that carry it, are never overwritten with nothing
 *   - `playable` is derived from the merged media
 *   - a row keeps the date, fixture and competition it was first stored with,
 *     so it never moves between day files
 *   - nothing is ever deleted
 *   - a game collection that answered with clips is never asked again; one that
 *     answered empty is asked again after the caller's interval
 *   - a scoreboard walked recently is skipped
 *
 * Everything is changed in memory and written by `flush()`, in an order that
 * leaves `index.json` for last, so a run that dies half-way has not published a
 * total that the files beside it cannot back up. Files are written in a stable
 * layout — one clip per line, keys in order — so a commit shows what changed
 * and Git stores the difference.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  MAX_MEDIA_WARM, resolveIndexQuery, storedSeconds, storedText, storedUrl, uniqueRows,
  type ClipRow, type HighlightsStore,
} from './highlights-index';
import {
  CELLS_PATH, HighlightsFiles, INDEX_PATH, PROBES_PATH, UNDATED, cubeKey, dayOf, dayPath, emptyIndex,
  keyOfNews, keyOfRow, lookupKeysOf, lookupPath, monthOf, monthPath, newestFirst,
  type Cube, type FileRow, type FileSource, type IndexFile, type LookupFile, type MonthFile,
} from './highlights-files';

/** Scoreboard cells are forgotten after this long; a pass looks at most 30 days back. */
const KEEP_CELLS_MS = 40 * 86_400_000;
/** Probes are forgotten once the game is far outside anything a pass walks. */
const KEEP_PROBES_MS = 60 * 86_400_000;
/** Keys asked about at once, as in the table's queries. */
const MAX_PROBE_KEYS = 500;
const MAX_CELL_KEYS = 2_000;

/** key → [when, clips found, attempts] */
type ProbesFile = { probes: Record<string, [string, number, number]> };
/** key → [when, games, clips] */
type CellsFile = { cells: Record<string, [string, number, number]> };

const isProbeKey = (key: string) => key.startsWith('probe:') || key.startsWith('media:');
const isCellKey = (key: string) => key.startsWith('sweep:');

/* ── A directory of JSON files, held in memory until flushed ────────────── */

class Directory implements FileSource {
  private readonly held = new Map<string, unknown | null>();
  private readonly dirty = new Set<string>();

  constructor(readonly dir: string) {}

  async json(file: string): Promise<unknown | null> {
    if (this.held.has(file)) return this.held.get(file) ?? null;
    let value: unknown | null = null;
    try {
      value = JSON.parse(await readFile(path.join(this.dir, file), 'utf8')) as unknown;
    } catch (error) {
      // A file that is not there yet is an empty one. Anything else — a file
      // that is there and cannot be read — must stop the run: carrying on would
      // write an empty file over it.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`${file}: ${(error as Error).message}`);
    }
    this.held.set(file, value);
    return value;
  }

  /** The file's object, created when the file does not exist yet. */
  async open<T extends object>(file: string, create: () => T): Promise<T> {
    const found = await this.json(file);
    if (found && typeof found === 'object') return found as T;
    const made = create();
    this.held.set(file, made);
    return made;
  }

  touch(file: string): void {
    this.dirty.add(file);
  }

  pending(): string[] {
    return [...this.dirty];
  }

  held_(file: string): unknown | null {
    return this.held.get(file) ?? null;
  }

  done(file: string): void {
    this.dirty.delete(file);
  }
}

/* ── Stable serialisation ───────────────────────────────────────────────── */

const ROW_ORDER: (keyof FileRow)[] = [
  'seq', 'external_key', 'kind', 'clip_id', 'title', 'description', 'duration', 'thumbnail', 'mp4', 'hls', 'page',
  'event_id', 'event_name', 'sport', 'league', 'league_name', 'home', 'away', 'home_logo', 'away_logo', 'teams',
  'occurred_at', 'source_url', 'status', 'anchor_key', 'discovered_at', 'seen_at',
];

/** One clip on one line: fixed key order, and nothing written for an empty column. */
function rowLine(row: FileRow): string {
  const out: Record<string, unknown> = {};
  for (const key of ROW_ORDER) {
    const value = row[key];
    if (value !== null && value !== undefined && value !== '') out[key] = value;
  }
  return JSON.stringify(out);
}

const sorted = <T>(record: Record<string, T>): [string, T][] =>
  Object.entries(record).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

const sortedCube = (cube: Cube): Cube => Object.fromEntries(sorted(cube));

/** `{"name":{\n"key":value,\n…}}` — one entry per line, keys in order. */
function linesOf(name: string | null, record: Record<string, unknown>): string {
  const lines = sorted(record).map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`);
  const body = lines.length ? `{\n${lines.join(',\n')}\n}` : '{}';
  return name ? `{${JSON.stringify(name)}:${body}}\n` : `${body}\n`;
}

function serialise(file: string, value: unknown): string {
  if (file === INDEX_PATH) {
    const index = value as IndexFile;
    return `${JSON.stringify({ ...index, cube: sortedCube(index.cube), months: Object.fromEntries(sorted(index.months)) }, null, 1)}\n`;
  }
  if (file.startsWith('clips/')) {
    const rows = (value as { rows: FileRow[] }).rows;
    return rows.length ? `{"rows":[\n${rows.map(rowLine).join(',\n')}\n]}\n` : '{"rows":[]}\n';
  }
  if (file.startsWith('months/')) {
    const days = (value as MonthFile).days;
    return linesOf('days', Object.fromEntries(Object.entries(days).map(([day, entry]) => [day, { n: entry.n, cube: sortedCube(entry.cube) }])));
  }
  if (file === PROBES_PATH) return linesOf('probes', (value as ProbesFile).probes);
  if (file === CELLS_PATH) return linesOf('cells', (value as CellsFile).cells);
  return linesOf(null, value as Record<string, unknown>);
}

/* ── The store ──────────────────────────────────────────────────────────── */

export type FolderStore = HighlightsStore & {
  /**
   * Resolves once nothing is in flight. The sweeper starts some writes without
   * waiting for them (a rendition stored after a play, the probe recorded after
   * that), so a caller about to flush waits here first.
   */
  idle(): Promise<void>;
  /** Write every changed file. Returns the paths written, relative to the folder. */
  flush(): Promise<string[]>;
  /** The reader over the same in-memory files, for reports and tests. */
  files: HighlightsFiles;
};

const iso = (value: Date | string | null): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const cubeOfRows = (rows: FileRow[]): Cube => {
  const cube: Cube = {};
  for (const row of rows) cube[cubeKey(row)] = (cube[cubeKey(row)] ?? 0) + 1;
  return cube;
};

export function createFolderStore(dir: string, options: { now?: () => number } = {}): FolderStore {
  const now = options.now ?? Date.now;
  const directory = new Directory(dir);
  const files = new HighlightsFiles(directory);

  const openIndex = async (): Promise<IndexFile> => {
    await directory.open<IndexFile>(INDEX_PATH, emptyIndex);
    return files.index();
  };
  const openMonth = async (month: string): Promise<MonthFile> => {
    await directory.open<MonthFile>(monthPath(month), () => ({ days: {} }));
    return files.month(month);
  };
  const openDay = async (day: string): Promise<FileRow[]> => {
    await directory.open(dayPath(day), () => ({ rows: [] as FileRow[] }));
    return files.day(day);
  };
  const openLookup = (key: string) => directory.open<LookupFile>(lookupPath(key), () => ({}));
  const openProbes = async (): Promise<ProbesFile['probes']> => {
    const file = await directory.open<ProbesFile>(PROBES_PATH, () => ({ probes: {} }));
    if (!file.probes || typeof file.probes !== 'object') file.probes = {};
    return file.probes;
  };
  const openCells = async (): Promise<CellsFile['cells']> => {
    const file = await directory.open<CellsFile>(CELLS_PATH, () => ({ cells: {} }));
    if (!file.cells || typeof file.cells !== 'object') file.cells = {};
    return file.cells;
  };

  /** Where a stored row is, by its unique key. */
  const findRow = async (externalKey: string): Promise<{ day: string; rows: FileRow[]; row: FileRow } | null> => {
    for (const day of await files.lookup(keyOfRow(externalKey))) {
      const rows = await openDay(day);
      const row = rows.find((entry) => entry.external_key === externalKey);
      if (row) return { day, rows, row };
    }
    return null;
  };

  /** Bring the counts back in line with the rows of the days that changed. */
  const recount = async (days: Set<string>): Promise<void> => {
    if (!days.size) return;
    const index = await openIndex();
    const months = new Set<string>();
    for (const day of days) {
      const rows = await openDay(day);
      rows.sort(newestFirst);
      directory.touch(dayPath(day));

      const month = await openMonth(monthOf(day));
      const before = month.days[day]?.cube ?? {};
      const after = cubeOfRows(rows);
      for (const [key, n] of Object.entries(before)) index.cube[key] = (index.cube[key] ?? 0) - n;
      for (const [key, n] of Object.entries(after)) index.cube[key] = (index.cube[key] ?? 0) + n;
      for (const key of Object.keys(index.cube)) if (index.cube[key] <= 0) delete index.cube[key];
      if (rows.length) month.days[day] = { n: rows.length, cube: after };
      else delete month.days[day];
      months.add(monthOf(day));
      directory.touch(monthPath(monthOf(day)));

      if (day !== UNDATED) {
        for (const row of rows) {
          if (!row.occurred_at) continue;
          if (!index.oldestAt || row.occurred_at < index.oldestAt) index.oldestAt = row.occurred_at;
          if (!index.newestAt || row.occurred_at > index.newestAt) index.newestAt = row.occurred_at;
        }
      }
    }
    for (const name of months) {
      const month = await openMonth(name);
      const total = Object.values(month.days).reduce((sum, entry) => sum + entry.n, 0);
      if (total) index.months[name] = total;
      else delete index.months[name];
    }
    index.clips = Object.values(index.cube).reduce((sum, n) => sum + n, 0);
    index.updatedAt = new Date(now()).toISOString();
    directory.touch(INDEX_PATH);
  };

  /** Insert or refresh one row, by the table's `ON CONFLICT` rules. */
  const upsert = async (incoming: ClipRow, changed: Set<string>): Promise<void> => {
    const today = new Date(now()).toISOString().slice(0, 10);
    const found = await findRow(incoming.external_key);
    if (found) {
      const { row } = found;
      const before = rowLine(row);
      row.title = incoming.title;
      row.description = incoming.description;
      row.duration = incoming.duration ?? row.duration;
      row.thumbnail = incoming.thumbnail ?? row.thumbnail;
      row.mp4 = incoming.mp4 ?? row.mp4;
      row.hls = incoming.hls ?? row.hls;
      row.page = incoming.page ?? row.page;
      row.playable = !!row.mp4;
      row.event_name = incoming.event_name;
      row.league_name = incoming.league_name;
      row.home = incoming.home;
      row.away = incoming.away;
      row.home_logo = incoming.home_logo;
      row.away_logo = incoming.away_logo;
      row.teams = incoming.teams;
      row.source_url = incoming.source_url;
      row.status = incoming.status;
      row.seen_at = today;
      if (rowLine(row) !== before) changed.add(found.day);
      return;
    }

    const index = await openIndex();
    const occurredAt = iso(incoming.occurred_at);
    const row: FileRow = {
      ...incoming,
      occurred_at: occurredAt,
      playable: !!incoming.mp4,
      seq: index.nextSeq,
      discovered_at: new Date(now()).toISOString(),
      seen_at: today,
    };
    index.nextSeq += 1;
    directory.touch(INDEX_PATH);
    const day = dayOf(occurredAt);
    (await openDay(day)).push(row);
    changed.add(day);
    for (const key of lookupKeysOf(row)) {
      const lookup = await openLookup(key);
      const days = Array.isArray(lookup[key]) ? lookup[key] : [];
      if (!days.includes(day)) {
        lookup[key] = [...days, day].sort();
        directory.touch(lookupPath(key));
      }
    }
  };

  // One operation at a time. The files are shared objects in memory, and two
  // writes interleaved at an `await` could each count the other's row.
  let tail: Promise<unknown> = Promise.resolve();
  const queued = <T>(job: () => Promise<T>): Promise<T> => {
    const next = tail.then(job, job);
    tail = next.catch(() => undefined);
    return next;
  };
  const serial = <A extends unknown[], T>(job: (...args: A) => Promise<T>) => (...args: A) => queued(() => job(...args));

  const store: Omit<FolderStore, 'idle'> = {
    files,

    available: () => true,

    summary: () => files.summary(),

    read: (query) => files.read(resolveIndexQuery(query)),

    async store(clips) {
      const rows = uniqueRows(clips);
      const changed = new Set<string>();
      for (const row of rows) await upsert(row, changed);
      await recount(changed);
      // As the table reports it: every row inserted or refreshed.
      return rows.length;
    },

    async probeable(keys, reprobeEmptyAfterMs) {
      const wanted = [...new Set(keys.filter(isProbeKey))].slice(0, MAX_PROBE_KEYS);
      if (!wanted.length) return new Set();
      const probes = await openProbes();
      const cutoff = new Date(now() - reprobeEmptyAfterMs).toISOString();
      return new Set(wanted.filter((key) => {
        const probe = probes[key];
        return !probe || !(probe[1] > 0 || probe[0] > cutoff);
      }));
    },

    async recordProbes(entries) {
      const rows = entries.filter((entry) => isProbeKey(entry.key)).slice(0, MAX_PROBE_KEYS);
      if (!rows.length) return;
      const probes = await openProbes();
      const at = new Date(now()).toISOString();
      for (const entry of rows) {
        const before = probes[entry.key];
        const found = Math.max(0, Math.trunc(entry.clips) || 0);
        probes[entry.key] = before ? [at, Math.max(before[1], found), before[2] + 1] : [at, found, 1];
      }
      directory.touch(PROBES_PATH);
    },

    async freshCells(keys, cellTtlMs) {
      const wanted = [...new Set(keys.filter(isCellKey))].slice(0, MAX_CELL_KEYS);
      if (!wanted.length) return new Set();
      const cells = await openCells();
      const cutoff = new Date(now() - cellTtlMs).toISOString();
      return new Set(wanted.filter((key) => !!cells[key] && cells[key][0] > cutoff));
    },

    async recordCells(entries) {
      const rows = entries.filter((entry) => isCellKey(entry.key)).slice(0, MAX_CELL_KEYS);
      if (!rows.length) return;
      const cells = await openCells();
      const index = await openIndex();
      const at = new Date(now()).toISOString();
      for (const entry of rows) {
        // Counted once, when first walked, so the total survives old cells being dropped.
        if (!cells[entry.key]) index.sweptCells += 1;
        cells[entry.key] = [at, Math.max(0, Math.trunc(entry.games) || 0), Math.max(0, Math.trunc(entry.clips) || 0)];
      }
      index.lastSweepAt = at;
      index.updatedAt = at;
      directory.touch(CELLS_PATH);
      directory.touch(INDEX_PATH);
    },

    async findNewsMedia(clipId) {
      const id = storedText(clipId, 64);
      return id ? files.newsMedia(id) : null;
    },

    async storeNewsMedia(clipId, media) {
      const id = storedText(clipId, 64);
      const mp4 = storedUrl(media?.mp4 ?? null);
      const hls = storedUrl(media?.hls ?? null);
      if (!id || (!mp4 && !hls)) return 0;
      const changed = new Set<string>();
      let updated = 0;
      for (const day of await files.lookup(keyOfNews(id))) {
        for (const row of await openDay(day)) {
          if (row.kind !== 'league' || row.clip_id !== id) continue;
          row.mp4 = mp4;
          row.hls = hls;
          row.duration = storedSeconds(media?.duration ?? null) ?? row.duration;
          row.playable = !!mp4;
          row.thumbnail = row.thumbnail ?? storedUrl(media?.thumbnail ?? null);
          row.page = row.page ?? storedUrl(media?.page ?? null);
          changed.add(day);
          updated += 1;
        }
      }
      await recount(changed);
      return updated;
    },

    async newsClipsNeedingMedia(limit) {
      const max = Math.max(1, Math.min(MAX_MEDIA_WARM, Math.trunc(limit) || MAX_MEDIA_WARM));
      return files.newsNeedingMedia(max);
    },

    async flush() {
      // State that can no longer matter is dropped here, once per run.
      if (directory.pending().includes(CELLS_PATH)) {
        const cells = await openCells();
        const cutoff = new Date(now() - KEEP_CELLS_MS).toISOString();
        for (const key of Object.keys(cells)) if (cells[key][0] < cutoff) delete cells[key];
      }
      if (directory.pending().includes(PROBES_PATH)) {
        const probes = await openProbes();
        const cutoff = new Date(now() - KEEP_PROBES_MS).toISOString();
        for (const key of Object.keys(probes)) if (probes[key][0] < cutoff) delete probes[key];
      }

      // The index last: it is the file that says the others are there.
      const order = (file: string) => (file === INDEX_PATH ? 3 : file.startsWith('months/') ? 2 : file.startsWith('state/') ? 1 : 0);
      const pending = directory.pending().sort((a, b) => order(a) - order(b) || (a < b ? -1 : 1));
      const written: string[] = [];
      for (const file of pending) {
        const value = directory.held_(file);
        if (!value) continue;
        const target = path.join(dir, file);
        const text = serialise(file, value);
        let current: string | null = null;
        try { current = await readFile(target, 'utf8'); } catch { current = null; }
        if (current !== text) {
          await mkdir(path.dirname(target), { recursive: true });
          // Written beside the file and moved into place, so a reader never
          // sees half of one.
          await writeFile(`${target}.tmp`, text, 'utf8');
          await rename(`${target}.tmp`, target);
          written.push(file);
        }
        directory.done(file);
      }
      return written;
    },
  };

  return {
    files,
    available: store.available,
    summary: serial(store.summary),
    read: serial(store.read),
    store: serial(store.store),
    probeable: serial(store.probeable),
    recordProbes: serial(store.recordProbes),
    freshCells: serial(store.freshCells),
    recordCells: serial(store.recordCells),
    findNewsMedia: serial(store.findNewsMedia),
    storeNewsMedia: serial(store.storeNewsMedia),
    newsClipsNeedingMedia: serial(store.newsClipsNeedingMedia),
    flush: serial(store.flush),
    async idle() {
      for (;;) {
        const seen = tail;
        await seen;
        // One turn of the event loop, for a write started by a `.then()`.
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (seen === tail) return;
      }
    },
  };
}
