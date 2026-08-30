import { NextRequest, NextResponse } from 'next/server';
import { getViewer } from '@/lib/viewer';
import { isSafeMediaFilename, maxBytesForKind } from '@/lib/media-limits';
import { sniffMedia } from '@/lib/magic-bytes';
import { deleteMediaObject, getStorageDriver, inspectMediaObject, publicMediaUrl } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/upload/verify
 *
 * Confirms a direct-to-storage upload is what it claims to be. The bytes no
 * longer pass through the server, so this is where the magic-byte sniff that
 * used to run in `/api/upload` now happens: read back the head of the object,
 * sniff it, and delete it immediately when it is not a real image/video or
 * does not match the reserved extension.
 *
 * Body:  { filename: string }
 * Reply: { url, kind, type, size, storage } on success
 */
export async function POST(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let filename: unknown;
  try {
    ({ filename } = (await req.json()) as { filename?: unknown });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (typeof filename !== 'string' || !isSafeMediaFilename(filename)) {
    return NextResponse.json({ error: 'Invalid filename.' }, { status: 400 });
  }

  const stored = await inspectMediaObject(filename);
  if (!stored) {
    return NextResponse.json({ error: 'Upload not found.' }, { status: 404 });
  }

  const sniffed = sniffMedia(stored.head);
  if (!sniffed) {
    await deleteMediaObject(filename).catch(() => undefined);
    return NextResponse.json(
      { error: 'File contents are not a recognized image or video.' },
      { status: 415 },
    );
  }

  const declaredExt = filename.split('.').pop()!.toLowerCase();
  if (sniffed.ext !== declaredExt) {
    await deleteMediaObject(filename).catch(() => undefined);
    return NextResponse.json(
      { error: `File contents look like a ${sniffed.ext}, not a ${declaredExt}.` },
      { status: 415 },
    );
  }

  if (stored.size > maxBytesForKind(sniffed.kind)) {
    await deleteMediaObject(filename).catch(() => undefined);
    return NextResponse.json(
      { error: `File too large. Max ${Math.round(maxBytesForKind(sniffed.kind) / (1024 * 1024))} MB.` },
      { status: 413 },
    );
  }

  return NextResponse.json({
    url: publicMediaUrl(filename),
    kind: sniffed.kind,
    type: sniffed.mime,
    size: stored.size,
    storage: getStorageDriver(),
  });
}
