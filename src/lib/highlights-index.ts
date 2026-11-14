/**
 * The stored highlights index: every clip this site has read from ESPN, kept in
 * Postgres.
 *
 * Why this table exists. ESPN has no bulk highlights endpoint and no date range:
 * a game's clips live on that game's own video collection (`…/videos?event={id}`)
 * and a scoreboard takes one date per request. Reading "everything" therefore
 * costs one request per competition per day *plus* one per game — for the
 * 121-competition catalog across a week that is thousands of calls, which cannot
 * happen on a page render without holding the render hostage and without risking
 * a throttle that would break every other ESPN surface on the site. The
 * in-memory caches in `espn-highlights-feed` cannot help either: they are per
 * process and are wiped by every deploy, so nothing in them can be kept for days.
 *
 * So the reads move out of the request path. A bounded sweeper
 * (`highlights-sweep.ts`) walks the catalog a slice at a time and writes what it
 * finds here; a page then reads this table with **no ESPN fan-out at all**.
 * Retention is permanent — nothing here deletes a clip — because the point is
 * that Tuesday's clip is still on the page on Friday. Growth is bounded instead
 * by what ESPN actually publishes: one row per distinct clip, and a probe row per
 * game asked, so the same collection is never read twice.
 *
 * Two kinds of clip are stored and stay distinguishable forever:
 *   `match`  — a per-game video collection. Has a fixture, a score state and a
 *              match page; rendered by the highlights card.
 *   `league` — ESPN's league video news. Has **no** fixture, and nothing here
 *              invents one. It is the only clip source for competitions whose
 *              per-game collections are always empty (the Premier League and the
 *              NFL answer them with an empty list), which is why it is stored at
 *              all; it is rendered by the video-news card.
 *
 * Every function here is inert without a database. `hasDatabase` false, or any
 * query failure, resolves to an "index unavailable" answer with a reason rather
 * than throwing, and callers fall back to the live feed exactly as they did
 * before this table existed.
 */
import { hasDatabase, prisma } from '@/lib/prisma';
import { ensureMigrated } from '@/lib/migrate';
import { ESPN_LEAGUES } from './sports-catalog';
import { entityIdFrom } from './espn-team';
import { highlightAnchorId } from './sports-anchor';
import type { SportsHighlightClip, SportsHighlightStatus } from './espn-highlights';
import type { SportsVideoNewsClip, SportsVideoNewsMedia } from './espn-video-news';

export type IndexedClipKind = 'match' | 'league';

/** What the index holds, in one line, for a page to describe itself honestly. */
export type HighlightsIndexSummary = {
  ok: boolean;
  /** Why it is not ok: no database configured, or a query that failed. */
  reason?: 'no-database' | 'query-failed';
  clips: number;
  matchClips: number;
  leagueClips: number;
  /** Distinct competitions with at least one stored clip. */
  competitions: number;
  oldestAt: string | null;
  newestAt: string | null;
  /** When the sweeper last completed a pass, and how many cells it has walked. */
  lastSweepAt: string | null;
  sweptCells: number;
};

export type HighlightsIndexQuery = {
  kind?: IndexedClipKind | null;
  /** A catalog slug; anything else is ignored by the caller, not by SQL. */
  league?: string | null;
  /** Match state. A league clip has none, so this filter excludes them. */
  status?: SportsHighlightStatus | null;
  /** Only clips whose match or publication is this recent. */
  days?: number | null;
  limit?: number | null;
  offset?: number | null;
};

/** How many clips are stored for one competition, whatever the current filters. */
export type IndexCompetitionCount = { league: string; leagueName: string; total: number };
/** How many stored match clips are in one match state. A league clip has none. */
export type IndexStatusCount = { status: SportsHighlightStatus; total: number };

export type IndexedHighlights = {
  ok: boolean;
  reason?: 'no-database' | 'query-failed';
  match: SportsHighlightClip[];
  league: SportsVideoNewsClip[];
  /**
   * The endpoint that produced the newest row on this page, so a board assembled
   * from stored clips can name where they came from instead of borrowing a URL
   * this read never asked. `null` when nothing matched, or the row stored none.
   */
  sourceUrl?: string | null;
  /** Rows matching the same filters after this page, for a Load more button. */
  remaining: number;
  /**
   * Unfiltered totals, so a filter chip can carry a count that means something:
   * how many clips are stored for that competition or in that match state, not
   * how many happen to be on the page in front of the reader.
   */
  byLeague: IndexCompetitionCount[];
  byStatus: IndexStatusCount[];
  summary: HighlightsIndexSummary;
};

/* ── Bounds ─────────────────────────────────────────────────────────────── */

/** Clips per page. Bounded so one read is one small query, never the table. */
export const DEFAULT_INDEX_LIMIT = 24;
export const MAX_INDEX_LIMIT = 60;
/** How far back `?days=` may reach. Permanent storage, bounded querying. */
export const MAX_INDEX_DAYS = 365;
/**
 * Clips one feed read carries.
 *
 * A page of the index is 60 rows because a page is what a reader scrolls; the
 * feed asks for every stored clip in its window, so it has its own ceiling. This
 * bounds one query and one payload, not what the feed is willing to show — the
 * window does that — and `remaining` reports when the ceiling was the thing that
 * stopped the read rather than the window.
 */
export const FEED_INDEX_LIMIT = 300;
/** Rows in one INSERT. Pooled Postgres prefers a few fat statements to many. */
const MAX_INSERT_ROWS = 100;
/** A row that cannot be rendered is dropped rather than shown broken. */
const MAX_TEXT = 500;
const MAX_URL = 2048;
const STATUSES: SportsHighlightStatus[] = ['live', 'upcoming', 'final'];

export const INDEX_UNAVAILABLE: HighlightsIndexSummary = {
  ok: false, reason: 'no-database', clips: 0, matchClips: 0, leagueClips: 0,
  competitions: 0, oldestAt: null, newestAt: null, lastSweepAt: null, sweptCells: 0,
};

export const INDEX_EMPTY: IndexedHighlights = {
  ok: false, reason: 'no-database', match: [], league: [], remaining: 0, sourceUrl: null,
  byLeague: [], byStatus: [], summary: INDEX_UNAVAILABLE,
};

/* ── Keys (pure: the identity of a row, decided before any query) ───────── */

/**
 * The unique key of a stored clip.
 *
 * A match clip's id is ESPN's own video id, or — when ESPN reports none — the
 * fixture id plus the title, which `normalizeHighlights` already derived. A
 * league clip's id is namespaced by its competition. Either way the key is
 * stable across sweeps, so re-reading a collection updates a row instead of
 * duplicating it.
 */
export function clipKey(kind: IndexedClipKind, clip: { id: string } | null): string | null {
  const id = typeof clip?.id === 'string' ? clip.id.trim() : '';
  if (!id || id.length > MAX_TEXT) return null;
  return `${kind}:${id}`;
}

/**
 * The key of one game's video collection.
 *
 * Gated on the provider's numeric event id, because that is what the collection
 * URL is built from: a fixture without one (a sample, or a scoreboard that
 * reported no id) can never be asked and is never recorded as asked.
 */
export function probeKey(event: { league?: string | null; sourceId?: string | null } | null): string | null {
  const league = typeof event?.league === 'string' ? event.league.trim() : '';
  const sourceId = typeof event?.sourceId === 'string' ? event.sourceId.trim() : '';
  if (!league || !/^\d{1,20}$/.test(sourceId)) return null;
  return `probe:${league}:${sourceId}`;
}

/** One competition on one UTC day: the unit the sweeper walks and remembers. */
export function sweepCellKey(leagueSlug: string, date: string): string {
  return `sweep:${leagueSlug}:${date}`;
}

/* ── Query clamping (pure) ──────────────────────────────────────────────── */

const knownLeague = (value: string | null | undefined) => {
  const slug = typeof value === 'string' ? value.trim() : '';
  return slug && ESPN_LEAGUES.some((league) => league.slug === slug) ? slug : null;
};

const knownStatus = (value: string | null | undefined) => {
  const status = typeof value === 'string' ? value.trim() : '';
  return (STATUSES as string[]).includes(status) ? (status as SportsHighlightStatus) : null;
};

export type ResolvedIndexQuery = {
  kind: IndexedClipKind | null;
  league: string | null;
  status: SportsHighlightStatus | null;
  since: Date | null;
  limit: number;
  offset: number;
};

/**
 * Everything a caller passes is clamped here, once, before it reaches SQL: an
 * unknown competition or match state is dropped rather than queried, `days`
 * cannot exceed a year, and `limit`/`offset` cannot be negative or absurd.
 */
export function resolveIndexQuery(query: HighlightsIndexQuery = {}): ResolvedIndexQuery {
  const limit = Number.isFinite(query.limit) ? Math.min(MAX_INDEX_LIMIT, Math.max(1, Math.trunc(query.limit as number))) : DEFAULT_INDEX_LIMIT;
  const offset = Number.isFinite(query.offset) ? Math.min(100_000, Math.max(0, Math.trunc(query.offset as number))) : 0;
  // Zero or a negative window means "no age filter", not "the last day": clamping
  // it to 1 would silently hide everything older than yesterday.
  const asked = Number.isFinite(query.days) ? Math.trunc(query.days as number) : 0;
  const days = asked > 0 ? Math.min(MAX_INDEX_DAYS, asked) : null;
  return {
    kind: query.kind === 'match' || query.kind === 'league' ? query.kind : null,
    league: knownLeague(query.league ?? null),
    status: knownStatus(query.status ?? null),
    since: days ? new Date(Date.now() - days * 86_400_000) : null,
    limit,
    offset,
  };
}

/* ── Rows ───────────────────────────────────────────────────────────────── */

/** One stored clip, as the table holds it. Column names are the table's own. */
export type ClipRow = {
  external_key: string;
  kind: IndexedClipKind;
  clip_id: string;
  title: string;
  description: string | null;
  duration: number | null;
  thumbnail: string | null;
  mp4: string | null;
  hls: string | null;
  page: string | null;
  playable: boolean;
  event_id: string | null;
  event_name: string | null;
  sport: string | null;
  league: string;
  league_name: string;
  home: string | null;
  away: string | null;
  /**
   * ESPN's team id for each side of a match clip, stored so a team page can be
   * answered from rows this site already holds rather than from a fresh ESPN
   * call. Null for a league clip (no two sides) and for any clip whose fixture
   * reported no id. Never inferred from the team name.
   */
  home_id: string | null;
  away_id: string | null;
  home_logo: string | null;
  away_logo: string | null;
  teams: string | null;
  occurred_at: Date | string | null;
  source_url: string | null;
  /** Match state for a match clip. A league clip has none, and gets null. */
  status: SportsHighlightStatus | null;
  /**
   * The anchor id of a match clip (`slugify(clip.id)`), stored so a saved like or
   * comment on a clip can be resolved from the index instead of from the live
   * board's twelve clips. A league clip has no anchor post and gets null.
   */
  anchor_key: string | null;
};

const text = (value: unknown, max = MAX_TEXT) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
const url = (value: unknown) => {
  const candidate = text(value, MAX_URL);
  if (!candidate) return null;
  try {
    return new URL(candidate).protocol === 'https:' ? candidate : null;
  } catch {
    return null;
  }
};
const seconds = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 86_400 ? Math.trunc(value) : null);
const instant = (value: unknown): Date | null => {
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isNaN(ms) ? null : new Date(ms);
};

/** A match clip plus where it came from, ready to store. */
export type StoredMatchClip = { kind: 'match'; clip: SportsHighlightClip; sourceUrl?: string | null };
/**
 * A league video clip plus where it came from, ready to store.
 *
 * `media` is the playable rendition, which the ESPN listing does not carry: it is
 * resolved per clip, when a reader presses play or when a sweep pre-warms one. It
 * is optional so a sweep that only read the listing still stores the clip.
 */
export type StoredLeagueClip = {
  kind: 'league';
  clip: SportsVideoNewsClip;
  sourceUrl?: string | null;
  media?: SportsVideoNewsMedia | null;
};

/** One stored league row that a rendition could be resolved for. */
export type NewsClipRef = { clipId: string; externalKey: string };

/**
 * How many stored league rows one pass may pre-warm a rendition for. Each costs
 * one ESPN request, so this is a hard ceiling inside the pass's own budget rather
 * than a target: coverage of the media column converges over successive passes,
 * and anything a reader actually presses play on is resolved and stored anyway.
 */
export const MAX_MEDIA_WARM = 12;
export type StoredClip = StoredMatchClip | StoredLeagueClip;

/**
 * Row for a match clip. Pure and exported: the mapping is the part worth testing
 * without a database, because a column that is written wrong is a clip that can
 * never be rendered again.
 */
export function matchRow(stored: StoredMatchClip): ClipRow | null {
  const clip = stored.clip;
  const key = clipKey('match', clip);
  const title = text(clip.title);
  const league = knownLeague(clip.league);
  // No media and no ESPN page means there is nothing to play or link to, and a
  // row like that would render as an empty card forever.
  const mp4 = url(clip.mp4);
  const hls = url(clip.hls);
  const page = url(clip.page);
  const status = (STATUSES as string[]).includes(String(clip.status)) ? clip.status : null;
  // Refused at the door rather than stored unreadable: retention is permanent, so
  // a row that could never render would be a bad record forever.
  if (!key || !title || !league || !status || (!mp4 && !hls && !page)) return null;
  return {
    external_key: key,
    kind: 'match',
    clip_id: clip.id.slice(0, MAX_TEXT),
    title,
    description: text(clip.description, 1000),
    duration: seconds(clip.duration),
    thumbnail: url(clip.thumbnail),
    mp4,
    hls,
    page,
    // Only a progressive file plays in every browser; HLS needs Safari. That is
    // the feed's own rule, re-checked here so a stored row never claims more
    // playability than the URLs it holds can deliver.
    playable: !!mp4,
    event_id: text(clip.eventId, 64),
    event_name: text(clip.eventName, 200),
    sport: text(clip.sport, 40),
    league,
    league_name: text(clip.leagueName, 120) ?? league,
    home: text(clip.home, 120),
    away: text(clip.away, 120),
    // Re-gated on the way in, not trusted from the caller: an id that reaches
    // the table is later used to address a team page, so a malformed one stored
    // here would be a permanently wrong record. Retention is permanent.
    home_id: entityIdFrom(clip.homeId),
    away_id: entityIdFrom(clip.awayId),
    home_logo: url(clip.homeLogo),
    away_logo: url(clip.awayLogo),
    teams: null,
    occurred_at: instant(clip.startAt),
    source_url: url(stored.sourceUrl ?? null),
    status,
    anchor_key: text(highlightAnchorId(clip), 200),
  };
}

/**
 * Row for a league video clip.
 *
 * The fixture columns stay null on purpose: a league clip has no match behind
 * it, and `teams` holds only the labels ESPN reported on the article itself.
 */
export function leagueRow(stored: StoredLeagueClip): ClipRow | null {
  const clip = stored.clip;
  const key = clipKey('league', clip);
  const title = text(clip.title);
  const league = knownLeague(clip.league);
  // The rendition, when one is known. The listing never carries a media URL, so
  // it arrives separately — resolved when a reader pressed play, or pre-warmed by
  // a pass — and is stored here beside the clip. Keeping it only in memory would
  // lose it on the next deploy, which is the whole reason this table exists.
  const media = stored.media ?? null;
  const mp4 = url(media?.mp4 ?? null);
  const hls = url(media?.hls ?? null);
  const page = url(clip.page) || url(media?.page ?? null);
  if (!key || !title || !league || !page) return null;
  const teams = Array.isArray(clip.teams)
    ? clip.teams.filter((team): team is string => typeof team === 'string' && !!team.trim()).slice(0, 8).map((team) => team.trim().slice(0, 120))
    : [];
  return {
    external_key: key,
    kind: 'league',
    clip_id: text(clip.clipId, 64) ?? clip.id.slice(0, MAX_TEXT),
    title,
    description: text(clip.description, 1000),
    duration: seconds(media?.duration ?? null),
    thumbnail: url(clip.thumbnail) || url(media?.thumbnail ?? null),
    mp4,
    hls,
    page,
    // Playable exactly when a rendition was resolved, the same rule a match row
    // uses. A league clip with no media stored yet is listed and linked, and the
    // card resolves it when a reader presses play.
    playable: !!mp4,
    event_id: null,
    event_name: null,
    sport: text(clip.sport, 40),
    league,
    league_name: text(clip.leagueName, 120) ?? league,
    home: null,
    away: null,
    // A league clip has no two sides, so it carries no team id either.
    home_id: null,
    away_id: null,
    home_logo: null,
    away_logo: null,
    teams: teams.length ? JSON.stringify(teams) : null,
    occurred_at: instant(clip.publishedAt),
    source_url: url(stored.sourceUrl ?? null),
    // No fixture, so no match state: a league clip is never offered under Live.
    status: null,
    // League video clips get no anchor post (that is the video-news card's own
    // rule), so there is no anchor id to look one up by.
    anchor_key: null,
  };
}

export function clipRow(stored: StoredClip): ClipRow | null {
  return stored.kind === 'match' ? matchRow(stored) : leagueRow(stored);
}

const COLUMNS = `"external_key", "kind", "clip_id", "title", "description", "duration", "thumbnail",
    "mp4", "hls", "page", "playable", "event_id", "event_name", "sport", "league", "league_name",
    "home", "away", "home_id", "away_id", "home_logo", "away_logo", "teams", "occurred_at",
    "source_url", "status", "anchor_key"`;

const FIELDS = 27;

/**
 * The INSERT for a batch, with bound placeholders only — no value is ever
 * interpolated into the SQL text.
 *
 * `discovered_at` is deliberately absent so it keeps its default on insert and is
 * untouched on conflict: that column is the permanent record of when this site
 * first saw a clip. `seen_at` is what updates, saying ESPN still reports it.
 */
export function insertSql(rows: ClipRow[]): { sql: string; params: unknown[] } | null {
  if (!rows.length || rows.length > MAX_INSERT_ROWS) return null;
  const tuples: string[] = [];
  const params: unknown[] = [];
  rows.forEach((row, index) => {
    const base = index * FIELDS;
    tuples.push(`(${Array.from({ length: FIELDS }, (_, field) => `$${base + field + 1}`).join(', ')})`);
    params.push(
      row.external_key, row.kind, row.clip_id, row.title, row.description, row.duration, row.thumbnail,
      row.mp4, row.hls, row.page, row.playable, row.event_id, row.event_name, row.sport, row.league,
      row.league_name, row.home, row.away, row.home_id, row.away_id, row.home_logo, row.away_logo,
      row.teams, row.occurred_at, row.source_url, row.status, row.anchor_key,
    );
  });
  return {
    sql: `INSERT INTO "sports_highlight_clips" (${COLUMNS})
       VALUES ${tuples.join(', ')}
       ON CONFLICT ("external_key") DO UPDATE SET
         "title" = EXCLUDED."title",
         "description" = EXCLUDED."description",
         -- Media, and the URLs that carry it, are never overwritten with nothing.
         -- A sweep re-reads the league listing every 15 minutes and that listing
         -- has no rendition on it, so a plain assignment would wipe the mp4 a
         -- reader's play resolved and stored — losing it on every join, forever.
         "duration" = COALESCE(EXCLUDED."duration", "sports_highlight_clips"."duration"),
         "thumbnail" = COALESCE(EXCLUDED."thumbnail", "sports_highlight_clips"."thumbnail"),
         "mp4" = COALESCE(EXCLUDED."mp4", "sports_highlight_clips"."mp4"),
         "hls" = COALESCE(EXCLUDED."hls", "sports_highlight_clips"."hls"),
         "page" = COALESCE(EXCLUDED."page", "sports_highlight_clips"."page"),
         -- Derived from the merged media, never taken from the incoming row, so it
         -- cannot disagree with the columns beside it.
         "playable" = COALESCE(EXCLUDED."mp4", "sports_highlight_clips"."mp4") IS NOT NULL,
         "event_name" = EXCLUDED."event_name",
         "league_name" = EXCLUDED."league_name",
         "home" = EXCLUDED."home",
         "away" = EXCLUDED."away",
         -- Team ids are only ever filled in, never cleared. A row stored before
         -- ids were captured picks one up on the next sweep, and a later listing
         -- that reports none keeps the id already held. Wiping an id here would
         -- silently un-answer a team page that used to render.
         "home_id" = COALESCE(EXCLUDED."home_id", "sports_highlight_clips"."home_id"),
         "away_id" = COALESCE(EXCLUDED."away_id", "sports_highlight_clips"."away_id"),
         "home_logo" = EXCLUDED."home_logo",
         "away_logo" = EXCLUDED."away_logo",
         "teams" = EXCLUDED."teams",
         "source_url" = EXCLUDED."source_url",
         "status" = EXCLUDED."status",
         "seen_at" = now()`,
    params,
  };
}

/* ── Reading rows back into clips ───────────────────────────────────────── */

const iso = (value: Date | string | null) => {
  const date = value instanceof Date ? value : instant(value);
  return date ? date.toISOString() : null;
};

/**
 * A stored row as the highlights card's own clip type.
 *
 * Returns null when the row cannot be rendered — no title, no media and no page,
 * an unknown competition or a match state outside the three the card speaks.
 * Dropping such a row is the honest outcome: the alternative is a card that
 * claims a fixture or a state ESPN never reported.
 */
export function rowToMatchClip(row: ClipRow): SportsHighlightClip | null {
  // Read back from a permanent store, so the state is validated rather than
  // trusted: a row holding a fourth state renders no card at all.
  const status = (STATUSES as string[]).includes(String(row.status)) ? row.status : null;
  if (row.kind !== 'match' || !status) return null;
  const league = ESPN_LEAGUES.find((entry) => entry.slug === row.league);
  const mp4 = url(row.mp4);
  const hls = url(row.hls);
  const page = url(row.page);
  if (!row.title || !league || (!mp4 && !hls && !page)) return null;
  return {
    id: row.clip_id,
    title: row.title,
    description: row.description,
    duration: seconds(row.duration),
    thumbnail: url(row.thumbnail),
    mp4,
    hls,
    page,
    playable: !!mp4,
    // The card's `eventId` is this site's own namespaced board id, not ESPN's
    // provider id, and `sports.ts` derives it the same way every time: an event
    // in a competition is `espn-{slug}-{providerId}`.
    eventId: row.event_id ?? `espn-${row.league}-0`,
    eventName: row.event_name ?? '',
    sport: row.sport ?? league.kind,
    league: row.league,
    leagueName: row.league_name || league.name,
    home: row.home ?? '',
    away: row.away ?? '',
    // Gated again on the way out, so a row written before the gate existed (or
    // by hand) can never put a malformed id into a rendered link.
    homeId: entityIdFrom(row.home_id),
    awayId: entityIdFrom(row.away_id),
    homeLogo: url(row.home_logo),
    awayLogo: url(row.away_logo),
    startAt: iso(row.occurred_at),
    status,
  };
}

/** A stored row as the video-news card's own clip type. */
export function rowToLeagueClip(row: ClipRow): SportsVideoNewsClip | null {
  if (row.kind !== 'league') return null;
  const league = ESPN_LEAGUES.find((entry) => entry.slug === row.league);
  const page = url(row.page);
  if (!row.title || !league || !page) return null;
  let teams: string[] = [];
  if (row.teams) {
    try {
      const parsed: unknown = JSON.parse(row.teams);
      if (Array.isArray(parsed)) teams = parsed.filter((team): team is string => typeof team === 'string' && !!team.trim()).slice(0, 8);
    } catch {
      teams = [];
    }
  }
  return {
    id: `espn-video-${row.league}-${row.clip_id}`,
    clipId: row.clip_id,
    title: row.title,
    description: row.description,
    league: row.league,
    leagueName: row.league_name || league.name,
    sport: (row.sport ?? league.kind) as SportsVideoNewsClip['sport'],
    teams,
    publishedAt: iso(row.occurred_at),
    page,
    thumbnail: url(row.thumbnail),
  };
}

/**
 * The stored match clip behind an anchor id, or null.
 *
 * Engagement on a card resolves its draft from this site's own feeds; a clip that
 * is stored but no longer on the live board is still a real clip with a real post
 * behind it, so the index is the second place to look. Inert without a database.
 */
export async function findStoredHighlightClip(anchorKey: string): Promise<SportsHighlightClip | null> {
  const key = text(anchorKey, 200);
  if (!hasDatabase || !key) return null;
  try {
    await ensureMigrated();
    const rows = await prisma.$queryRawUnsafe<ClipRow[]>(
      `SELECT ${COLUMNS} FROM "sports_highlight_clips" WHERE "anchor_key" = $1 AND "kind" = 'match' LIMIT 1`,
      key,
    );
    return rows[0] ? rowToMatchClip(rows[0]) : null;
  } catch (error) {
    failed('query-failed', error);
    return null;
  }
}

/**
 * The stored rendition for one league video, or null when it has none.
 *
 * This is the durable half of the media cache in `espn-video-news-feed`. ESPN's
 * league listing carries no media URL, so a rendition is resolved per clip; in
 * memory that answer lived 15 minutes and died on every deploy, which meant the
 * same clip was asked again forever. Stored here it is asked once.
 *
 * A row with no rendition is **not** an answer — the caller asks ESPN and stores
 * what comes back. Inert without a database.
 */
export async function findStoredNewsMedia(clipId: string): Promise<SportsVideoNewsMedia | null> {
  const id = text(clipId, 64);
  if (!hasDatabase || !id) return null;
  try {
    await ensureMigrated();
    const rows = await prisma.$queryRawUnsafe<{
      mp4: string | null; hls: string | null; page: string | null; thumbnail: string | null; duration: number | null;
    }[]>(
      `SELECT "mp4", "hls", "page", "thumbnail", "duration" FROM "sports_highlight_clips"
        WHERE "kind" = 'league' AND "clip_id" = $1 ORDER BY "id" DESC LIMIT 1`,
      id,
    );
    const row = rows[0];
    const mp4 = url(row?.mp4 ?? null);
    const hls = url(row?.hls ?? null);
    if (!mp4 && !hls) return null;
    return {
      mp4,
      hls,
      page: url(row?.page ?? null),
      thumbnail: url(row?.thumbnail ?? null),
      duration: seconds(row?.duration ?? null),
    };
  } catch (error) {
    failed('query-failed', error);
    return null;
  }
}

/**
 * Store a resolved rendition onto its league row. Returns the rows updated.
 *
 * Nothing is written for a rendition that cannot play: a refusal is not a fact
 * worth keeping permanently, and the probe table is what remembers that a clip
 * was asked and answered with nothing.
 *
 * The rendition supplies the media columns and fills any gap beside them, but
 * never replaces a value the listing already stored — `leagueRow` gives the
 * listing's own thumbnail and page precedence, and a row's thumbnail must not
 * depend on which of the two write paths happened to run last.
 */
export async function storeNewsMedia(clipId: string, media: SportsVideoNewsMedia | null): Promise<number> {
  const id = text(clipId, 64);
  const mp4 = url(media?.mp4 ?? null);
  const hls = url(media?.hls ?? null);
  if (!hasDatabase || !id || (!mp4 && !hls)) return 0;
  try {
    await ensureMigrated();
    return await prisma.$executeRawUnsafe(
      `UPDATE "sports_highlight_clips"
          SET "mp4" = $2,
              "hls" = $3,
              "duration" = COALESCE($4, "duration"),
              "playable" = $5,
              "thumbnail" = COALESCE("thumbnail", $6),
              "page" = COALESCE("page", $7)
        WHERE "kind" = 'league' AND "clip_id" = $1`,
      id, mp4, hls, seconds(media?.duration ?? null), !!mp4, url(media?.thumbnail ?? null), url(media?.page ?? null),
    );
  } catch (error) {
    failed('query-failed', error);
    return 0;
  }
}

/**
 * Stored league rows with no rendition yet, newest first — what a pass pre-warms.
 *
 * Clamped here as well as at the call site, so a sweep can never become one
 * request per stored clip. Inert without a database.
 */
export async function newsClipsNeedingMedia(limit: number = MAX_MEDIA_WARM): Promise<NewsClipRef[]> {
  if (!hasDatabase) return [];
  const max = Math.max(1, Math.min(MAX_MEDIA_WARM, Math.trunc(limit) || MAX_MEDIA_WARM));
  try {
    await ensureMigrated();
    const rows = await prisma.$queryRawUnsafe<{ clip_id: string; external_key: string }[]>(
      `SELECT "clip_id", "external_key" FROM "sports_highlight_clips"
        WHERE "kind" = 'league' AND "mp4" IS NULL AND "hls" IS NULL
        ORDER BY "occurred_at" DESC NULLS LAST, "id" DESC LIMIT $1`,
      max,
    );
    return rows.map((row) => ({ clipId: row.clip_id, externalKey: row.external_key }));
  } catch (error) {
    failed('query-failed', error);
    return [];
  }
}

const failed = (reason: 'query-failed', error: unknown) => {
  console.warn('[highlights-index] query failed:', (error as Error)?.message);
  return reason;
};

/* ── The store ──────────────────────────────────────────────────────────── */

/**
 * The surface the sweeper and the API use. Injectable so a sweep can be tested
 * with a fake store and a stubbed `fetch`, without a database.
 */
export type HighlightsStore = {
  /** False when no database is configured, or the connection has been lost. */
  available(): boolean;
  summary(): Promise<HighlightsIndexSummary>;
  read(query: HighlightsIndexQuery): Promise<IndexedHighlights>;
  /** Rows written (inserted or refreshed). Never throws. */
  store(clips: StoredClip[]): Promise<number>;
  /** Probe keys worth asking again: never asked, or asked and found empty. */
  probeable(keys: string[], reprobeEmptyAfterMs: number): Promise<Set<string>>;
  recordProbes(entries: { key: string; clips: number }[]): Promise<void>;
  /** Sweep cells walked recently enough to skip. */
  freshCells(keys: string[], cellTtlMs: number): Promise<Set<string>>;
  recordCells(entries: { key: string; games: number; clips: number }[]): Promise<void>;
  /** The stored rendition for one league video, or null when it has none. */
  findNewsMedia(clipId: string): Promise<SportsVideoNewsMedia | null>;
  /** Write a resolved rendition onto its league row. Returns the rows updated. */
  storeNewsMedia(clipId: string, media: SportsVideoNewsMedia | null): Promise<number>;
  /** Stored league rows with no rendition yet, newest first, for a pre-warm. */
  newsClipsNeedingMedia(limit: number): Promise<NewsClipRef[]>;
};

async function querySummary(): Promise<HighlightsIndexSummary> {
  await ensureMigrated();
  const rows = await prisma.$queryRawUnsafe<{
    clips: number; match_clips: number; league_clips: number; competitions: number;
    oldest_at: Date | string | null; newest_at: Date | string | null;
  }[]>(
    `SELECT count(*)::int AS "clips",
            count(*) FILTER (WHERE "kind" = 'match')::int AS "match_clips",
            count(*) FILTER (WHERE "kind" = 'league')::int AS "league_clips",
            count(DISTINCT "league")::int AS "competitions",
            min("occurred_at") AS "oldest_at",
            max("occurred_at") AS "newest_at"
       FROM "sports_highlight_clips"`,
  );
  const sweeps = await prisma.$queryRawUnsafe<{ last_sweep_at: Date | string | null; cells: number }[]>(
    `SELECT max("swept_at") AS "last_sweep_at", count(*)::int AS "cells" FROM "sports_highlight_sweeps"`,
  );
  const row = rows[0];
  return {
    ok: true,
    clips: row?.clips ?? 0,
    matchClips: row?.match_clips ?? 0,
    leagueClips: row?.league_clips ?? 0,
    competitions: row?.competitions ?? 0,
    oldestAt: iso(row?.oldest_at ?? null),
    newestAt: iso(row?.newest_at ?? null),
    lastSweepAt: iso(sweeps[0]?.last_sweep_at ?? null),
    sweptCells: sweeps[0]?.cells ?? 0,
  };
}

async function queryRead(query: HighlightsIndexQuery): Promise<IndexedHighlights> {
  const resolved = resolveIndexQuery(query);
  const summary = await querySummary();
  await ensureMigrated();

  const where = `WHERE ($1::text IS NULL OR "kind" = $1)
          AND ($2::text IS NULL OR "league" = $2)
          AND ($3::text IS NULL OR "status" = $3)
          AND ($4::timestamptz IS NULL OR "occurred_at" >= $4)`;
  const filters = [resolved.kind, resolved.league, resolved.status, resolved.since];

  const rows = await prisma.$queryRawUnsafe<ClipRow[]>(
    `SELECT ${COLUMNS}, "id" FROM "sports_highlight_clips"
       ${where}
       ORDER BY "occurred_at" DESC NULLS LAST, "id" DESC
       LIMIT $5 OFFSET $6`,
    ...filters, resolved.limit, resolved.offset,
  );
  const counted = await prisma.$queryRawUnsafe<{ total: number }[]>(
    `SELECT count(*)::int AS "total" FROM "sports_highlight_clips" ${where}`,
    ...filters,
  );
  // Totals for the filter chips, deliberately unfiltered: a chip that counted
  // only the current page would claim a competition has four clips when it has
  // four hundred stored.
  const leagueRows = await prisma.$queryRawUnsafe<{ league: string; total: number }[]>(
    `SELECT "league", count(*)::int AS "total" FROM "sports_highlight_clips"
       GROUP BY "league" ORDER BY count(*) DESC, "league" ASC`,
  );
  const statusRows = await prisma.$queryRawUnsafe<{ status: string | null; total: number }[]>(
    `SELECT "status", count(*)::int AS "total" FROM "sports_highlight_clips"
       WHERE "kind" = 'match' AND "status" IS NOT NULL GROUP BY "status"`,
  );

  const match: SportsHighlightClip[] = [];
  const league: SportsVideoNewsClip[] = [];
  for (const row of rows) {
    const matchClip = rowToMatchClip(row);
    if (matchClip) { match.push(matchClip); continue; }
    const leagueClip = rowToLeagueClip(row);
    if (leagueClip) league.push(leagueClip);
  }
  const total = counted[0]?.total ?? 0;
  const byLeague = leagueRows.map((row) => ({
    league: row.league,
    leagueName: ESPN_LEAGUES.find((entry) => entry.slug === row.league)?.name ?? row.league,
    total: row.total,
  }));
  const byStatus = statusRows
    .filter((row) => (STATUSES as string[]).includes(String(row.status)))
    .map((row) => ({ status: String(row.status) as SportsHighlightStatus, total: row.total }));
  return {
    ok: true,
    match,
    league,
    sourceUrl: rows[0]?.source_url ?? null,
    remaining: Math.max(0, total - resolved.offset - rows.length),
    byLeague,
    byStatus,
    summary,
  };
}

/* ── The feed's read ────────────────────────────────────────────────────── */

export type FeedClipsRead = {
  ok: boolean;
  reason?: 'no-database' | 'query-failed';
  /** Stored match clips in the window, newest first. */
  clips: SportsHighlightClip[];
  /** Clips in the window this read did not carry, so a ceiling is never silent. */
  remaining: number;
  /** The endpoint that produced the newest row, as `read()` reports it. */
  sourceUrl: string | null;
};

/**
 * Every stored match clip in a window, newest first, in two indexed queries.
 *
 * The homepage feed carries all of them, so it cannot use `read()`: that also
 * builds the index page's summary, its per-competition totals and its per-state
 * counts — five queries, four of which a feed never looks at. This reads the rows
 * and how many are left, ordered exactly as `read()` orders them
 * (`occurred_at DESC NULLS LAST, id DESC`), so a feed built from stored rows runs
 * newest to oldest the same way the index does and the two cannot disagree.
 *
 * The bounds are `resolveIndexQuery`'s, except the per-page one: a feed read is
 * capped by `FEED_INDEX_LIMIT` rather than `MAX_INDEX_LIMIT`.
 *
 * Never throws. Storage that is missing, slow or broken leaves the caller with
 * whatever board it already had, which is the rule this index has always kept.
 */
export async function readFeedClips(days: number, limit: number = FEED_INDEX_LIMIT): Promise<FeedClipsRead> {
  const empty: FeedClipsRead = { ok: false, reason: 'no-database', clips: [], remaining: 0, sourceUrl: null };
  if (!hasDatabase) return empty;
  const asked = Number.isFinite(days) ? Math.trunc(days) : 0;
  const boundedDays = asked > 0 ? Math.min(MAX_INDEX_DAYS, asked) : null;
  const since = boundedDays ? new Date(Date.now() - boundedDays * 86_400_000) : null;
  const bounded = Number.isFinite(limit) ? Math.trunc(limit) : FEED_INDEX_LIMIT;
  const wanted = Math.max(1, Math.min(FEED_INDEX_LIMIT, bounded));
  try {
    await ensureMigrated();
    const where = `WHERE "kind" = 'match' AND ($1::timestamptz IS NULL OR "occurred_at" >= $1)`;
    const rows = await prisma.$queryRawUnsafe<ClipRow[]>(
      `SELECT ${COLUMNS}, "id" FROM "sports_highlight_clips"
         ${where}
         ORDER BY "occurred_at" DESC NULLS LAST, "id" DESC
         LIMIT $2`,
      since, wanted,
    );
    const counted = await prisma.$queryRawUnsafe<{ total: number }[]>(
      `SELECT count(*)::int AS "total" FROM "sports_highlight_clips" ${where}`,
      since,
    );
    const clips: SportsHighlightClip[] = [];
    for (const row of rows) {
      const clip = rowToMatchClip(row);
      // A row that cannot be rendered is dropped, as it is everywhere else: a
      // card with nothing to play is worse than one clip fewer.
      if (clip) clips.push(clip);
    }
    const total = counted[0]?.total ?? 0;
    return { ok: true, clips, remaining: Math.max(0, total - rows.length), sourceUrl: rows[0]?.source_url ?? null };
  } catch (error) {
    return { ...empty, reason: failed('query-failed', error) };
  }
}

/* ── One clip, one fixture, and the sitemap's list ─────────────────────── */

export type StoredClipRead = {
  /** The database answered. A clip that does not exist is still a good read. */
  ok: boolean;
  reason?: 'no-database' | 'query-failed';
  clip: SportsHighlightClip | null;
};

export type EventClipsRead = {
  ok: boolean;
  reason?: 'no-database' | 'query-failed';
  clips: SportsHighlightClip[];
};

/** One stored clip's identity and when it happened, for a list of URLs. */
export type ClipRef = { id: string; at: Date | null };

export type ClipRefsRead = {
  ok: boolean;
  reason?: 'no-database' | 'query-failed';
  refs: ClipRef[];
};

/**
 * How many clip refs one read may return.
 *
 * A sitemap entry per clip is what makes six hundred stored clips six hundred
 * crawlable pages instead of one list, and a sitemap may hold fifty thousand URLs;
 * this bounds one query, not how much of the index the site is willing to publish.
 */
export const MAX_CLIP_REFS = 2_000;

/** Clips listed for one fixture. A match rarely has more, and a page shows them all. */
export const EVENT_CLIPS_LIMIT = 24;

/**
 * One stored match clip by the id its page is keyed on.
 *
 * Compared case-insensitively because the URL carries the slugified id: an ESPN
 * clip id is numeric and survives that unchanged, but a page must not 404 over a
 * difference in case that the row does not care about.
 *
 * Never throws, and inert without a database — a clip page on a deployment with no
 * storage is a 404 rather than an error.
 */
export async function readStoredClip(clipId: string): Promise<StoredClipRead> {
  const empty: StoredClipRead = { ok: false, reason: 'no-database', clip: null };
  const wanted = String(clipId ?? '').trim();
  if (!hasDatabase || !wanted) return empty;
  try {
    await ensureMigrated();
    const rows = await prisma.$queryRawUnsafe<ClipRow[]>(
      `SELECT ${COLUMNS} FROM "sports_highlight_clips"
         WHERE "kind" = 'match' AND lower("clip_id") = lower($1::text)
         ORDER BY "occurred_at" DESC NULLS LAST, "id" DESC
         LIMIT 1`,
      wanted,
    );
    // No row is an answer, not a failure: a clip this site has never stored is a
    // 404, and it must not be reported as a query that broke or logged as one —
    // a crawler asking for ids that do not exist is ordinary traffic. A row that
    // cannot be rendered is dropped here as it is everywhere else, for the same
    // reason: the page 404s rather than showing a clip with nothing to play.
    const row = rows[0];
    return { ok: true, clip: row ? rowToMatchClip(row) : null };
  } catch (error) {
    return { ...empty, reason: failed('query-failed', error) };
  }
}

/**
 * Every stored clip for one fixture, newest first.
 *
 * This is what turns a match page from a shell that fetches in the browser into a
 * page with something on it when a crawler arrives: the fixture's own clips, read
 * from storage, costing no ESPN request.
 *
 * The id is matched exactly and as a dash-separated prefix, because a stored event
 * id is namespaced — `espn-{league}-{id}` — and a scoreboard carrying more than one
 * competition for a fixture appends the competition to it. A match page knows its
 * league and event id but not which form was stored, so it asks for the prefix and
 * gets either. A clip page passes the stored id and matches itself.
 */
export async function readEventClips(eventId: string, limit: number = EVENT_CLIPS_LIMIT): Promise<EventClipsRead> {
  const empty: EventClipsRead = { ok: false, reason: 'no-database', clips: [] };
  const wanted = String(eventId ?? '').trim();
  if (!hasDatabase || !wanted) return empty;
  const asked = Number.isFinite(limit) ? Math.trunc(limit) : EVENT_CLIPS_LIMIT;
  const bounded = Math.max(1, Math.min(FEED_INDEX_LIMIT, asked || EVENT_CLIPS_LIMIT));
  try {
    await ensureMigrated();
    const rows = await prisma.$queryRawUnsafe<ClipRow[]>(
      `SELECT ${COLUMNS} FROM "sports_highlight_clips"
         WHERE "kind" = 'match' AND ("event_id" = $1::text OR "event_id" LIKE $1::text || '-%')
         ORDER BY "occurred_at" DESC NULLS LAST, "id" DESC
         LIMIT $2`,
      wanted, bounded,
    );
    const clips: SportsHighlightClip[] = [];
    for (const row of rows) {
      const clip = rowToMatchClip(row);
      if (clip) clips.push(clip);
    }
    return { ok: true, clips };
  } catch (error) {
    return { ...empty, reason: failed('query-failed', error) };
  }
}

/** Clips listed for one team. Bounded like a fixture's list: a page shows them all. */
export const TEAM_CLIPS_LIMIT = 24;

export type TeamClipsRead = {
  ok: boolean;
  /**
   * `no-database` means the database is genuinely absent; `bad-reference` means it
   * is there but the league or id asked for is not one this site can read. Kept
   * apart because conflating them sends whoever debugs next to look at connection
   * settings for what is really a malformed id — the failure this reader exists to
   * refuse cleanly.
   */
  reason?: 'no-database' | 'bad-reference' | 'query-failed';
  clips: SportsHighlightClip[];
  /**
   * The team's own name, read back from the rows that mention it.
   *
   * A team page is addressed by a numeric ESPN id, and this site stores no team
   * table, so nothing server-side can turn that id into a name — except the
   * clips already held, which store both the id and the side's display name.
   * Deriving the name here rather than fetching it means a team page can render
   * real, crawlable copy with no ESPN call. Null when no stored row names it,
   * which is the honest "we have nothing to say about this team" case and must
   * never be filled in with a guess or with the id itself.
   */
  teamName: string | null;
  /** The competition's display name as stored, for the same reason. */
  leagueName: string | null;
};

/**
 * The name a stored clip gives one side, by the id that side was stored under.
 *
 * Exported separately from the reader so the rule can be tested without a
 * database: it is the whole reason a team page has real copy on it, and it must
 * answer null rather than fall back to the other side's name, to the id, or to
 * anything invented.
 */
export function teamNameFromClips(clips: SportsHighlightClip[], teamId: string): string | null {
  const wanted = entityIdFrom(teamId);
  if (!wanted) return null;
  for (const clip of clips) {
    if (clip.homeId === wanted && typeof clip.home === 'string' && clip.home.trim()) return clip.home.trim();
    if (clip.awayId === wanted && typeof clip.away === 'string' && clip.away.trim()) return clip.away.trim();
  }
  return null;
}

/**
 * Every stored match clip this site holds for one team, newest first.
 *
 * Scoped to the competition in the URL, so `/sports/teams/nba/1234` can never
 * answer with a clip stored under a different league's id space. Mirrors
 * `readEventClips`: same gating, same bounded limit, same refusal semantics —
 * no database is a good, empty answer, and a failed query is reported rather
 * than thrown, because a team page must still render its shell.
 */
export async function readTeamClips(league: string, teamId: string, limit: number = TEAM_CLIPS_LIMIT): Promise<TeamClipsRead> {
  const empty = (reason: 'no-database' | 'bad-reference'): TeamClipsRead =>
    ({ ok: false, reason, clips: [], teamName: null, leagueName: null });
  if (!hasDatabase) return empty('no-database');
  const wantedLeague = knownLeague(league);
  const wantedId = entityIdFrom(teamId);
  // A league or an id this site cannot read is an answer, not an error: there is
  // nothing stored to say about it, and it must not be logged as a failed query.
  if (!wantedLeague || !wantedId) return empty('bad-reference');
  const asked = Number.isFinite(limit) ? Math.trunc(limit) : TEAM_CLIPS_LIMIT;
  const bounded = Math.max(1, Math.min(FEED_INDEX_LIMIT, asked || TEAM_CLIPS_LIMIT));
  try {
    await ensureMigrated();
    const rows = await prisma.$queryRawUnsafe<ClipRow[]>(
      `SELECT ${COLUMNS} FROM "sports_highlight_clips"
         WHERE "kind" = 'match' AND "league" = $1::text
           AND ("home_id" = $2::text OR "away_id" = $2::text)
         ORDER BY "occurred_at" DESC NULLS LAST, "id" DESC
         LIMIT $3`,
      wantedLeague, wantedId, bounded,
    );
    const clips: SportsHighlightClip[] = [];
    for (const row of rows) {
      const clip = rowToMatchClip(row);
      if (clip) clips.push(clip);
    }
    return {
      ok: true,
      clips,
      teamName: teamNameFromClips(clips, wantedId),
      leagueName: clips[0]?.leagueName || null,
    };
  } catch (error) {
    const reason = failed('query-failed', error);
    return { ok: false, reason, clips: [], teamName: null, leagueName: null };
  }
}

/** One fixture this site holds clips for, as a list of URLs needs it. */
export type EventRef = { eventId: string; league: string; at: Date | null; clips: number };

export type EventRefsRead = {
  ok: boolean;
  reason?: 'no-database' | 'query-failed';
  refs: EventRef[];
};

/** How many fixtures one read may return. Bounds one grouped query, not the index. */
export const MAX_EVENT_REFS = 2_000;

/**
 * The fixtures this site holds clips for, newest first, with how many clips each has.
 *
 * A fixture with stored clips is a fixture this site can say something true about
 * without a browser, so it is a fixture worth a URL in the sitemap. One grouped
 * query, and only the three columns a URL and a `lastmod` need.
 */
export async function readRecentEventRefs(limit: number = MAX_EVENT_REFS): Promise<EventRefsRead> {
  const empty: EventRefsRead = { ok: false, reason: 'no-database', refs: [] };
  if (!hasDatabase) return empty;
  const asked = Number.isFinite(limit) ? Math.trunc(limit) : MAX_EVENT_REFS;
  const bounded = Math.max(1, Math.min(MAX_EVENT_REFS, asked || MAX_EVENT_REFS));
  try {
    await ensureMigrated();
    const rows = await prisma.$queryRawUnsafe<{ event_id: string | null; league: string | null; occurred_at: Date | null; clips: number }[]>(
      `SELECT "event_id", "league", max("occurred_at") AS "occurred_at", count(*)::int AS "clips"
         FROM "sports_highlight_clips"
        WHERE "kind" = 'match' AND "event_id" IS NOT NULL AND "league" IS NOT NULL
        GROUP BY "event_id", "league"
        ORDER BY max("occurred_at") DESC NULLS LAST, "event_id" DESC
        LIMIT $1`,
      bounded,
    );
    const refs: EventRef[] = [];
    for (const row of rows) {
      const eventId = typeof row.event_id === 'string' ? row.event_id.trim() : '';
      const league = typeof row.league === 'string' ? row.league.trim() : '';
      // A row that cannot name both halves of a match URL is not a URL.
      if (!eventId || !league) continue;
      refs.push({ eventId, league, at: row.occurred_at instanceof Date ? row.occurred_at : null, clips: Number.isFinite(row.clips) ? row.clips : 0 });
    }
    return { ok: true, refs };
  } catch (error) {
    return { ...empty, reason: failed('query-failed', error) };
  }
}

/** One team this site holds clips for, as a list of URLs needs it. */
export type TeamRef = { teamId: string; league: string; at: Date | null; clips: number };

export type TeamRefsRead = {
  ok: boolean;
  reason?: 'no-database' | 'query-failed';
  refs: TeamRef[];
};

/** How many teams one read may return. Bounds one grouped query, not the index. */
export const MAX_TEAM_REFS = 2_000;

/**
 * The teams this site holds clips for, newest first, with how many clips each has.
 *
 * Both sides of every stored match clip are a team this site can now say something
 * about, so the read unions them and groups by competition and id: one row per team,
 * however many fixtures it appears in. That is what makes a team page discoverable
 * rather than merely indexable — a crawler cannot find `/sports/teams/{league}/{id}`
 * on its own, because nothing links to it in server-rendered HTML.
 *
 * Mirrors `readRecentEventRefs`: same bound, same newest-first ordering, same rule
 * that a row which cannot name both halves of a URL is not a URL.
 */
export async function readRecentTeamRefs(limit: number = MAX_TEAM_REFS): Promise<TeamRefsRead> {
  const empty: TeamRefsRead = { ok: false, reason: 'no-database', refs: [] };
  if (!hasDatabase) return empty;
  const asked = Number.isFinite(limit) ? Math.trunc(limit) : MAX_TEAM_REFS;
  const bounded = Math.max(1, Math.min(MAX_TEAM_REFS, asked || MAX_TEAM_REFS));
  try {
    await ensureMigrated();
    const rows = await prisma.$queryRawUnsafe<{ team_id: string | null; league: string | null; occurred_at: Date | null; clips: number }[]>(
      `SELECT "league", "team_id", max("occurred_at") AS "occurred_at", count(*)::int AS "clips"
         FROM (
           SELECT "league", "home_id" AS "team_id", "occurred_at" FROM "sports_highlight_clips"
            WHERE "kind" = 'match' AND "home_id" IS NOT NULL AND "league" IS NOT NULL
           UNION ALL
           SELECT "league", "away_id" AS "team_id", "occurred_at" FROM "sports_highlight_clips"
            WHERE "kind" = 'match' AND "away_id" IS NOT NULL AND "league" IS NOT NULL
         ) AS "sides"
        GROUP BY "league", "team_id"
        ORDER BY max("occurred_at") DESC NULLS LAST, "team_id" DESC
        LIMIT $1`,
      bounded,
    );
    const refs: TeamRef[] = [];
    for (const row of rows) {
      const teamId = entityIdFrom(row.team_id);
      const league = typeof row.league === 'string' ? row.league.trim() : '';
      // A row that cannot name both halves of a team URL is not a URL.
      if (!teamId || !league) continue;
      refs.push({ teamId, league, at: row.occurred_at instanceof Date ? row.occurred_at : null, clips: Number.isFinite(row.clips) ? row.clips : 0 });
    }
    return { ok: true, refs };
  } catch (error) {
    return { ...empty, reason: failed('query-failed', error) };
  }
}

/**
 * The newest stored match clips as identities and timestamps, for a sitemap.
 *
 * Only what a sitemap needs — an id to build a URL from and a time to report as
 * `lastmod` — so it reads two columns and no rows it cannot publish.
 */
export async function readRecentClipRefs(limit: number = MAX_CLIP_REFS): Promise<ClipRefsRead> {
  const empty: ClipRefsRead = { ok: false, reason: 'no-database', refs: [] };
  if (!hasDatabase) return empty;
  const asked = Number.isFinite(limit) ? Math.trunc(limit) : MAX_CLIP_REFS;
  const bounded = Math.max(1, Math.min(MAX_CLIP_REFS, asked || MAX_CLIP_REFS));
  try {
    await ensureMigrated();
    const rows = await prisma.$queryRawUnsafe<{ clip_id: string | null; occurred_at: Date | null }[]>(
      `SELECT "clip_id", "occurred_at" FROM "sports_highlight_clips"
         WHERE "kind" = 'match' AND "clip_id" IS NOT NULL
         ORDER BY "occurred_at" DESC NULLS LAST, "id" DESC
         LIMIT $1`,
      bounded,
    );
    const refs: ClipRef[] = [];
    for (const row of rows) {
      const id = typeof row.clip_id === 'string' ? row.clip_id.trim() : '';
      if (!id) continue;
      refs.push({ id, at: row.occurred_at instanceof Date ? row.occurred_at : null });
    }
    return { ok: true, refs };
  } catch (error) {
    return { ...empty, reason: failed('query-failed', error) };
  }
}

/**
 * The rows a batch will write, in order, without duplicates.
 *
 * Pure, and the reason a pass can hand the store everything it read: one clip can
 * arrive twice (two competitions reporting the same video, or the same game found
 * on two days' scoreboards), and the key decides which copy is written. A clip
 * that cannot be rendered — no title, nothing to play, an unknown competition —
 * is dropped here rather than stored as a card that shows nothing.
 */
export function uniqueRows(clips: StoredClip[]): ClipRow[] {
  const rows: ClipRow[] = [];
  const seen = new Set<string>();
  for (const stored of clips) {
    const row = clipRow(stored);
    if (!row || seen.has(row.external_key)) continue;
    seen.add(row.external_key);
    rows.push(row);
  }
  return rows;
}

async function queryStore(clips: StoredClip[]): Promise<number> {
  const rows = uniqueRows(clips);
  if (!rows.length) return 0;
  await ensureMigrated();

  let written = 0;
  for (let start = 0; start < rows.length; start += MAX_INSERT_ROWS) {
    const batch = insertSql(rows.slice(start, start + MAX_INSERT_ROWS));
    if (!batch) continue;
    const result = await prisma.$executeRawUnsafe(batch.sql, ...batch.params);
    written += typeof result === 'number' ? result : 0;
  }
  return written;
}

async function queryProbeable(keys: string[], reprobeEmptyAfterMs: number): Promise<Set<string>> {
  const wanted = [...new Set(keys.filter((key) => key.startsWith('probe:')))].slice(0, 500);
  if (!wanted.length) return new Set();
  await ensureMigrated();
  // A collection that answered with clips is never asked again: the clips are
  // stored permanently. One that answered empty is worth asking again later,
  // because ESPN publishes highlights hours after full time.
  const rows = await prisma.$queryRawUnsafe<{ external_key: string }[]>(
    `SELECT "external_key" FROM "sports_highlight_probes"
       WHERE "external_key" = ANY($1::text[])
         AND ("clips_found" > 0 OR "probed_at" > $2::timestamptz)`,
    wanted, new Date(Date.now() - reprobeEmptyAfterMs),
  );
  const done = new Set(rows.map((row) => row.external_key));
  return new Set(wanted.filter((key) => !done.has(key)));
}

async function queryRecordProbes(entries: { key: string; clips: number }[]): Promise<void> {
  const rows = entries.filter((entry) => entry.key.startsWith('probe:')).slice(0, 500);
  if (!rows.length) return;
  await ensureMigrated();
  const tuples = rows.map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`).join(', ');
  // Two columns, two values: `probed_at` and `attempts` take their defaults on
  // insert and are set explicitly on conflict, where a re-read of the same
  // collection is a new attempt rather than a new row.
  await prisma.$executeRawUnsafe(
    `INSERT INTO "sports_highlight_probes" ("external_key", "clips_found")
       VALUES ${tuples}
       ON CONFLICT ("external_key") DO UPDATE SET
         "clips_found" = GREATEST("sports_highlight_probes"."clips_found", EXCLUDED."clips_found"),
         "probed_at" = now(),
         "attempts" = "sports_highlight_probes"."attempts" + 1`,
    ...rows.flatMap((entry) => [entry.key, entry.clips]),
  );
}

async function queryFreshCells(keys: string[], cellTtlMs: number): Promise<Set<string>> {
  const wanted = [...new Set(keys.filter((key) => key.startsWith('sweep:')))].slice(0, 2_000);
  if (!wanted.length) return new Set();
  await ensureMigrated();
  const rows = await prisma.$queryRawUnsafe<{ external_key: string }[]>(
    `SELECT "external_key" FROM "sports_highlight_sweeps"
       WHERE "external_key" = ANY($1::text[]) AND "swept_at" > $2::timestamptz`,
    wanted, new Date(Date.now() - cellTtlMs),
  );
  return new Set(rows.map((row) => row.external_key));
}

async function queryRecordCells(entries: { key: string; games: number; clips: number }[]): Promise<void> {
  const rows = entries.filter((entry) => entry.key.startsWith('sweep:')).slice(0, 2_000);
  if (!rows.length) return;
  await ensureMigrated();
  const tuples = rows.map((_, index) => `($${index * 3 + 1}, $${index * 3 + 2}, $${index * 3 + 3})`).join(', ');
  // Three columns, three values; `swept_at` defaults on insert and is refreshed
  // on conflict, which is what makes it the sweeper's cursor.
  await prisma.$executeRawUnsafe(
    `INSERT INTO "sports_highlight_sweeps" ("external_key", "games", "clips")
       VALUES ${tuples}
       ON CONFLICT ("external_key") DO UPDATE SET
         "games" = EXCLUDED."games",
         "clips" = EXCLUDED."clips",
         "swept_at" = now()`,
    ...rows.flatMap((entry) => [entry.key, entry.games, entry.clips]),
  );
}

/**
 * The real store. Every method resolves instead of rejecting: a database that is
 * down must cost a page its stored clips, never its render.
 */
export const highlightsStore: HighlightsStore = {
  available: () => hasDatabase,

  async summary() {
    if (!hasDatabase) return INDEX_UNAVAILABLE;
    try {
      return await querySummary();
    } catch (error) {
      return { ...INDEX_UNAVAILABLE, reason: failed('query-failed', error) };
    }
  },

  async read(query) {
    if (!hasDatabase) return INDEX_EMPTY;
    try {
      return await queryRead(query);
    } catch (error) {
      const reason = failed('query-failed', error);
      return { ...INDEX_EMPTY, reason, summary: { ...INDEX_UNAVAILABLE, reason } };
    }
  },

  async store(clips) {
    if (!hasDatabase || !clips.length) return 0;
    try {
      return await queryStore(clips);
    } catch (error) {
      failed('query-failed', error);
      return 0;
    }
  },

  async probeable(keys, reprobeEmptyAfterMs) {
    if (!hasDatabase) return new Set(keys);
    try {
      return await queryProbeable(keys, reprobeEmptyAfterMs);
    } catch (error) {
      failed('query-failed', error);
      // Unknown history is treated as "worth asking", but the sweeper's own
      // per-pass cap is what keeps that from becoming a storm.
      return new Set(keys);
    }
  },

  async recordProbes(entries) {
    if (!hasDatabase) return;
    try {
      await queryRecordProbes(entries);
    } catch (error) {
      failed('query-failed', error);
    }
  },

  async freshCells(keys, cellTtlMs) {
    if (!hasDatabase) return new Set();
    try {
      return await queryFreshCells(keys, cellTtlMs);
    } catch (error) {
      failed('query-failed', error);
      return new Set();
    }
  },

  async recordCells(entries) {
    if (!hasDatabase) return;
    try {
      await queryRecordCells(entries);
    } catch (error) {
      failed('query-failed', error);
    }
  },

  findNewsMedia: (clipId) => findStoredNewsMedia(clipId),

  storeNewsMedia: (clipId, media) => storeNewsMedia(clipId, media),

  newsClipsNeedingMedia: (limit) => newsClipsNeedingMedia(limit),
};
