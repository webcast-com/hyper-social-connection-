/**
 * Sending a post's video itself — the file, not a link to it.
 *
 * A link pasted into WhatsApp or Facebook shows a picture; the only thing that
 * plays there is a video that was sent as a video. A phone's own share menu can
 * be handed a file (`navigator.share({ files })`), so the share sheet offers
 * that for a member's own upload, and for nothing else:
 *
 * - only a file this site stores (`/uploads/…`), never a provider's clip;
 * - only a post anybody may read (`isPublicPost`, the rule the post page uses);
 * - only on a device that says it accepts a video file of that type.
 *
 * Pure apart from `fetchShareVideo`, which is given its `fetch` so it can be
 * driven in a test. No Node or server imports: this runs in the browser.
 */
import { MEDIA_MIME_BY_EXT, type MediaExtension } from './media-limits';
import { isPublicPost } from './structured-data';

/** The file behind a shared post's video: where it is, and what to call it. */
export type ShareVideo = {
  /** A path on this site, under `/uploads/`. */
  url: string;
  /** The name the receiving app is given. */
  fileName: string;
  /** Its MIME type, from its extension. */
  type: string;
};

/**
 * The largest file that is fetched to be sent. The whole video is held in the
 * phone's memory and paid for in mobile data twice (down, then up), so this
 * stays well under what a member may upload.
 */
export const MAX_SHARE_VIDEO_BYTES = 50 * 1024 * 1024;

const VIDEO_PATH = /^\/uploads\/[^/\\?#]+\.(mp4|mov|webm|ogv)$/i;

type SharedPost = {
  id?: number | string | null;
  videoUrl?: string | null;
  privacy?: string | null;
  scheduledAt?: Date | string | null;
  groupId?: number | null;
  user?: { profileVisibility?: string | null } | null;
  group?: { privacy?: string | null } | null;
};

/**
 * The video of this post that may leave the site as a file, or null.
 *
 * Anything not known to be public is not offered: a page that hands the card a
 * post without its privacy, its author's visibility or its group's privacy gets
 * no button, rather than a button that might send a private video.
 */
export function shareableVideo(post: SharedPost | null | undefined, now: Date = new Date()): ShareVideo | null {
  const url = typeof post?.videoUrl === 'string' ? post.videoUrl.trim() : '';
  const match = VIDEO_PATH.exec(url);
  if (!match || url.includes('..')) return null;
  if (!isPublicPost(post, now)) return null;
  // A group post handed over without its group is not known to be public.
  if (post?.groupId && post.group?.privacy !== 'public') return null;
  const ext = match[1].toLowerCase() as MediaExtension;
  const id = String(post?.id ?? '').replace(/[^0-9a-z-]/gi, '');
  return { url, fileName: `hyper-video${id ? `-${id}` : ''}.${ext}`, type: MEDIA_MIME_BY_EXT[ext] };
}

type ShareCapable = { share?: unknown; canShare?: (data?: { files?: File[] }) => boolean };

/**
 * Whether this device will take a video file of this type in its share menu.
 * Asked with an empty file of the same name and type, so nothing is fetched to
 * find out.
 */
export function deviceCanShareVideo(nav: ShareCapable | null | undefined, video: ShareVideo): boolean {
  if (!nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
  if (typeof File === 'undefined') return false;
  try {
    return nav.canShare({ files: [new File([], video.fileName, { type: video.type })] }) === true;
  } catch {
    return false;
  }
}

/**
 * iPhone and iPad hand every item to the receiving app separately, and an app
 * given a video and a line of text may keep only the text. There the video goes
 * alone, and the caption is put on the clipboard instead.
 */
export function sendsVideoAlone(nav: { userAgent?: string; platform?: string; maxTouchPoints?: number } | null | undefined): boolean {
  if (!nav) return false;
  if (/iPad|iPhone|iPod/.test(nav.userAgent || '')) return true;
  return nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1;
}

/** What the share menu is handed: the file, and the caption where it is kept. */
export function videoSharePayload(file: File, caption: string, alone: boolean): { files: File[]; text?: string } {
  return alone || !caption ? { files: [file] } : { files: [file], text: caption };
}

/** "3.1 MB", "12 MB": a size a person reads, not a byte count. */
export function formatMegabytes(bytes: number): string {
  const mb = Math.max(0, bytes) / (1024 * 1024);
  if (mb < 0.1) return 'under 0.1 MB';
  return `${mb < 10 ? (Math.round(mb * 10) / 10).toString() : Math.round(mb).toString()} MB`;
}

export type ShareVideoFailure = 'too_large' | 'failed';

/** Why a video could not be made ready. An aborted fetch is not one of these. */
export class ShareVideoError extends Error {
  reason: ShareVideoFailure;
  constructor(reason: ShareVideoFailure) {
    super(reason);
    this.name = 'ShareVideoError';
    this.reason = reason;
  }
}

export type ShareVideoProgress = { received: number; total: number | null };

const isAbort = (error: unknown) => (error as { name?: string } | null)?.name === 'AbortError';

/**
 * Fetches the video and returns it as a `File`.
 *
 * Stops as soon as the file is known to be over `maxBytes` — from its declared
 * length where there is one, otherwise while reading — so a video that cannot
 * be sent does not cost its whole download first. Throws `ShareVideoError`;
 * an abort is rethrown as it is, for the caller to ignore.
 */
export async function fetchShareVideo(video: ShareVideo, options: {
  signal?: AbortSignal;
  onProgress?: (progress: ShareVideoProgress) => void;
  fetchImpl?: typeof fetch;
  maxBytes?: number;
} = {}): Promise<File> {
  const { signal, onProgress, maxBytes = MAX_SHARE_VIDEO_BYTES } = options;
  const doFetch = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await doFetch(video.url, { signal, credentials: 'same-origin' });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new ShareVideoError('failed');
  }
  if (!response.ok) throw new ShareVideoError('failed');

  const declared = Number(response.headers.get('content-length'));
  const total = Number.isFinite(declared) && declared > 0 ? declared : null;
  if (total !== null && total > maxBytes) {
    void response.body?.cancel().catch(() => {});
    throw new ShareVideoError('too_large');
  }

  const parts: BlobPart[] = [];
  let received = 0;
  try {
    const reader = response.body?.getReader();
    if (reader) {
      onProgress?.({ received: 0, total });
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        received += value.byteLength;
        if (received > maxBytes) {
          void reader.cancel().catch(() => {});
          throw new ShareVideoError('too_large');
        }
        parts.push(value);
        onProgress?.({ received, total });
      }
    } else {
      const blob = await response.blob();
      received = blob.size;
      if (received > maxBytes) throw new ShareVideoError('too_large');
      parts.push(blob);
      onProgress?.({ received, total: total ?? received });
    }
  } catch (error) {
    if (error instanceof ShareVideoError || isAbort(error)) throw error;
    throw new ShareVideoError('failed');
  }
  if (received === 0) throw new ShareVideoError('failed');
  return new File(parts, video.fileName, { type: video.type });
}
