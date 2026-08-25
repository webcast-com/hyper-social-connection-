/**
 * File-signature (magic-byte) sniffing for media uploads.
 *
 * The browser-supplied MIME type is attacker-controlled. We only accept a
 * file when its leading bytes match a known image or video container.
 */

export type SniffedMedia = {
  kind: 'image' | 'video';
  ext: string;
  mime: string;
};

function ascii(buf: Buffer, start: number, end: number) {
  return buf.toString('ascii', start, end);
}

function hasPrefix(buf: Buffer, bytes: number[]) {
  if (buf.length < bytes.length) return false;
  return bytes.every((b, i) => buf[i] === b);
}

/** ISO Base Media File Format brands we treat as AVIF stills. */
const AVIF_BRANDS = new Set(['avif', 'avis', 'MA1A', 'MA1B']);

/** ISO BMFF brands we treat as QuickTime / MOV. */
const QT_BRANDS = new Set(['qt  ']);

/**
 * Identify a buffer from its magic bytes. Returns null when the file is not
 * a supported image or video.
 */
export function sniffMedia(buf: Buffer): SniffedMedia | null {
  if (!buf || buf.length < 12) return null;

  // PNG  \x89PNG\r\n\x1a\n
  if (hasPrefix(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { kind: 'image', ext: 'png', mime: 'image/png' };
  }

  // JPEG  FF D8 FF
  if (hasPrefix(buf, [0xff, 0xd8, 0xff])) {
    return { kind: 'image', ext: 'jpg', mime: 'image/jpeg' };
  }

  // GIF87a / GIF89a
  const gif = ascii(buf, 0, 6);
  if (gif === 'GIF87a' || gif === 'GIF89a') {
    return { kind: 'image', ext: 'gif', mime: 'image/gif' };
  }

  // WEBP  RIFF....WEBP
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') {
    return { kind: 'image', ext: 'webp', mime: 'image/webp' };
  }

  // Ogg container (Theora / other video)
  if (ascii(buf, 0, 4) === 'OggS') {
    return { kind: 'video', ext: 'ogv', mime: 'video/ogg' };
  }

  // EBML (WebM / Matroska)
  if (hasPrefix(buf, [0x1a, 0x45, 0xdf, 0xa3])) {
    const head = buf.subarray(0, Math.min(buf.length, 256)).toString('binary');
    if (head.includes('matroska')) return null; // MKV is not in the allow-list
    return { kind: 'video', ext: 'webm', mime: 'video/webm' };
  }

  // ISO Base Media File Format: size(4) + 'ftyp' + major brand(4)
  if (ascii(buf, 4, 8) === 'ftyp') {
    const major = ascii(buf, 8, 12);
    const compat = ascii(buf, 16, Math.min(buf.length, 80));
    const brands = `${major} ${compat}`;

    if (AVIF_BRANDS.has(major) || brands.includes('avif') || brands.includes('avis')) {
      return { kind: 'image', ext: 'avif', mime: 'image/avif' };
    }
    if (QT_BRANDS.has(major) || brands.includes('qt  ')) {
      return { kind: 'video', ext: 'mov', mime: 'video/quicktime' };
    }
    // isom / iso2 / mp41 / mp42 / dash / M4V / avc1 / …
    return { kind: 'video', ext: 'mp4', mime: 'video/mp4' };
  }

  return null;
}

/**
 * True when the client-declared MIME is compatible with what we sniffed.
 * Same kind (image vs video) is required; a JPEG labelled as PNG is OK
 * because the sniffed type wins for storage.
 */
export function mimeAgreesWithSniff(declaredMime: string, sniffed: SniffedMedia) {
  if (!declaredMime) return true;
  const declaredKind = declaredMime.startsWith('image/')
    ? 'image'
    : declaredMime.startsWith('video/')
      ? 'video'
      : null;
  if (!declaredKind) return false;
  return declaredKind === sniffed.kind;
}
