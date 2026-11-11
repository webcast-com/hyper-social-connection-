/**
 * ESPN league video news, normalised into clips.
 *
 * This is a **separate** reader from the match highlights feed
 * (`espn-highlights.ts` / `espn-highlights-feed.ts`) and deliberately shares no
 * code with it beyond the repository's generic helpers. The highlights board is
 * fixture-driven: it finds finished matches and asks each match's own video
 * collection. That works where ESPN publishes per-game clips, and its own notes
 * record that the Premier League and the NFL answer those collections with an
 * empty list.
 *
 * This reader is feed-driven instead: it asks a league's **news** feed
 * (`…/site/v2/sports/{sport}/{league}/news`) and keeps the articles that are
 * genuinely videos. Those are the clips ESPN publishes as league video — goals,
 * recaps, reactions and analysis — which is what the empty collections leave
 * out. Two consequences are designed in rather than papered over:
 *
 *   1. A news article carries a clip **page** and a clip **record** id, not a
 *      media file. The playable rendition is fetched only when a reader presses
 *      play (`resolveVideoNewsMedia`), so listing clips costs one request per
 *      league and nothing per clip.
 *   2. A league clip has no fixture. Nothing here invents one: `teams` holds the
 *      labels ESPN reported in the article's own categories, and it may be empty.
 *      A card shows the league, never a guessed "Home vs Away".
 *
 * Nothing invents a URL either. A clip survives only with a title and an
 * ESPN-hosted clip page; media URLs come from the clip record and are classified
 * by extension, so ESPN's auth-gated renditions (which carry no extension) are
 * never handed to a `<video>` element.
 */
import { safeProviderImage } from './espn-image';
import type { SportKind } from './sports-catalog';

export type SportsVideoNewsClip = {
  /** Namespaced, stable id: `espn-video-{leagueSlug}-{clipId}`. */
  id: string;
  /** ESPN's own clip id, numeric. The only thing the clip route accepts. */
  clipId: string;
  title: string;
  description: string | null;
  /** This site's competition slug (`epl`, `ucl`, `nba`). */
  league: string;
  leagueName: string;
  sport: SportKind;
  /** Team labels ESPN reported on the article. May be empty; never guessed. */
  teams: string[];
  publishedAt: string | null;
  /** ESPN's clip page — validated, and the fallback when a stream will not play. */
  page: string;
  thumbnail: string | null;
};

export type SportsVideoNewsMedia = {
  /** Progressive file: plays in a <video> element everywhere. */
  mp4: string | null;
  /** HLS playlist: plays in Safari only, so the card checks before using it. */
  hls: string | null;
  page: string | null;
  thumbnail: string | null;
  /** Seconds, when ESPN reports a duration. */
  duration: number | null;
};

export type SportsVideoNewsBoard = {
  clips: SportsVideoNewsClip[];
  status: 'live' | 'partial' | 'unavailable';
  /** Leagues that answered with at least one clip. */
  leagues: number;
  source: { ok: boolean; url: string; httpStatus: number | null; error?: string; errorKind?: string };
};

/* ── URL guards ─────────────────────────────────────────────────────────── */

const MAX_URL = 2048;

function httpsUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_URL) return null;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed : null;
  } catch {
    return null;
  }
}

/** ESPN's own clip page. `espn.com.evil.test` is not ESPN. */
export function isEspnClipPageUrl(value: unknown): value is string {
  const url = httpsUrl(value);
  return !!url && (url.hostname === 'espn.com' || url.hostname.endsWith('.espn.com'));
}

/**
 * ESPN's clip-record API — the only host this reader will fetch a media file
 * from. Kept to the exact host and path so the clip route cannot be turned into
 * a proxy for an arbitrary URL.
 */
export function isEspnClipRecordUrl(value: unknown): value is string {
  const url = httpsUrl(value);
  return !!url && url.hostname === 'content.core.api.espn.com' && url.pathname.startsWith('/v1/video/clips/');
}

/** The clip-record URL for a numeric ESPN clip id, or null for anything else. */
export function espnClipRecordUrl(clipId: unknown): string | null {
  if (typeof clipId !== 'string' || !/^\d{1,20}$/.test(clipId)) return null;
  return `https://content.core.api.espn.com/v1/video/clips/${clipId}`;
}

/* ── Small readers, tolerant of the shapes ESPN actually sends ──────────── */

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function text(value: unknown): string | null {
  // ESPN sends ids and durations as numbers.
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function hrefOf(value: unknown): string | null {
  if (typeof value === 'string') return text(value);
  const holder = record(value);
  if (!holder) return null;
  return text(holder.href) ?? text(holder.url) ?? text(holder.link) ?? hrefOf(holder.self);
}

/** Seconds from a number, a numeric string, or an "M:SS" clock string. */
export function durationSeconds(value: unknown): number | null {
  const raw = value ?? null;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.round(raw);
  const asText = text(raw);
  if (!asText) return null;
  if (/^\d+(\.\d+)?$/.test(asText)) {
    const seconds = Math.round(Number(asText));
    return seconds > 0 ? seconds : null;
  }
  const clock = asText.match(/^(\d+):(\d{1,2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  return null;
}

/**
 * A media file, classified by its own extension. ESPN's auth-gated renditions
 * (`…/video/auth/…`) have no extension, so they fall through and are never
 * handed to a player that cannot authenticate.
 */
function streamKind(raw: string): 'mp4' | 'hls' | null {
  const url = httpsUrl(raw);
  if (!url) return null;
  if (/\.m3u8$/i.test(url.pathname)) return 'hls';
  if (/\.(mp4|m4v|mov|webm)$/i.test(url.pathname)) return 'mp4';
  return null;
}

/** Every `href`/`url`/`src` under a value, however deeply ESPN nests renditions. */
function collectMedia(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 6) return out;
  if (Array.isArray(value)) {
    for (const entry of value) collectMedia(entry, out, depth + 1);
    return out;
  }
  const holder = record(value);
  if (!holder) return out;
  for (const [key, entry] of Object.entries(holder)) {
    if (key === 'href' || key === 'url' || key === 'src') {
      const found = text(entry);
      if (found) out.push(found);
      continue;
    }
    collectMedia(entry, out, depth + 1);
  }
  return out;
}

/* ── The news feed ──────────────────────────────────────────────────────── */

/** An article is a video when ESPN says so, not when it merely mentions one. */
export function isVideoArticle(article: Record<string, unknown>): boolean {
  const type = text(article.type)?.toLowerCase();
  if (type === 'video') return true;
  const links = record(article.links);
  const page = hrefOf(record(links?.web) ?? null);
  if (type === 'media' && !!page && page.includes('/video/')) return true;
  if (record(record(links?.api)?.videos ?? null) || asArray(record(links?.api)?.videos).length) return true;
  return asArray(article.videos).length > 0;
}

/** Team and league labels ESPN attached to the article itself. */
function categoriesOf(article: Record<string, unknown>): { teams: string[]; leagueName: string | null } {
  const teams: string[] = [];
  let leagueName: string | null = null;
  for (const entry of asArray(article.categories)) {
    const category = record(entry);
    if (!category) continue;
    const kind = text(category.type)?.toLowerCase();
    if (kind === 'team') {
      const team = record(category.team);
      const name = text(team?.shortDisplayName) ?? text(team?.displayName) ?? text(team?.description);
      if (name && !teams.includes(name)) teams.push(name);
      continue;
    }
    if (kind === 'league') {
      const league = record(category.league);
      leagueName = text(league?.description) ?? text(league?.name) ?? text(category.description);
    }
  }
  return { teams, leagueName };
}

export type VideoNewsLeague = {
  /** This site's competition slug. */
  slug: string;
  name: string;
  kind: SportKind;
  /** ESPN's own path segments, taken from the catalog. */
  sport: string;
  league: string;
};

/**
 * One league's news response → the clips in it.
 *
 * `fallbackLeagueName` is the catalog's name for the competition; ESPN's own
 * category label wins when the article carries one, so a card reads the way ESPN
 * words it rather than the way this site's catalog does.
 */
export function parseVideoNews(
  payload: unknown,
  league: VideoNewsLeague,
): SportsVideoNewsClip[] {
  const articles = asArray(record(payload)?.articles);
  const clips: SportsVideoNewsClip[] = [];
  const seen = new Set<string>();

  for (const entry of articles) {
    const article = record(entry);
    if (!article || !isVideoArticle(article)) continue;

    const links = record(article.links);
    const page = hrefOf(record(links?.web) ?? null);
    // The clip page is the identity of the card and its fallback, so a clip
    // without a validated ESPN page is dropped rather than pointed at a guess.
    if (!page || !isEspnClipPageUrl(page)) continue;

    const title = text(article.headline) ?? text(article.title) ?? text(article.description);
    if (!title) continue;

    // ESPN's own article id, or the clip id hanging off its API link.
    const rawId = text(article.id)
      ?? text(record(record(links?.api)?.self ?? null)?.href)?.match(/\/(\d+)\/?$/)?.[1]
      ?? null;
    const clipId = rawId && /^\d{1,20}$/.test(rawId) ? rawId : null;
    if (!clipId) continue;

    const id = `espn-video-${league.slug}-${clipId}`;
    if (seen.has(id) || seen.has(page)) continue;
    seen.add(id);
    seen.add(page);

    const { teams, leagueName } = categoriesOf(article);
    const description = text(article.description);

    clips.push({
      id,
      clipId,
      title,
      // A description that is just the headline repeated adds nothing to a card.
      description: description && description !== title ? description : null,
      league: league.slug,
      leagueName: leagueName ?? league.name,
      sport: league.kind,
      teams,
      publishedAt: text(article.published) ?? text(article.lastModified),
      page,
      thumbnail: safeProviderImage(
        hrefOf(asArray(article.images)[0]) ?? hrefOf(record(asArray(article.images)[0])?.thumbnail ?? null),
      ),
    });
  }

  return clips;
}

/**
 * Several leagues' clips → one list: de-duplicated by ESPN page (the same clip
 * is syndicated across leagues), newest first, capped. A clip with no published
 * date sorts last rather than jumping the queue.
 */
export function combineVideoNews(
  feeds: ReadonlyArray<ReadonlyArray<SportsVideoNewsClip>>,
  limit: number,
): SportsVideoNewsClip[] {
  const seen = new Set<string>();
  const clips: SportsVideoNewsClip[] = [];
  for (const feed of feeds) {
    for (const clip of feed) {
      if (seen.has(clip.page) || seen.has(clip.id)) continue;
      seen.add(clip.page);
      seen.add(clip.id);
      clips.push(clip);
    }
  }
  const stamp = (clip: SportsVideoNewsClip) => (clip.publishedAt ? Date.parse(clip.publishedAt) || 0 : 0);
  clips.sort((a, b) => stamp(b) - stamp(a));
  return clips.slice(0, Math.max(0, limit));
}

/* ── The clip record ────────────────────────────────────────────────────── */

/**
 * A clip record → its playable media.
 *
 * ESPN answers a clip-record request either as the clip itself or wrapped in a
 * `videos` array, and hangs its renditions under `links` by name
 * (`links.source`, `links.source.HLS`, `links.mobile.source`). Both shapes are
 * read; the progressive file wins over HLS because HLS needs Safari.
 */
export function parseVideoNewsMedia(payload: unknown): SportsVideoNewsMedia {
  const empty: SportsVideoNewsMedia = { mp4: null, hls: null, page: null, thumbnail: null, duration: null };
  const root = record(payload);
  if (!root) return empty;

  const holder = asArray(root.videos).length
    ? record(asArray(root.videos)[0])
    : root;
  if (!holder) return empty;

  const mp4s: string[] = [];
  const streams: string[] = [];
  for (const found of [
    ...collectMedia(holder.links),
    ...collectMedia(holder.source),
    ...collectMedia(holder.playback ?? holder.renditions ?? holder.sources),
    text(holder.file) ?? '',
    text(holder.url) ?? '',
  ]) {
    if (!found) continue;
    const kind = streamKind(found);
    if (kind === 'mp4' && !mp4s.includes(found)) mp4s.push(found);
    if (kind === 'hls' && !streams.includes(found)) streams.push(found);
  }

  const page = hrefOf(holder.web) ?? hrefOf(record(holder.links)?.web ?? null);

  return {
    mp4: mp4s[0] ?? null,
    hls: streams[0] ?? null,
    page: page && isEspnClipPageUrl(page) ? page : null,
    thumbnail: safeProviderImage(
      hrefOf(holder.thumbnail) ?? hrefOf(holder.image) ?? hrefOf(asArray(holder.thumbnails)[0]),
    ),
    duration: durationSeconds(holder.duration ?? holder.durationSeconds ?? holder.length),
  };
}
