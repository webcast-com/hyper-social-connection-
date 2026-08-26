import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getViewer } from '@/lib/viewer';
import { mimeAgreesWithSniff, sniffMedia } from '@/lib/magic-bytes';
import { maxBytesForKind } from '@/lib/media-limits';
import { getStorageDriver, putMediaObject } from '@/lib/storage';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Authenticated media upload.
 *
 * 1. Magic-byte sniff (declared Content-Type is not trusted).
 * 2. Persist via the storage adapter — Prisma Object Store / S3 when
 *    configured, otherwise local `public/uploads`.
 * 3. Return a stable `/uploads/<uuid>.<ext>` URL. Postgres stores that
 *    URL, never a presigned one.
 */
export async function POST(req: NextRequest) {
  try {
    const viewer = await getViewer();
    if (!viewer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string' || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffMedia(buffer);

    if (!sniffed) {
      return NextResponse.json(
        { error: 'File contents are not a recognized image or video. The file signature does not match.' },
        { status: 415 },
      );
    }

    if (!mimeAgreesWithSniff(file.type, sniffed)) {
      return NextResponse.json(
        { error: `File contents look like a ${sniffed.kind}, but the upload was labelled "${file.type || 'unknown'}".` },
        { status: 415 },
      );
    }

    const kind = sniffed.kind;
    const maxBytes = maxBytesForKind(kind);
    if (file.size > maxBytes) {
      const mb = Math.round(maxBytes / (1024 * 1024));
      return NextResponse.json({ error: `File too large. Max ${mb} MB for ${kind}s.` }, { status: 413 });
    }

    const filename = `${randomUUID()}.${sniffed.ext}`;
    const stored = await putMediaObject({
      filename,
      body: buffer,
      mime: sniffed.mime,
    });

    return NextResponse.json({
      url: stored.url,
      kind,
      type: sniffed.mime,
      size: file.size,
      name: file.name,
      storage: stored.driver,
    });
  } catch (error) {
    console.error('Upload error:', error);
    const driver = getStorageDriver();
    const hint =
      driver === 's3'
        ? 'Could not write to the object store. Check S3 / Prisma bucket credentials.'
        : 'Upload failed';
    return NextResponse.json({ error: hint }, { status: 500 });
  }
}

/** Lets the client (and /api/health consumers) see which backend will receive the next upload. */
export async function GET() {
  return NextResponse.json({
    storage: getStorageDriver(),
    maxImageBytes: maxBytesForKind('image'),
    maxVideoBytes: maxBytesForKind('video'),
  });
}
