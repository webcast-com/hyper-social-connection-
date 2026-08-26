/**
 * Shared upload limits and filename rules.
 *
 * Kept free of Node / server imports so the browser helper (`upload.ts`)
 * can fail-fast with the same numbers the API enforces.
 */

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_VIDEO_BYTES = 250 * 1024 * 1024; // 250 MB

export const MEDIA_EXTENSIONS = [
  'jpg',
  'png',
  'gif',
  'webp',
  'avif',
  'mp4',
  'mov',
  'webm',
  'ogv',
] as const;

export type MediaExtension = (typeof MEDIA_EXTENSIONS)[number];

export const MEDIA_MIME_BY_EXT: Record<MediaExtension, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  ogv: 'video/ogg',
};

/** UUID + sniffed extension — the only names we ever write or serve. */
const MEDIA_FILENAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|gif|webp|avif|mp4|mov|webm|ogv)$/i;

export function isSafeMediaFilename(name: string | null | undefined): name is string {
  if (!name) return false;
  return MEDIA_FILENAME_RE.test(name) && !name.includes('..') && !name.includes('/') && !name.includes('\\');
}

export function mediaKindFromExt(ext: string): 'image' | 'video' | null {
  const lower = ext.toLowerCase();
  if (lower === 'jpg' || lower === 'png' || lower === 'gif' || lower === 'webp' || lower === 'avif') {
    return 'image';
  }
  if (lower === 'mp4' || lower === 'mov' || lower === 'webm' || lower === 'ogv') {
    return 'video';
  }
  return null;
}

export function maxBytesForKind(kind: 'image' | 'video') {
  return kind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
}

export function clientRejectsFile(file: { type: string; size: number }): string | null {
  if (!file.size) return 'File is empty';
  const declaredKind = file.type.startsWith('image/')
    ? 'image'
    : file.type.startsWith('video/')
      ? 'video'
      : null;
  if (file.type && !declaredKind) {
    return 'Only images and videos can be uploaded.';
  }
  if (declaredKind && file.size > maxBytesForKind(declaredKind)) {
    const mb = Math.round(maxBytesForKind(declaredKind) / (1024 * 1024));
    return `File too large. Max ${mb} MB for ${declaredKind}s.`;
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return `File too large. Max ${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))} MB.`;
  }
  return null;
}
