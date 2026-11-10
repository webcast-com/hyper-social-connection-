/**
 * ESPN match highlights, normalised into playable clips.
 *
 * ESPN publishes a game's highlight videos inside the game summary
 * (`/apis/site/v2/sports/{sport}/{league}/summary?event={id}`), which is the
 * endpoint the Site API documents for a single game. The video entries are not
 * part of any public contract, so this reader accepts the shapes ESPN is known
 * to send - a `videos` or `highlights` list, with the media URL on `source`,
 * on `playback` renditions, or on a `links` entry - and drops anything it
 * cannot turn into a clip with a poster and a way to watch it.
 *
 * Nothing here invents a URL: when ESPN gives no media file and no video page,
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
};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const text = (value: unknown): string | null => {
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

/** The summary keeps its videos under one of these keys, depending on sport. */
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

/** A media file ESPN can serve directly: MP4 first, HLS as a fallback. */
function mediaOf(item: Record<string, unknown>): { mp4: string | null; hls: string | null } {
  const mp4s: string[] = [];
  const hls: string[] = [];

  const source = (item.source ?? {}) as Record<string, unknown>;
  const sourceCandidates = [source.href, source.HLS, source.hls, source.mp4, source.url];
  for (const candidate of sourceCandidates) {
    const found = href(candidate);
    if (!isHttpUrl(found)) continue;
    if (/\.m3u8(\?|$)/i.test(found)) hls.push(found);
    else mp4s.push(found);
  }

  for (const rendition of asArray(item.playback ?? item.renditions ?? item.sources)) {
    const record = (rendition ?? {}) as Record<string, unknown>;
    const found = href(record.url) ?? href(record.href) ?? href(record.src);
    if (!isHttpUrl(found)) continue;
    if (/\.m3u8(\?|$)/i.test(found) || /hls/i.test(String(record.type ?? record.format ?? ''))) hls.push(found);
    else mp4s.push(found);
  }

  const direct = [item.file, item.url, item.mp4, item.videoUrl, item.contentUrl].map(href).filter(isHttpUrl);
  for (const found of direct) {
    if (/\.m3u8(\?|$)/i.test(found)) hls.push(found);
    else mp4s.push(found);
  }

  return { mp4: mp4s[0] ?? null, hls: hls[0] ?? null };
}

function pageOf(item: Record<string, unknown>, id: string | null): string | null {
  const links = asArray(item.links);
  for (const link of links) {
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
      id: 'sample-nfl', title: 'NFL highlights', league: 'nfl', leagueName: 'NFL', sport: 'football',
      eventName: 'Kansas City Chiefs vs Buffalo Bills', home: 'Kansas City Chiefs', away: 'Buffalo Bills',
      description: 'ESPN did not answer, so this is a sample card rather than a real clip.',
    }),
  ];
}
