/**
 * The stored highlights index, read from the folder a scheduled job keeps in
 * this repository's `highlights-data` branch.
 *
 * This is the site's half: it only reads. Each function answers what its
 * namesake in `highlights-index.ts` answers from Postgres — the same shapes,
 * the same clamps on what a caller may ask, the same order — from JSON files
 * fetched over HTTP. A public repository needs no token for that.
 *
 * Files are kept in memory for a short while so a page is not a string of
 * requests: two minutes for anything that may still change, an hour for the
 * day file of a week that is over. When GitHub cannot be reached, the last
 * copy this process holds is served instead, so an outage there costs the page
 * freshness and not its clips. A file that does not exist is an answer ("no
 * clips that day"), not a failure.
 *
 * Nothing here throws. A folder that cannot be read at all resolves to the
 * same "index unavailable" answer a database that is down would give, with the
 * reason `query-failed`, and callers fall back to the live feed.
 */
import {
  EVENT_CLIPS_LIMIT, FEED_INDEX_LIMIT, INDEX_EMPTY, MAX_CLIP_REFS, MAX_EVENT_REFS, MAX_INDEX_DAYS,
  resolveIndexQuery, storedText,
  type ClipRefsRead, type EventClipsRead, type EventRefsRead, type FeedClipsRead, type HighlightsIndexQuery,
  type HighlightsIndexSummary, type IndexedHighlights, type StoredClipRead,
} from './highlights-index';
import { HighlightsFiles, UNAVAILABLE_FILES, type FileSource } from './highlights-files';
import { highlightsDataUrl } from './highlights-source';
import type { SportsHighlightClip } from './espn-highlights';
import type { SportsVideoNewsMedia } from './espn-video-news';

/** A file that may still change is asked for again after this long. */
const FRESH_MS = 2 * 60_000;
/** A day file older than the sweeper's window rarely changes again. */
const SETTLED_MS = 60 * 60_000;
/** The sweeper looks a week back; a day inside that is still being filled. */
const SETTLED_AFTER_DAYS = 9;
const REQUEST_TIMEOUT_MS = 5_000;
/** Files held at once, and the most text they may add up to. */
const MAX_CACHED_FILES = 160;
const MAX_CACHED_CHARS = 32_000_000;

type Entry = { at: number; value: unknown | null; size: number; pending?: Promise<unknown | null> };

const ttlFor = (path: string, now: number): number => {
  const day = /^clips\/(\d{4})\/(\d{2})\/(\d{2})\.json$/.exec(path);
  if (!day) return FRESH_MS;
  const age = now - Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
  return age > SETTLED_AFTER_DAYS * 86_400_000 ? SETTLED_MS : FRESH_MS;
};

/** JSON files under a base URL, cached, with the last good copy kept for a bad day. */
export function httpFileSource(base: string, fetcher: typeof fetch = fetch): FileSource & { clear(): void } {
  const cache = new Map<string, Entry>();

  const load = async (path: string): Promise<{ value: unknown | null; size: number }> => {
    const response = await fetcher(`${base}/${path}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 404) return { value: null, size: 0 };
    if (!response.ok) throw new Error(`highlights data HTTP ${response.status} for ${path}`);
    const body = await response.text();
    return { value: JSON.parse(body) as unknown, size: body.length };
  };

  /** Oldest out first (a Map keeps insertion order), never one still loading. */
  const trim = () => {
    let chars = 0;
    for (const entry of cache.values()) chars += entry.size;
    for (const [path, entry] of cache) {
      if (cache.size <= MAX_CACHED_FILES && chars <= MAX_CACHED_CHARS) break;
      if (entry.pending) continue;
      cache.delete(path);
      chars -= entry.size;
    }
  };

  return {
    clear: () => cache.clear(),
    json(path) {
      const now = Date.now();
      const held = cache.get(path);
      if (held && !held.pending && now - held.at < ttlFor(path, now)) return Promise.resolve(held.value);
      if (held?.pending) return held.pending;

      const pending = load(path).then(
        ({ value, size }) => {
          cache.delete(path);
          cache.set(path, { at: Date.now(), value, size });
          trim();
          return value;
        },
        (error: unknown) => {
          // The last copy is better than none; it is offered again, and asked
          // for again the next time someone wants it.
          if (held) {
            cache.set(path, { at: held.at, value: held.value, size: held.size });
            return held.value;
          }
          cache.delete(path);
          throw error;
        },
      );
      cache.set(path, { at: held?.at ?? 0, value: held?.value ?? null, size: held?.size ?? 0, pending });
      return pending;
    },
  };
}

let reader: { base: string; files: HighlightsFiles; source: ReturnType<typeof httpFileSource> } | null = null;

function open(): HighlightsFiles | null {
  const base = highlightsDataUrl();
  if (!base) return null;
  if (!reader || reader.base !== base) {
    const source = httpFileSource(base);
    reader = { base, files: new HighlightsFiles(source), source };
  }
  return reader.files;
}

/** Test seam: forget every file held in memory. */
export function resetHighlightsFiles(): void {
  reader?.source.clear();
  reader = null;
}

const failed = (error: unknown): 'query-failed' => {
  console.warn('[highlights-github] read failed:', (error as Error)?.message);
  return 'query-failed';
};

export async function summary(): Promise<HighlightsIndexSummary> {
  try {
    const files = open();
    return files ? await files.summary() : UNAVAILABLE_FILES;
  } catch (error) {
    failed(error);
    return UNAVAILABLE_FILES;
  }
}

export async function read(query: HighlightsIndexQuery): Promise<IndexedHighlights> {
  const unavailable: IndexedHighlights = { ...INDEX_EMPTY, reason: 'query-failed', summary: UNAVAILABLE_FILES, store: 'repository' };
  try {
    const files = open();
    return files ? await files.read(resolveIndexQuery(query)) : unavailable;
  } catch (error) {
    failed(error);
    return unavailable;
  }
}

export async function readFeedClips(days: number, limit: number = FEED_INDEX_LIMIT): Promise<FeedClipsRead> {
  const empty: FeedClipsRead = { ok: false, reason: 'query-failed', clips: [], remaining: 0, sourceUrl: null };
  const asked = Number.isFinite(days) ? Math.trunc(days) : 0;
  const boundedDays = asked > 0 ? Math.min(MAX_INDEX_DAYS, asked) : null;
  const since = boundedDays ? new Date(Date.now() - boundedDays * 86_400_000) : null;
  const bounded = Number.isFinite(limit) ? Math.trunc(limit) : FEED_INDEX_LIMIT;
  const wanted = Math.max(1, Math.min(FEED_INDEX_LIMIT, bounded));
  try {
    const files = open();
    return files ? { ok: true, ...(await files.feed(since, wanted)) } : empty;
  } catch (error) {
    failed(error);
    return empty;
  }
}

export async function readStoredClip(clipId: string): Promise<StoredClipRead> {
  const empty: StoredClipRead = { ok: false, reason: 'query-failed', clip: null };
  const wanted = String(clipId ?? '').trim();
  if (!wanted) return { ...empty, reason: 'no-database' };
  try {
    const files = open();
    return files ? { ok: true, clip: await files.matchClip(wanted) } : empty;
  } catch (error) {
    failed(error);
    return empty;
  }
}

export async function readEventClips(eventId: string, limit: number = EVENT_CLIPS_LIMIT): Promise<EventClipsRead> {
  const empty: EventClipsRead = { ok: false, reason: 'query-failed', clips: [] };
  const wanted = String(eventId ?? '').trim();
  if (!wanted) return { ...empty, reason: 'no-database' };
  const asked = Number.isFinite(limit) ? Math.trunc(limit) : EVENT_CLIPS_LIMIT;
  const bounded = Math.max(1, Math.min(FEED_INDEX_LIMIT, asked || EVENT_CLIPS_LIMIT));
  try {
    const files = open();
    return files ? { ok: true, clips: await files.eventClips(wanted, bounded) } : empty;
  } catch (error) {
    failed(error);
    return empty;
  }
}

export async function readRecentEventRefs(limit: number = MAX_EVENT_REFS): Promise<EventRefsRead> {
  const empty: EventRefsRead = { ok: false, reason: 'query-failed', refs: [] };
  const asked = Number.isFinite(limit) ? Math.trunc(limit) : MAX_EVENT_REFS;
  const bounded = Math.max(1, Math.min(MAX_EVENT_REFS, asked || MAX_EVENT_REFS));
  try {
    const files = open();
    return files ? { ok: true, refs: await files.eventRefs(bounded) } : empty;
  } catch (error) {
    failed(error);
    return empty;
  }
}

export async function readRecentClipRefs(limit: number = MAX_CLIP_REFS): Promise<ClipRefsRead> {
  const empty: ClipRefsRead = { ok: false, reason: 'query-failed', refs: [] };
  const asked = Number.isFinite(limit) ? Math.trunc(limit) : MAX_CLIP_REFS;
  const bounded = Math.max(1, Math.min(MAX_CLIP_REFS, asked || MAX_CLIP_REFS));
  try {
    const files = open();
    return files ? { ok: true, refs: await files.clipRefs(bounded) } : empty;
  } catch (error) {
    failed(error);
    return empty;
  }
}

export async function findStoredHighlightClip(anchorKey: string): Promise<SportsHighlightClip | null> {
  const key = storedText(anchorKey, 200);
  if (!key) return null;
  try {
    return (await open()?.matchClipByAnchor(key)) ?? null;
  } catch (error) {
    failed(error);
    return null;
  }
}

export async function findStoredNewsMedia(clipId: string): Promise<SportsVideoNewsMedia | null> {
  const id = storedText(clipId, 64);
  if (!id) return null;
  try {
    return (await open()?.newsMedia(id)) ?? null;
  } catch (error) {
    failed(error);
    return null;
  }
}
