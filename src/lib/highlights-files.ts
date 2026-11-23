/**
 * The stored highlights index kept as JSON files in a folder.
 *
 * This is the same index `highlights-index.ts` keeps in Postgres — every clip
 * this site has read from ESPN, kept permanently — laid out so that it can live
 * in a Git branch and be read over plain HTTP with no database at all. A
 * scheduled job writes the folder (`highlights-files-writer.ts`); the site reads
 * it (`highlights-github.ts`). Both go through the one reader in this file, so
 * a question is answered the same way wherever it is asked.
 *
 * The layout, under one folder:
 *
 *   index.json               totals, the summary, and which months hold clips
 *   months/2026-11.json      per day in that month: how many clips, and how
 *                            many per kind, competition and match state
 *   clips/2026/11/19.json    the clips whose match or publication was that UTC
 *                            day, newest first
 *   clips/undated.json       clips ESPN gave no date for
 *   lookup/n/4820.json       clip id, anchor id, fixture id → the day file it is
 *                            in, split into small files by the number in the id
 *   state/cells.json         the sweeper's cursor: scoreboards walked, and when
 *   state/probes.json        game collections asked, and what they answered
 *
 * Why days: a day file stops changing a couple of days after its matches, so
 * Git stores it once; and a page of the index needs the newest few files, not
 * the whole history. Why the per-day counts: "how many clips match this
 * filter" and "skip the first 600" are answered from the month files without
 * opening a single day that does not have to be shown.
 *
 * Ordering is the table's own: `occurred_at DESC NULLS LAST, id DESC`, with
 * `seq` (assigned once, in the order clips were first stored) standing in for
 * the serial id.
 */
import { ESPN_LEAGUES } from './sports-catalog';
import type { SportsHighlightClip, SportsHighlightStatus } from './espn-highlights';
import type { SportsVideoNewsClip, SportsVideoNewsMedia } from './espn-video-news';
import {
  INDEX_UNAVAILABLE, rowToLeagueClip, rowToMatchClip, storedSeconds, storedUrl,
  type ClipRef, type ClipRow, type EventRef, type HighlightsIndexSummary, type IndexedClipKind,
  type IndexedHighlights, type NewsClipRef, type ResolvedIndexQuery,
} from './highlights-index';

/* ── Shapes ─────────────────────────────────────────────────────────────── */

/** One stored clip as a file holds it: the table's columns, dates as ISO text. */
export type FileRow = Omit<ClipRow, 'occurred_at'> & {
  occurred_at: string | null;
  /** Insertion order, never reused: the tie-break the table's serial id was. */
  seq: number;
  /** When this site first stored the clip. Never changes. */
  discovered_at: string;
  /** The last day ESPN still reported it (YYYY-MM-DD). */
  seen_at: string;
};

/** Clips per `kind|league|status`. A league clip has no state: `league|nba|`. */
export type Cube = Record<string, number>;

export type IndexFile = {
  version: 1;
  updatedAt: string | null;
  nextSeq: number;
  clips: number;
  oldestAt: string | null;
  newestAt: string | null;
  lastSweepAt: string | null;
  sweptCells: number;
  cube: Cube;
  /** Month (`2026-11`, or `undated`) → clips stored in it. */
  months: Record<string, number>;
};

export type MonthFile = { days: Record<string, { n: number; cube: Cube }> };
export type DayFile = { rows: FileRow[] };
/** Key → the day files that hold a row for it. */
export type LookupFile = Record<string, string[]>;

/** Where files come from: a directory, or a URL. `null` means "no such file". */
export type FileSource = { json(path: string): Promise<unknown | null> };

export const UNDATED = 'undated';
const STATUSES: SportsHighlightStatus[] = ['live', 'upcoming', 'final'];

export const emptyIndex = (): IndexFile => ({
  version: 1, updatedAt: null, nextSeq: 1, clips: 0, oldestAt: null, newestAt: null,
  lastSweepAt: null, sweptCells: 0, cube: {}, months: {},
});

/* ── Paths and keys (pure) ──────────────────────────────────────────────── */

/** The UTC day a clip is filed under. */
export const dayOf = (occurredAt: string | null): string => (occurredAt ? occurredAt.slice(0, 10) : UNDATED);
export const monthOf = (day: string): string => (day === UNDATED ? UNDATED : day.slice(0, 7));
export const dayPath = (day: string): string =>
  day === UNDATED ? 'clips/undated.json' : `clips/${day.slice(0, 4)}/${day.slice(5, 7)}/${day.slice(8, 10)}.json`;
export const monthPath = (month: string): string => `months/${month}.json`;
export const INDEX_PATH = 'index.json';
export const CELLS_PATH = 'state/cells.json';
export const PROBES_PATH = 'state/probes.json';

export const cubeKey = (row: { kind: string; league: string; status: string | null }): string =>
  `${row.kind}|${row.league}|${row.status ?? ''}`;

/** FNV-1a, 32 bit. Only spreads keys over files; nothing depends on its strength. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The lookup file a key is written in.
 *
 * ESPN's ids are numbers that grow with time, so a key is filed by its number
 * with the last four digits dropped: clips published around the same time share
 * a file, new clips land in the newest few files, and a file about last
 * season's ids is never rewritten. That keeps a commit small however long the
 * list becomes. A key with no such number is spread by a hash instead.
 */
export function lookupPath(key: string): string {
  const runs = key.match(/\d{5,}/g);
  const digits = runs ? runs[runs.length - 1] : null;
  if (digits) return `lookup/n/${digits.slice(0, -4)}.json`;
  return `lookup/h/${(hash(key) & 0xff).toString(16).padStart(2, '0')}.json`;
}

/** Lookup keys. One namespace letter each, so two kinds of id can never collide. */
export const keyOfRow = (externalKey: string) => `x:${externalKey}`;
export const keyOfClip = (clipId: string) => `c:${clipId.toLowerCase()}`;
export const keyOfAnchor = (anchorKey: string) => `a:${anchorKey}`;
export const keyOfNews = (clipId: string) => `n:${clipId}`;
export const keyOfEvent = (eventId: string) => `e:${eventId}`;

/**
 * The fixture ids a stored event id answers to.
 *
 * A stored id is `espn-{league}-{id}`, or `espn-{league}-{id}-{competition}`
 * when one fixture carries several competitions. A match page asks for the
 * first form and must get both, which SQL did with a prefix match. A hashed
 * lookup cannot match a prefix, so the shorter form is written down as a key
 * of its own — but only when it ends in a provider id, so that `espn-{league}`
 * never becomes a key holding every fixture of a competition.
 */
export function eventKeysOf(eventId: string): string[] {
  const keys = [eventId];
  const cut = eventId.lastIndexOf('-');
  if (cut > 0) {
    const parent = eventId.slice(0, cut);
    if (/-\d{4,}$/.test(parent)) keys.push(parent);
  }
  return keys;
}

/** Every lookup key one row is found under. */
export function lookupKeysOf(row: FileRow): string[] {
  const keys = [keyOfRow(row.external_key)];
  if (row.kind === 'match') {
    keys.push(keyOfClip(row.clip_id));
    if (row.anchor_key) keys.push(keyOfAnchor(row.anchor_key));
    if (row.event_id) for (const id of eventKeysOf(row.event_id)) keys.push(keyOfEvent(id));
  } else {
    keys.push(keyOfNews(row.clip_id));
  }
  return [...new Set(keys)];
}

/** `occurred_at DESC NULLS LAST, id DESC`. */
export function newestFirst(a: FileRow, b: FileRow): number {
  if (a.occurred_at !== b.occurred_at) {
    if (a.occurred_at === null) return 1;
    if (b.occurred_at === null) return -1;
    return a.occurred_at < b.occurred_at ? 1 : -1;
  }
  return b.seq - a.seq;
}

/* ── Reading a file defensively ─────────────────────────────────────────── */

const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0);

function cubeOf(value: unknown): Cube {
  const cube: Cube = {};
  if (value && typeof value === 'object') {
    for (const [key, n] of Object.entries(value as Record<string, unknown>)) {
      if (count(n) > 0) cube[key] = count(n);
    }
  }
  return cube;
}

/** A row from a file, with every column present. `null` when it is not a row. */
export function normalizeRow(value: unknown): FileRow | null {
  const raw = value as Partial<FileRow> | null;
  if (!raw || typeof raw !== 'object') return null;
  const externalKey = str(raw.external_key);
  const clipId = str(raw.clip_id);
  const title = str(raw.title);
  const league = str(raw.league);
  if (!externalKey || !clipId || !title || !league || (raw.kind !== 'match' && raw.kind !== 'league')) return null;
  const occurred = str(raw.occurred_at);
  const mp4 = str(raw.mp4);
  return {
    external_key: externalKey,
    kind: raw.kind,
    clip_id: clipId,
    title,
    description: str(raw.description),
    duration: typeof raw.duration === 'number' ? raw.duration : null,
    thumbnail: str(raw.thumbnail),
    mp4,
    hls: str(raw.hls),
    page: str(raw.page),
    playable: !!mp4,
    event_id: str(raw.event_id),
    event_name: str(raw.event_name),
    sport: str(raw.sport),
    league,
    league_name: str(raw.league_name) ?? league,
    home: str(raw.home),
    away: str(raw.away),
    home_logo: str(raw.home_logo),
    away_logo: str(raw.away_logo),
    teams: str(raw.teams),
    occurred_at: occurred && !Number.isNaN(Date.parse(occurred)) ? new Date(occurred).toISOString() : null,
    source_url: str(raw.source_url),
    status: (STATUSES as string[]).includes(String(raw.status)) ? (raw.status as SportsHighlightStatus) : null,
    anchor_key: str(raw.anchor_key),
    seq: count(raw.seq),
    discovered_at: str(raw.discovered_at) ?? '',
    seen_at: str(raw.seen_at) ?? '',
  };
}

/* ── Filters ────────────────────────────────────────────────────────────── */

export type RowFilter = {
  kind: IndexedClipKind | null;
  league: string | null;
  status: SportsHighlightStatus | null;
  since: Date | null;
};

const NO_FILTER: RowFilter = { kind: null, league: null, status: null, since: null };

/** How many clips in a cube pass the filter's kind, competition and state. */
export function cubeCount(cube: Cube, filter: RowFilter): number {
  let total = 0;
  for (const [key, n] of Object.entries(cube)) {
    const [kind, league, status] = key.split('|');
    if (filter.kind && kind !== filter.kind) continue;
    if (filter.league && league !== filter.league) continue;
    // A league clip has no state, so a state filter leaves it out, as in SQL.
    if (filter.status && status !== filter.status) continue;
    total += n;
  }
  return total;
}

function passes(row: FileRow, filter: RowFilter, sinceIso: string | null): boolean {
  if (filter.kind && row.kind !== filter.kind) return false;
  if (filter.league && row.league !== filter.league) return false;
  if (filter.status && row.status !== filter.status) return false;
  if (sinceIso && (!row.occurred_at || row.occurred_at < sinceIso)) return false;
  return true;
}

/* ── The reader ─────────────────────────────────────────────────────────── */

/** Day files one unbounded-looking question may open. Bounds a read, not the index. */
const MAX_SCAN_DAYS = 400;
/** Day files a pre-warm may open looking for league clips with no rendition. */
const MAX_WARM_SCAN_DAYS = 30;
/** Day files asked for ahead of the one being read, when a read walks several. */
const PREFETCH_DAYS = 8;

export class HighlightsFiles {
  private readonly checked = new WeakSet<object>();

  constructor(private readonly source: FileSource) {}

  async index(): Promise<IndexFile> {
    const raw = (await this.source.json(INDEX_PATH)) as Partial<IndexFile> | null;
    if (!raw || typeof raw !== 'object') return emptyIndex();
    if (this.checked.has(raw)) return raw as IndexFile;
    const months: Record<string, number> = {};
    for (const [month, n] of Object.entries(raw.months ?? {})) if (count(n) > 0) months[month] = count(n);
    // Corrected in place, so the object a writer changes is the one it reads.
    Object.assign(raw, {
      version: 1,
      updatedAt: str(raw.updatedAt),
      nextSeq: Math.max(1, count(raw.nextSeq)),
      clips: count(raw.clips),
      oldestAt: str(raw.oldestAt),
      newestAt: str(raw.newestAt),
      lastSweepAt: str(raw.lastSweepAt),
      sweptCells: count(raw.sweptCells),
      cube: cubeOf(raw.cube),
      months,
    });
    this.checked.add(raw);
    return raw as IndexFile;
  }

  async month(month: string): Promise<MonthFile> {
    const raw = (await this.source.json(monthPath(month))) as Partial<MonthFile> | null;
    if (!raw || typeof raw !== 'object') return { days: {} };
    if (this.checked.has(raw)) return raw as MonthFile;
    const days: MonthFile['days'] = {};
    for (const [day, entry] of Object.entries(raw.days ?? {})) {
      const n = count((entry as { n?: unknown })?.n);
      if (n > 0) days[day] = { n, cube: cubeOf((entry as { cube?: unknown })?.cube) };
    }
    raw.days = days;
    this.checked.add(raw);
    return raw as MonthFile;
  }

  /** The rows of one day file, newest first. A missing file is an empty day. */
  async day(day: string): Promise<FileRow[]> {
    const raw = (await this.source.json(dayPath(day))) as Partial<DayFile> | null;
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.rows)) return [];
    if (!this.checked.has(raw)) {
      raw.rows = raw.rows.map(normalizeRow).filter((row): row is FileRow => !!row).sort(newestFirst);
      this.checked.add(raw);
    }
    return raw.rows;
  }

  async lookup(key: string): Promise<string[]> {
    const raw = (await this.source.json(lookupPath(key))) as LookupFile | null;
    const days = raw && typeof raw === 'object' ? raw[key] : null;
    return Array.isArray(days) ? days.filter((day): day is string => typeof day === 'string') : [];
  }

  /** Rows found under a lookup key, from every day file it names, newest first. */
  private async rowsFor(key: string): Promise<FileRow[]> {
    const days = (await this.lookup(key)).slice(0, 16);
    const found = await Promise.all(days.map((day) => this.day(day)));
    return found.flat().sort(newestFirst);
  }

  async summary(): Promise<HighlightsIndexSummary> {
    const index = await this.index();
    const leagues = new Set<string>();
    for (const key of Object.keys(index.cube)) leagues.add(key.split('|')[1]);
    return {
      ok: true,
      clips: cubeCount(index.cube, NO_FILTER),
      matchClips: cubeCount(index.cube, { ...NO_FILTER, kind: 'match' }),
      leagueClips: cubeCount(index.cube, { ...NO_FILTER, kind: 'league' }),
      competitions: leagues.size,
      oldestAt: index.oldestAt,
      newestAt: index.newestAt,
      lastSweepAt: index.lastSweepAt,
      sweptCells: index.sweptCells,
    };
  }

  /** Months that hold clips, newest first, the undated ones last. */
  private async monthsNewestFirst(includeUndated: boolean): Promise<string[]> {
    const index = await this.index();
    const dated = Object.keys(index.months).filter((month) => month !== UNDATED).sort().reverse();
    return includeUndated && index.months[UNDATED] ? [...dated, UNDATED] : dated;
  }

  /**
   * How many stored clips pass a filter.
   *
   * With no age limit this is the index's own totals. With one, whole days
   * are added up from the month files and only the day the cut-off falls in
   * is opened, because that is the only day a count cannot be read off.
   */
  async count(filter: RowFilter): Promise<number> {
    const index = await this.index();
    if (!filter.since) return cubeCount(index.cube, filter);
    const sinceIso = filter.since.toISOString();
    const sinceDay = sinceIso.slice(0, 10);
    let total = 0;
    for (const month of await this.monthsNewestFirst(false)) {
      if (month < sinceDay.slice(0, 7)) break;
      const manifest = await this.month(month);
      for (const [day, entry] of Object.entries(manifest.days)) {
        if (day > sinceDay) total += cubeCount(entry.cube, filter);
        else if (day === sinceDay && cubeCount(entry.cube, filter) > 0) {
          total += (await this.day(day)).filter((row) => passes(row, filter, sinceIso)).length;
        }
      }
    }
    return total;
  }

  /**
   * Rows passing a filter, newest first, as a page.
   *
   * The month files say how many clips each day holds for the filter, so the
   * days a page needs are known before any is opened: a day with nothing for
   * the filter is never read, neither is a day that lies wholly inside the
   * rows being skipped, and the ones that are needed are asked for together.
   */
  async select(filter: RowFilter, offset: number, limit: number, maxDays: number = MAX_SCAN_DAYS): Promise<FileRow[]> {
    const sinceIso = filter.since ? filter.since.toISOString() : null;
    const sinceDay = sinceIso ? sinceIso.slice(0, 10) : null;

    // 1. Plan: which days, and how many of each day's rows to pass over.
    const plan: { day: string; skip: number }[] = [];
    let skip = Math.max(0, offset);
    let wanted = Math.max(0, limit);
    const months = await this.monthsNewestFirst(!sinceDay);
    for (let at = 0; at < months.length && wanted > 0 && plan.length < maxDays; at += 1) {
      const month = months[at];
      if (sinceDay && month < sinceDay.slice(0, 7)) break;
      // The next month is usually needed too; ask for it while this one is read.
      const next = months[at + 1];
      if (next && !(sinceDay && next < sinceDay.slice(0, 7))) void this.month(next).catch(() => undefined);
      const manifest = await this.month(month);
      const days = Object.keys(manifest.days).filter((day) => !sinceDay || day >= sinceDay).sort().reverse();
      for (const day of days) {
        if (wanted <= 0 || plan.length >= maxDays) break;
        const holds = cubeCount(manifest.days[day].cube, filter);
        if (!holds) continue;
        // The day the cut-off falls in may hold fewer than its count says, so
        // it is always opened; it is also the oldest day there is to open.
        if (day !== sinceDay && skip >= holds) {
          skip -= holds;
          continue;
        }
        plan.push({ day, skip });
        wanted -= holds - skip;
        skip = 0;
      }
    }

    // 2. Read the planned days together, and take the page from them in order.
    const read = await Promise.all(plan.map((entry) => this.day(entry.day)));
    const out: FileRow[] = [];
    for (let at = 0; at < plan.length && out.length < limit; at += 1) {
      const rows = read[at].filter((row) => passes(row, filter, sinceIso));
      for (const row of rows.slice(plan[at].skip)) {
        out.push(row);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  /** The index page's read: one page, what is left, and the unfiltered totals. */
  async read(query: ResolvedIndexQuery): Promise<IndexedHighlights> {
    const filter: RowFilter = { kind: query.kind, league: query.league, status: query.status, since: query.since };
    const [rows, total, summary, index] = await Promise.all([
      this.select(filter, query.offset, query.limit),
      this.count(filter),
      this.summary(),
      this.index(),
    ]);

    const match: SportsHighlightClip[] = [];
    const league: SportsVideoNewsClip[] = [];
    for (const row of rows) {
      const matchClip = rowToMatchClip(row);
      if (matchClip) { match.push(matchClip); continue; }
      const leagueClip = rowToLeagueClip(row);
      if (leagueClip) league.push(leagueClip);
    }

    const perLeague = new Map<string, number>();
    const perStatus = new Map<string, number>();
    for (const [key, n] of Object.entries(index.cube)) {
      const [kind, slug, status] = key.split('|');
      perLeague.set(slug, (perLeague.get(slug) ?? 0) + n);
      if (kind === 'match' && status) perStatus.set(status, (perStatus.get(status) ?? 0) + n);
    }
    const byLeague = [...perLeague]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .map(([slug, n]) => ({ league: slug, leagueName: ESPN_LEAGUES.find((entry) => entry.slug === slug)?.name ?? slug, total: n }));
    const byStatus = [...perStatus]
      .filter(([status]) => (STATUSES as string[]).includes(status))
      .map(([status, n]) => ({ status: status as SportsHighlightStatus, total: n }));

    return {
      ok: true,
      store: 'repository',
      match,
      league,
      sourceUrl: rows[0]?.source_url ?? null,
      remaining: Math.max(0, total - query.offset - rows.length),
      byLeague,
      byStatus,
      summary,
    };
  }

  /** Stored match clips since a moment, newest first, and how many were left out. */
  async feed(since: Date | null, limit: number): Promise<{ clips: SportsHighlightClip[]; remaining: number; sourceUrl: string | null }> {
    const filter: RowFilter = { ...NO_FILTER, kind: 'match', since };
    const [rows, total] = await Promise.all([this.select(filter, 0, limit), this.count(filter)]);
    const clips: SportsHighlightClip[] = [];
    for (const row of rows) {
      const clip = rowToMatchClip(row);
      if (clip) clips.push(clip);
    }
    return { clips, remaining: Math.max(0, total - rows.length), sourceUrl: rows[0]?.source_url ?? null };
  }

  /** One stored match clip by the id its page is keyed on, whatever its case. */
  async matchClip(clipId: string): Promise<SportsHighlightClip | null> {
    const wanted = clipId.toLowerCase();
    const row = (await this.rowsFor(keyOfClip(clipId))).find((entry) => entry.kind === 'match' && entry.clip_id.toLowerCase() === wanted);
    return row ? rowToMatchClip(row) : null;
  }

  async matchClipByAnchor(anchorKey: string): Promise<SportsHighlightClip | null> {
    const row = (await this.rowsFor(keyOfAnchor(anchorKey))).find((entry) => entry.kind === 'match' && entry.anchor_key === anchorKey);
    return row ? rowToMatchClip(row) : null;
  }

  /** A fixture's clips: its own id, or that id followed by a competition. */
  async eventClips(eventId: string, limit: number): Promise<SportsHighlightClip[]> {
    const rows = (await this.rowsFor(keyOfEvent(eventId)))
      .filter((row) => row.kind === 'match' && !!row.event_id && (row.event_id === eventId || row.event_id.startsWith(`${eventId}-`)));
    const clips: SportsHighlightClip[] = [];
    for (const row of rows.slice(0, limit)) {
      const clip = rowToMatchClip(row);
      if (clip) clips.push(clip);
    }
    return clips;
  }

  async clipRefs(limit: number): Promise<ClipRef[]> {
    const rows = await this.select({ ...NO_FILTER, kind: 'match' }, 0, limit);
    const refs: ClipRef[] = [];
    for (const row of rows) {
      const id = row.clip_id.trim();
      if (id) refs.push({ id, title: row.title?.trim() || null, at: row.occurred_at ? new Date(row.occurred_at) : null });
    }
    return refs;
  }

  /**
   * The fixtures with stored clips, newest first, and how many clips each has.
   *
   * Read a day at a time, newest first, and stopped at the end of the day that
   * filled the list. A fixture's clips normally share its kick-off time and so
   * its day file; when they do not (ESPN moved the fixture between two reads),
   * the lookup names the other days, and those are counted too.
   */
  async eventRefs(limit: number): Promise<EventRef[]> {
    const groups = new Map<string, EventRef>();
    const scanned = new Set<string>();
    // The newest row of each fixture that names it: the fixture's name is taken
    // from that row, which is the row the table's own ordering would put first.
    const named = new Map<EventRef, FileRow>();
    const name = (group: EventRef, row: FileRow) => {
      if (!row.event_name?.trim()) return;
      const held = named.get(group);
      if (held && newestFirst(held, row) <= 0) return;
      named.set(group, row);
      group.name = row.event_name.trim();
    };
    const add = (row: FileRow) => {
      if (row.kind !== 'match' || !row.event_id || !row.league) return;
      const key = `${row.event_id}\u0000${row.league}`;
      let group = groups.get(key);
      const at = row.occurred_at ? new Date(row.occurred_at) : null;
      if (!group) groups.set(key, group = { eventId: row.event_id, league: row.league, name: null, at, clips: 1 });
      else {
        group.clips += 1;
        if (at && (!group.at || at > group.at)) group.at = at;
      }
      name(group, row);
    };

    outer: for (const month of await this.monthsNewestFirst(true)) {
      const manifest = await this.month(month);
      const days = Object.keys(manifest.days)
        .filter((day) => cubeCount(manifest.days[day].cube, { ...NO_FILTER, kind: 'match' }) > 0)
        .sort()
        .reverse();
      for (let at = 0; at < days.length; at += 1) {
        if (groups.size >= limit || scanned.size >= MAX_SCAN_DAYS) break outer;
        // Ask for the next few days while this one is read.
        if (at % PREFETCH_DAYS === 0) for (const day of days.slice(at, at + PREFETCH_DAYS)) void this.day(day).catch(() => undefined);
        scanned.add(days[at]);
        for (const row of await this.day(days[at])) add(row);
      }
    }

    const top = [...groups.values()]
      .sort((a, b) => {
        const left = a.at ? a.at.getTime() : -Infinity;
        const right = b.at ? b.at.getTime() : -Infinity;
        if (left !== right) return right - left;
        return a.eventId < b.eventId ? 1 : a.eventId > b.eventId ? -1 : 0;
      })
      .slice(0, limit);

    // Clips of a listed fixture that are filed under a day not read above.
    for (const group of top) {
      for (const day of await this.lookup(keyOfEvent(group.eventId))) {
        if (scanned.has(day)) continue;
        for (const row of await this.day(day)) {
          if (row.kind === 'match' && row.event_id === group.eventId && row.league === group.league) {
            group.clips += 1;
            name(group, row);
          }
        }
      }
    }
    return top;
  }

  /** The stored rendition for one league video, or null when it has none. */
  async newsMedia(clipId: string): Promise<SportsVideoNewsMedia | null> {
    const row = (await this.rowsFor(keyOfNews(clipId)))
      .filter((entry) => entry.kind === 'league' && entry.clip_id === clipId)
      .sort((a, b) => b.seq - a.seq)[0];
    const mp4 = storedUrl(row?.mp4 ?? null);
    const hls = storedUrl(row?.hls ?? null);
    if (!mp4 && !hls) return null;
    return {
      mp4,
      hls,
      page: storedUrl(row?.page ?? null),
      thumbnail: storedUrl(row?.thumbnail ?? null),
      duration: storedSeconds(row?.duration ?? null),
    };
  }

  /** Stored league clips with no rendition yet, newest first. */
  async newsNeedingMedia(limit: number): Promise<NewsClipRef[]> {
    // Asked for in pages, so that a run of clips that already have a rendition
    // does not hide the ones behind it; bounded by the day files it may open.
    const refs: NewsClipRef[] = [];
    const rows = await this.select({ ...NO_FILTER, kind: 'league' }, 0, 2_000, MAX_WARM_SCAN_DAYS);
    for (const row of rows) {
      if (row.mp4 || row.hls) continue;
      refs.push({ clipId: row.clip_id, externalKey: row.external_key });
      if (refs.length >= limit) break;
    }
    return refs;
  }
}

export const UNAVAILABLE_FILES: HighlightsIndexSummary = { ...INDEX_UNAVAILABLE, reason: 'query-failed' };
