/**
 * Turns a plain link into something playable inside the app.
 *
 * `resolveLinkMedia` recognises three families of URL:
 *
 *   1. Direct media files (.mp4, .mp3, .jpg, …) — played with a native
 *      <video>/<audio>/<img> element, no third party involved.
 *   2. Known providers (YouTube, Vimeo, SoundCloud, Spotify, TikTok, Twitch,
 *      Dailymotion, Streamable) — played through the provider's own embed
 *      player in a sandboxed iframe, so the user never leaves the feed.
 *   3. Everything else — returns null, and the caller falls back to the
 *      existing link preview card. Nothing about that path changes.
 *
 * Only https (and protocol-relative) URLs are ever embedded; anything else is
 * rejected so a post can't smuggle in a javascript: or data: payload.
 */

export type LinkMediaKind = 'video' | 'audio' | 'image' | 'iframe';

export type LinkMedia = {
  kind: LinkMediaKind;
  /** URL to put in the <video>/<audio>/<img>/<iframe>. */
  src: string;
  /** Human-readable provider name shown on the player chrome. */
  provider: string;
  /** Poster/thumbnail, when the provider exposes a predictable one. */
  thumbnail?: string | null;
  /**
   * True when the embed should only be loaded after an explicit click.
   * Third-party iframes are heavy and set cookies, so they stay behind a
   * click-to-play facade.
   */
  requiresConsent?: boolean;
  /** Aspect ratio hint for the player box. */
  aspect?: 'video' | 'square' | 'audio';
  /** The original link, always kept so "open original" still works. */
  originalUrl: string;
};

const VIDEO_EXT = /\.(mp4|webm|ogv|ogm|m4v|mov)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus)(\?|#|$)/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|#|$)/i;

/** Accepts only http(s) URLs — everything else is unsafe to embed. */
function safeUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u;
  } catch {
    return null;
  }
}

/** Upgrades http:// to https:// so embeds aren't blocked as mixed content. */
function https(u: URL): string {
  return u.href.replace(/^http:\/\//i, 'https://');
}

function stripWww(host: string) {
  return host.replace(/^www\./i, '').toLowerCase();
}

/** Extracts a YouTube video id from any of its many URL shapes. */
export function youtubeId(u: URL): string | null {
  const host = stripWww(u.hostname);
  if (host === 'youtu.be') {
    const id = u.pathname.split('/').filter(Boolean)[0];
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v');
    if (v && /^[\w-]{11}$/.test(v)) return v;
    const parts = u.pathname.split('/').filter(Boolean);
    // /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
    if (parts.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(parts[0])) {
      return /^[\w-]{11}$/.test(parts[1]) ? parts[1] : null;
    }
  }
  return null;
}

function vimeoId(u: URL): string | null {
  if (stripWww(u.hostname) !== 'vimeo.com' && stripWww(u.hostname) !== 'player.vimeo.com') return null;
  const parts = u.pathname.split('/').filter(Boolean);
  const id = parts[0] === 'video' ? parts[1] : parts[0];
  return id && /^\d+$/.test(id) ? id : null;
}

/**
 * Resolves a URL to an in-app playable media descriptor, or null when the
 * link is an ordinary web page.
 */
export function resolveLinkMedia(rawUrl: string): LinkMedia | null {
  const u = safeUrl(rawUrl);
  if (!u) return null;

  const host = stripWww(u.hostname);
  const originalUrl = u.href;

  // ── YouTube (incl. Shorts, youtu.be, music) ────────────────────────────
  const yt = youtubeId(u);
  if (yt) {
    const start = u.searchParams.get('t') || u.searchParams.get('start');
    const seconds = start ? parseTimeParam(start) : 0;
    return {
      kind: 'iframe',
      // nocookie host keeps tracking off until the user actually plays.
      src: `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0&modestbranding=1${
        seconds ? `&start=${seconds}` : ''
      }`,
      provider: 'YouTube',
      thumbnail: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`,
      requiresConsent: true,
      aspect: 'video',
      originalUrl,
    };
  }

  // ── Vimeo ──────────────────────────────────────────────────────────────
  const vim = vimeoId(u);
  if (vim) {
    return {
      kind: 'iframe',
      src: `https://player.vimeo.com/video/${vim}?autoplay=1`,
      provider: 'Vimeo',
      thumbnail: null,
      requiresConsent: true,
      aspect: 'video',
      originalUrl,
    };
  }

  // ── Other well-known embeddable providers ──────────────────────────────
  if (host === 'dailymotion.com' || host === 'dai.ly') {
    const id =
      host === 'dai.ly'
        ? u.pathname.split('/').filter(Boolean)[0]
        : u.pathname.split('/').filter(Boolean).pop();
    if (id && /^[a-z0-9]+$/i.test(id)) {
      return {
        kind: 'iframe',
        src: `https://www.dailymotion.com/embed/video/${id}?autoplay=1`,
        provider: 'Dailymotion',
        requiresConsent: true,
        aspect: 'video',
        originalUrl,
      };
    }
  }

  if (host === 'streamable.com') {
    const id = u.pathname.split('/').filter(Boolean)[0];
    if (id && /^[a-z0-9]+$/i.test(id)) {
      return {
        kind: 'iframe',
        src: `https://streamable.com/e/${id}?autoplay=1`,
        provider: 'Streamable',
        requiresConsent: true,
        aspect: 'video',
        originalUrl,
      };
    }
  }

  if (host === 'twitch.tv') {
    const parts = u.pathname.split('/').filter(Boolean);
    // Twitch requires the embedding parent hostname, filled in by the player.
    if (parts[0] === 'videos' && parts[1]) {
      return {
        kind: 'iframe',
        src: `https://player.twitch.tv/?video=${parts[1]}&autoplay=true&parent=%%PARENT%%`,
        provider: 'Twitch',
        requiresConsent: true,
        aspect: 'video',
        originalUrl,
      };
    }
    if (parts[0]) {
      return {
        kind: 'iframe',
        src: `https://player.twitch.tv/?channel=${parts[0]}&autoplay=true&parent=%%PARENT%%`,
        provider: 'Twitch',
        requiresConsent: true,
        aspect: 'video',
        originalUrl,
      };
    }
  }

  if (host === 'tiktok.com') {
    const m = u.pathname.match(/\/video\/(\d+)/);
    if (m) {
      return {
        kind: 'iframe',
        src: `https://www.tiktok.com/embed/v2/${m[1]}`,
        provider: 'TikTok',
        requiresConsent: true,
        aspect: 'square',
        originalUrl,
      };
    }
  }

  if (host === 'soundcloud.com') {
    return {
      kind: 'iframe',
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(
        originalUrl,
      )}&auto_play=true&hide_related=true&visual=false`,
      provider: 'SoundCloud',
      requiresConsent: true,
      aspect: 'audio',
      originalUrl,
    };
  }

  if (host === 'open.spotify.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    const type = parts[0];
    const id = parts[1];
    if (id && ['track', 'album', 'playlist', 'episode', 'show', 'artist'].includes(type)) {
      return {
        kind: 'iframe',
        src: `https://open.spotify.com/embed/${type}/${id}`,
        provider: 'Spotify',
        requiresConsent: true,
        aspect: 'audio',
        originalUrl,
      };
    }
  }

  // ── Direct media files ─────────────────────────────────────────────────
  // Checked last so a provider page that happens to end in .mov is still
  // handled by its own embed above.
  const path = u.pathname;
  if (VIDEO_EXT.test(path)) {
    return { kind: 'video', src: https(u), provider: host, aspect: 'video', originalUrl };
  }
  if (AUDIO_EXT.test(path)) {
    return { kind: 'audio', src: https(u), provider: host, aspect: 'audio', originalUrl };
  }
  if (IMAGE_EXT.test(path)) {
    return { kind: 'image', src: https(u), provider: host, originalUrl };
  }

  return null;
}

/** Parses YouTube's `t` parameter ("90", "1m30s", "1h2m3s") into seconds. */
function parseTimeParam(value: string): number {
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  const m = value.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/i);
  if (!m) return 0;
  return (parseInt(m[1] || '0', 10) * 3600) + (parseInt(m[2] || '0', 10) * 60) + parseInt(m[3] || '0', 10);
}

/** True when a link can be played in-app — handy for cheap checks. */
export function isPlayableLink(url: string): boolean {
  return resolveLinkMedia(url) !== null;
}
