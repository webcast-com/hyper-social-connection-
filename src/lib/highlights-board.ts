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
import { highlightsStore, type HighlightsStore } from './highlights-index';

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
