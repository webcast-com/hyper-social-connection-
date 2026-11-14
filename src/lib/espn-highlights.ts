/**
 * ESPN match highlights, normalised into playable clips.
 *
 * ESPN publishes a game's clips on that game's own video collection
 * (`/apis/site/v2/sports/{sport}/{league}/videos?event={id}`), which is the
 * Site API endpoint for the videos of a single game. The entries are not part
 * of any public contract, so this reader accepts the shapes ESPN is known to
 * send and drops anything it cannot turn into a clip with a poster and a way
 * to watch it.
 *
 * A live entry looks like this (read back from the endpoint, Champions League
 * event 401915383, November 2026):
 *
 *   {
 *     "id": 50383009,
 *     "headline": "Klinsmann: Real Madrid understand when it's important…",
 *     "description": "…",
 *     "duration": 97,
 *     "thumbnail": "https://espnmedia-cdn.akamaized.net/…/….jpg",
 *     "links": {
 *       "source": {
 *         "href": "https://espnmedia-cdn.akamaized.net/…/….mp4",
 *         "HLS": { "href": "https://cmp-espn.media.dssott.com/…/playlist.m3u8" }
 *       }
 *     },
 *     "web": { "href": "https://www.espn.com/video/clip/_/id/50383009/…" }
 *   }
 *
 * So `links` is an object of named renditions rather than the array of
 * `{rel, href}` links other ESPN endpoints send, `id` is a number, and the
 * clip's own page sits at the top level as `web`. All three forms are
 * accepted. The auth-gated renditions ESPN also lists
 * (`watch.auth.api.espn.com/video/auth/…`) carry no file extension, so they
 * are never mistaken for a playable file.
 *
 * Nothing here invents a URL: when ESPN gives no media file and no clip page,
 * the clip is dropped rather than pointed at a guessed address.
 */

export type SportsHighlightStatus = 'live' | 'upcoming' | 'final';

export type SportsHighlightClip = {
  id: string;
  title: string;
  description: string | null;
  /** Seconds, when ESPN reports a duration. */
  duration: number | null;
  thumbnail: string | null;
  /** Progressive MP4 when ESPN publishes one; HLS otherwise. */
  mp4: string | null;
  hls: string | null;
  /** ESPN video page, for clips that cannot play inline. */
  page: string | null;
  /** True when the clip can play in a <video> element without HLS support. */
  playable: boolean;
  eventId: string;
  eventName: string;
  sport: string;
  league: string;
  leagueName: string;
  home: string;
  away: string;
  homeLogo: string | null;
  awayLogo: string | null;
  startAt: string | null;
  status: SportsHighlightStatus;
  /**
   * ESPN's team ids for each side, when the fixture reported them. Optional:
   * a clip found before these were captured has none, and a race-style event
   * has no two sides to id. Absent is not an error — it only means a team page
   * cannot be answered from this row.
   */
  homeId?: string | null;
  awayId?: string | null;
};

/** The match a clip belongs to, so the card can show the fixture. */
export type SportsHighlightContext = {
  eventId: string;
  eventName: string;
  sport: string;
  league: string;
  leagueName: string;
  home: string;
  away: string;
  homeLogo: string | null;
  awayLogo: string | null;
  startAt: string | null;
  status: SportsHighlightStatus;
  /** ESPN's team ids for each side, when reported. See `SportsHighlightClip`. */
  homeId?: string | null;
  awayId?: string | null;
};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const text = (value: unknown): string | null => {
  // ESPN sends a video's id as a number, not a string.
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const href = (value: unknown): string | null => {
  if (typeof value === 'string') return text(value);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return text(record.href) ?? text(record.url) ?? text(record.link);
  }
  return null;
};

const isHttpUrl = (value: string | null): value is string => !!value && /^https?:\/\//i.test(value);

/** The video collection keeps its clips under one of these keys. */
const videoList = (payload: unknown): unknown[] => {
  const record = (payload ?? {}) as Record<string, unknown>;
  for (const key of ['videos', 'highlights', 'clips', 'video']) {
    const list = asArray(record[key]);
    if (list.length) return list;
  }
  const gamepackage = (record.gamepackage ?? {}) as Record<string, unknown>;
  for (const key of ['videos', 'highlights']) {
    const list = asArray(gamepackage[key]);
    if (list.length) return list;
  }
  return [];
};

/** Keys a media URL hides under, once `href` itself has been handled. */
const MEDIA_KEYS = ['href', 'url', 'src'];

/** Every media URL under a value, however deeply ESPN nests its renditions. */
function collectMediaUrls(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 6) return out;
  if (Array.isArray(value)) {
    for (const entry of value) collectMediaUrls(entry, out, depth + 1);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (MEDIA_KEYS.includes(key)) {
        const found = text(entry);
        if (found) out.push(found);
        continue;
      }
      collectMediaUrls(entry, out, depth + 1);
    }
  }
  return out;
}

/**
 * Progressive file or stream, decided by the URL's extension. ESPN's
 * auth-gated renditions (`…/video/auth/…`) have no extension at all, so they
 * fall through and are never handed to a <video> element.
 */
function streamKind(raw: string): 'mp4' | 'hls' | null {
  let path: string;
  try {
    path = new URL(raw).pathname;
  } catch {
    return null;
  }
  if (/\.m3u8$/i.test(path)) return 'hls';
  if (/\.(mp4|m4v|mov|webm)$/i.test(path)) return 'mp4';
  return null;
}

/** A media file ESPN can serve directly: MP4 first, HLS as a fallback. */
function mediaOf(item: Record<string, unknown>): { mp4: string | null; hls: string | null } {
  const mp4s: string[] = [];
  const streams: string[] = [];

  const push = (found: string | null) => {
    if (!isHttpUrl(found)) return;
    const kind = streamKind(found);
    if (kind === 'mp4') {
      if (!mp4s.includes(found)) mp4s.push(found);
      return;
    }
    if (kind === 'hls' && !streams.includes(found)) streams.push(found);
  };

  // ESPN's live entry nests its renditions under `links` by name
  // (`links.source`, `links.source.HD`, `links.full`, `links.mobile.source`).
  for (const found of collectMediaUrls(item.links)) push(found);
  // Documented shapes keep one `source` object or a list of renditions.
  for (const found of collectMediaUrls(item.source)) push(found);
  for (const found of collectMediaUrls(item.playback ?? item.renditions ?? item.sources)) push(found);
  for (const key of ['file', 'url', 'mp4', 'videoUrl', 'contentUrl']) push(text(item[key]));

  return { mp4: mp4s[0] ?? null, hls: streams[0] ?? null };
}

/** Seconds from a number, a numeric string, or a "M:SS" clock string. */
function durationOf(item: Record<string, unknown>): number | null {
  const raw = item.duration ?? item.durationSeconds ?? item.length;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.round(raw);
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed));
    const clock = trimmed.match(/^(\d+):(\d{1,2})$/);
    if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  }
  return null;
}

function posterOf(item: Record<string, unknown>): string | null {
  const thumbnails = asArray(item.thumbnails).map(href).filter(isHttpUrl);
  if (thumbnails.length) return thumbnails[0];
  for (const key of ['image', 'thumbnail', 'poster', 'still']) {
    const found = href(item[key]);
    if (isHttpUrl(found)) return found;
  }
  return null;
}

/** The clip's own ESPN page, wherever ESPN chose to hang it. */
function clipPage(item: Record<string, unknown>): string | null {
  const links = item.links;
  // The live payload keeps it at the top level as `web`; a nested copy under
  // `links.web` is accepted too.
  const holders = [
    item.web,
    links && !Array.isArray(links) && typeof links === 'object'
      ? (links as Record<string, unknown>).web
      : null,
  ];
  for (const holder of holders) {
    if (!holder || typeof holder !== 'object') continue;
    const record = holder as Record<string, unknown>;
    const found = href(record.href) ?? href(record.self) ?? href(record.link);
    if (isHttpUrl(found)) return found;
  }
  return null;
}

function pageOf(item: Record<string, unknown>, id: string | null): string | null {
  const page = clipPage(item);
  if (page) return page;

  for (const link of asArray(item.links)) {
    const record = (link ?? {}) as Record<string, unknown>;
    const rel = asArray(record.rel).map((value) => String(value).toLowerCase());
    const found = href(record.href);
    if (!isHttpUrl(found)) continue;
    // Prefer the clip's own page over a generic API link.
    if (rel.includes('summary') || /espn\.com\/video/i.test(found)) return found;
  }

  const web = [item.webpage, item.watchUrl, item.canonical].map(href).find(isHttpUrl);
  if (web) return web;
  return id ? `https://www.espn.com/video/clip/_/id/${id}` : null;
}

/**
 * Clips for one game, in ESPN's order. A clip survives only if it has a title
 * and either a media file or a page to watch it on.
 */
export function normalizeHighlights(payload: unknown, context: SportsHighlightContext): SportsHighlightClip[] {
  const clips: SportsHighlightClip[] = [];
  const seen = new Set<string>();

  for (const raw of videoList(payload)) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const id = text(item.id) ?? text(item.videoId) ?? text(item.guid);
    const title = text(item.title) ?? text(item.headline) ?? text(item.name) ?? text(item.shortTitle);
    if (!title) continue;
    const key = id ?? `${context.eventId}:${title.toLowerCase()}`;
    if (seen.has(key)) continue;

    const { mp4, hls } = mediaOf(item);
    const page = pageOf(item, id);
    if (!mp4 && !hls && !page) continue;
    seen.add(key);

    clips.push({
      id: id ?? key,
      title,
      description: text(item.description) ?? text(item.subtitle) ?? text(item.caption),
      duration: durationOf(item),
      thumbnail: posterOf(item),
      mp4,
      hls,
      page,
      // HLS needs Safari; everything else gets the ESPN page instead.
      playable: !!mp4,
      eventId: context.eventId,
      eventName: context.eventName,
      sport: context.sport,
      league: context.league,
      leagueName: context.leagueName,
      home: context.home,
      away: context.away,
      homeLogo: context.homeLogo,
      awayLogo: context.awayLogo,
      startAt: context.startAt,
      status: context.status,
      homeId: context.homeId ?? null,
      awayId: context.awayId ?? null,
    });
  }

  return clips;
}

/** Sample clips for when ESPN does not answer. No invented ESPN media URLs. */
export function bundledHighlights(): SportsHighlightClip[] {
  const clip = (over: Partial<SportsHighlightClip> & Pick<SportsHighlightClip, 'id' | 'title' | 'league' | 'leagueName' | 'eventName' | 'home' | 'away'>): SportsHighlightClip => ({
    description: null,
    duration: null,
    thumbnail: null,
    mp4: null,
    hls: null,
    page: null,
    playable: false,
    eventId: `sample-${over.id}`,
    sport: 'football',
    homeLogo: null,
    awayLogo: null,
    startAt: null,
    status: 'final',
    ...over,
  });

  return [
    clip({
      id: 'sample-epl', title: 'Premier League highlights', league: 'epl', leagueName: 'Premier League',
      eventName: 'Arsenal vs Chelsea', home: 'Arsenal', away: 'Chelsea', status: 'final',
      description: 'ESPN did not answer, so this is a sample card rather than a real clip.',
    }),
    clip({
      id: 'sample-ucl', title: 'Champions League highlights', league: 'ucl', leagueName: 'Champions League',
      eventName: 'Real Madrid vs Bayern Munich', home: 'Real Madrid', away: 'Bayern Munich', status: 'final',
      description: 'ESPN did not answer, so this is a sample card rather than a real clip.',
    }),
    clip({
      id: 'sample-nba', title: 'NBA highlights', league: 'nba', leagueName: 'NBA', sport: 'basketball',
      eventName: 'Boston Celtics vs Golden State Warriors', home: 'Boston Celtics', away: 'Golden State Warriors',
      description: 'ESPN did not answer, so this is a sample card rather than a real clip.',
    }),
    clip({
      id: 'sample-nfl', title: 'NFL highlights', league: 'nfl', leagueName: 'NFL', sport: 'american-football',
      eventName: 'Kansas City Chiefs vs Buffalo Bills', home: 'Kansas City Chiefs', away: 'Buffalo Bills',
      description: 'ESPN did not answer, so this is a sample card rather than a real clip.',
    }),
  ];
}
