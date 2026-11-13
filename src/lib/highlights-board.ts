/**
 * The highlights board the homepage renders.
 *
 * Until the stored index existed, every homepage load asked the live feed, which
 * fans out to a bounded set of ESPN video collections — one per fixture — and can
 * spend seconds doing it. This reads the stored clips first: a Postgres query with
 * no ESPN request at all, filled by the sweeper, holding every clip the site has
 * ever read. When storage has enough clips to make a card worth reading, that is
 * the board, and the homepage asks ESPN for nothing.
 *
 * Otherwise the live board is what it has always been, and any stored clips are
 * appended to fill it out. Storage that is missing, slow or empty degrades to the
 * previous behaviour exactly: the same cached feed, the same sample-board fallback,
 * the same byte-identical cards.
 *
 * Two rules this module will not break:
 *
 * - Nothing here invents a clip. A stored board is built from stored rows, so its
 *   `games` count is the distinct fixtures those rows name and its `source.url` is
 *   the endpoint that produced the newest one.
 * - A stored board reports `status: 'live'`, because that is what it is: real
 *   clips, playable, engageable. The feed only dresses cards as samples when the
 *   board is neither live nor partial, and a sample card gets no anchor post — so
 *   a board of stored clips that reported anything else would show real videos as
 *   placeholder data and make them un-likeable.
 */
import type { SportsHighlightClip } from './espn-highlights';
import { getSportsHighlights, type SportsHighlightsBoard } from './espn-highlights-feed';
import { FEED_INDEX_LIMIT, highlightsStore, readFeedClips, type FeedClipsRead, type HighlightsStore } from './highlights-index';

/** The ESPN root, when no stored endpoint is known. Same fallback the feeds use. */
const ESPN_ROOT = 'https://site.api.espn.com/apis/site/v2/sports';

/**
 * How far back the homepage looks. The live board's own window is seven days, so
 * stored and live clips are the same age and the card needs no different copy.
 */
export const STORED_BOARD_DAYS = 7;
/** Clips on one board. Matches the live feed's cap so the card looks the same. */
export const STORED_BOARD_CLIPS = 12;
/**
 * Below this many stored clips the live board is still the better answer: a
 * handful of rows from one competition would replace twelve clips from several,
 * and the reader would see a thinner card for no benefit.
 */
export const MIN_STORED_CLIPS = 4;
/**
 * How long the render waits for storage. A couple of indexed queries, so this is
 * a ceiling for a cold pooled connection rather than an expected cost.
 */
export const BOARD_BUDGET_MS = 900;

type StoredBoardClips = { clips: SportsHighlightClip[]; sourceUrl: string | null };

/**
 * The board built from stored rows.
 *
 * `httpStatus` is `null` because this render received no HTTP response: the clips
 * were read from Postgres. The diagnostics on `/sports/highlights` render that as
 * "no HTTP response", which is the truth here rather than a borrowed 200.
 */
export function storedHighlightsBoard(
  clips: SportsHighlightClip[],
  sourceUrl: string | null,
): SportsHighlightsBoard {
  return {
    clips,
    status: 'live',
    games: new Set(clips.map((clip) => clip.eventId).filter(Boolean)).size,
    source: {
      ok: true,
      url: sourceUrl || clips[0]?.page || ESPN_ROOT,
      httpStatus: null,
    },
    provenance: 'stored',
  };
}

/**
 * Stored clips the live board is missing, appended until the board is full.
 *
 * The live board's own clips always come first, in its own order, so a topped-up
 * board reads exactly like the old one plus a few extra cards. Deduplicated by the
 * clip's id: the same clip can be on the live board and in the index, and showing
 * it twice would be a card the reader has to scroll past.
 */
export function topUpBoardClips(
  live: SportsHighlightClip[],
  stored: SportsHighlightClip[],
  limit = STORED_BOARD_CLIPS,
): SportsHighlightClip[] {
  if (live.length >= limit || !stored.length) return live;
  const seen = new Set(live.map((clip) => clip.id));
  return [...live, ...stored.filter((clip) => !seen.has(clip.id))].slice(0, limit);
}

/**
 * The stored clips for one board, or `null` when storage cannot answer in time.
 *
 * On timeout this resolves `null` and the query is left running rather than
 * cancelled — there is nothing to abort and the read costs no ESPN request. A
 * store that throws resolves `null` too: the homepage must not fail because the
 * index did.
 */
async function readStoredClips(store: HighlightsStore, budgetMs: number): Promise<StoredBoardClips | null> {
  if (!store.available()) return null;
  const job = store
    .read({ kind: 'match', days: STORED_BOARD_DAYS, limit: STORED_BOARD_CLIPS })
    .then((read) => (read.ok ? { clips: read.match, sourceUrl: read.sourceUrl ?? null } : null))
    .catch(() => null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<StoredBoardClips | null>((resolve) => {
    timer = setTimeout(() => resolve(null), budgetMs);
  });
  try {
    return await Promise.race([job, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The highlights board for a render.
 *
 * Storage first, then the live feed, and never both when storage has enough: a
 * stored board costs zero ESPN requests. `provenance` says which one filled the
 * board, for diagnostics and for tests — the cards themselves are identical, so
 * nothing downstream has to care.
 */
export async function getHighlightsBoardForRender(options: {
  budgetMs?: number;
  store?: HighlightsStore;
} = {}): Promise<SportsHighlightsBoard> {
  const store = options.store ?? highlightsStore;
  const budgetMs = options.budgetMs ?? BOARD_BUDGET_MS;
  const stored = await readStoredClips(store, budgetMs);

  if (stored && stored.clips.length >= MIN_STORED_CLIPS) {
    return storedHighlightsBoard(stored.clips.slice(0, STORED_BOARD_CLIPS), stored.sourceUrl);
  }

  const live = await getSportsHighlights();
  const clips = stored?.clips.length ? topUpBoardClips(live.clips, stored.clips) : live.clips;
  // The live board is already the shape every consumer expects, so it is passed
  // through untouched apart from the provenance stamp and any top-up.
  return clips === live.clips ? { ...live, provenance: 'live' } : { ...live, clips, provenance: 'live' };
}

/* ── The For You feed's highlights ──────────────────────────────────────── */

/**
 * How long the feed waits for its clip read.
 *
 * Two indexed queries, so this is a ceiling for a cold pooled connection rather
 * than an expected cost — and it is deliberately a little above the board's own
 * budget, because the feed's read happens after the board's and must not be the
 * reason the page is slow. On timeout the feed shows the board's clips, which is
 * what it showed before this existed.
 */
export const FEED_BUDGET_MS = 1_200;

/** The index's own tiebreak: `"id" DESC`, newest row first. */
const byIdDesc = (a: string, b: string) => (a === b ? 0 : a < b ? 1 : -1);

/**
 * Newest to oldest, the way the index orders stored rows.
 *
 * `startAt` is a match clip's own time — the column the index sorts on is written
 * from it — so sorting on it here and `ORDER BY "occurred_at" DESC` in SQL are the
 * same rule, and a feed assembled from a stored read, from a live board, or from
 * both reads the same way. A clip with no time reported goes last, as `NULLS LAST`
 * does, rather than jumping to the front of the feed.
 */
export function orderHighlightClips(clips: readonly SportsHighlightClip[]): SportsHighlightClip[] {
  return [...clips].sort((a, b) => {
    const left = a.startAt ? Date.parse(a.startAt) : Number.NaN;
    const right = b.startAt ? Date.parse(b.startAt) : Number.NaN;
    const leftMissing = !Number.isFinite(left);
    const rightMissing = !Number.isFinite(right);
    if (leftMissing && rightMissing) return byIdDesc(a.id, b.id);
    if (leftMissing) return 1;
    if (rightMissing) return -1;
    return left === right ? byIdDesc(a.id, b.id) : right - left;
  });
}

/**
 * The clips the For You feed carries: every stored clip in the window plus any
 * real clip on the board the sweep has not stored yet, deduplicated, newest first.
 *
 * A board ESPN did not answer contributes nothing. Its clips are the bundled
 * samples, and the highlights surface dresses those in a heading that says so —
 * a card in the middle of the For You feed has no such heading, so a sample clip
 * there would look like a real highlight nobody can play. No clips is the honest
 * answer when there are none.
 */
export function feedHighlightClips(
  stored: readonly SportsHighlightClip[],
  board: SportsHighlightsBoard | null | undefined,
): SportsHighlightClip[] {
  const real = board && (board.status === 'live' || board.status === 'partial') ? board.clips : [];
  const seen = new Set<string>();
  const merged: SportsHighlightClip[] = [];
  for (const clip of [...stored, ...real]) {
    if (!clip?.id || seen.has(clip.id)) continue;
    seen.add(clip.id);
    merged.push(clip);
  }
  return orderHighlightClips(merged);
}

export type FeedHighlights = {
  /** Every clip the feed carries, newest first. */
  clips: SportsHighlightClip[];
  /** Clips in the window the read did not carry, so a ceiling is never silent. */
  remaining: number;
  /** Which read filled the list, for diagnostics and tests. */
  provenance: 'stored' | 'board' | 'none';
};

/**
 * The highlights for one render of the For You feed.
 *
 * Storage first, exactly like the board: a Postgres read with no ESPN request.
 * The read is the lean one — rows and a count, not the index page's summaries —
 * because the feed renders every clip it is given and cannot spend five queries
 * doing it. Storage that is missing, slow or broken degrades to the board the
 * page already fetched, so the feed is never the reason the homepage fails or
 * waits.
 *
 * There is no cap on what the feed is willing to show. `FEED_INDEX_LIMIT` bounds
 * one query and one payload; the seven-day window bounds what a reader sees, and
 * `remaining` says when the ceiling, not the window, was what stopped the read.
 */
export async function getHighlightClipsForFeed(options: {
  board?: SportsHighlightsBoard | null;
  budgetMs?: number;
  days?: number;
  limit?: number;
  read?: (days: number, limit: number) => Promise<FeedClipsRead>;
} = {}): Promise<FeedHighlights> {
  const board = options.board ?? null;
  const budgetMs = options.budgetMs ?? FEED_BUDGET_MS;
  const days = options.days ?? STORED_BOARD_DAYS;
  const limit = options.limit ?? FEED_INDEX_LIMIT;
  const read = options.read ?? ((readDays: number, readLimit: number) => readFeedClips(readDays, readLimit));

  let stored: FeedClipsRead | null = null;
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), budgetMs);
    });
    // On timeout the query is left running rather than cancelled: there is
    // nothing to abort, and the read costs no ESPN request.
    stored = await Promise.race([read(days, limit).catch(() => null), timeout]);
    if (timer) clearTimeout(timer);
  } catch {
    stored = null;
  }

  if (stored?.ok) {
    return {
      clips: feedHighlightClips(stored.clips, board),
      remaining: stored.remaining,
      provenance: 'stored',
    };
  }
  const clips = feedHighlightClips([], board);
  return { clips, remaining: 0, provenance: clips.length ? 'board' : 'none' };
}
