import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getViewer } from '@/lib/viewer';
import {
  MEDIA_MIME_BY_EXT,
  maxBytesForKind,
  mediaKindFromExt,
  type MediaExtension,
} from '@/lib/media-limits';
import { getSignedUploadUrl, publicMediaUrl } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/upload/presign
 *
 * Reserves a filename and — when an object store is configured — returns a
 * presigned PUT so the browser can upload directly to storage. This is what
 * keeps photos and video working on platforms that cap request bodies
 * (Vercel allows 4.5 MB).
 *
 * Body:  { name: string; type: string; size: number }
 * Reply: { mode: 'presigned', uploadUrl, headers, filename, url }
 *        { mode: 'direct' }   ← no object store; post the file to /api/upload
 *
 * The declared type is checked here, but content is only trusted after
 * `/api/upload/verify` sniffs the stored bytes.
 */
export async function POST(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { name?: unknown; type?: unknown; size?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name : '';
  const declaredMime = typeof body.type === 'string' ? body.type : '';
  const size = Number(body.size);

  const declaredKind = declaredMime.startsWith('image/')
    ? 'image'
    : declaredMime.startsWith('video/')
      ? 'video'
      : null;
  if (!declaredKind) {
    return NextResponse.json({ error: 'Only images and videos can be uploaded.' }, { status: 415 });
  }
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: 'Invalid file size.' }, { status: 400 });
  }

  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const extKind = mediaKindFromExt(ext);
  if (!extKind || extKind !== declaredKind) {
    return NextResponse.json(
      { error: `Unsupported file extension ".${ext || '?'}".` },
      { status: 415 },
    );
  }

  const maxBytes = maxBytesForKind(declaredKind);
  if (size > maxBytes) {
    return NextResponse.json(
      { error: `File too large. Max ${Math.round(maxBytes / (1024 * 1024))} MB for ${declaredKind}s.` },
      { status: 413 },
    );
  }

  const filename = `${randomUUID()}.${ext as MediaExtension}`;
  const mime = MEDIA_MIME_BY_EXT[ext as MediaExtension];

  const signed = await getSignedUploadUrl({ filename, mime }).catch(() => null);
  if (!signed) {
    // No object store (local disk driver): the client posts the bytes to
    // /api/upload instead, which is fine up to the platform body limit.
    return NextResponse.json({ mode: 'direct' as const });
  }

  return NextResponse.json({
    mode: 'presigned' as const,
    uploadUrl: signed.uploadUrl,
    headers: signed.headers,
    filename,
    url: publicMediaUrl(filename),
    expiresIn: signed.expiresIn,
  });
}
