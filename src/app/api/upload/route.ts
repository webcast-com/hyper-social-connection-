import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { getViewer } from '@/lib/viewer';
import { mimeAgreesWithSniff, sniffMedia } from '@/lib/magic-bytes';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_VIDEO_BYTES = 250 * 1024 * 1024; // 250 MB

/**
 * Media uploads are stored on local disk under public/uploads and served as
 * static files. No external storage service is required. (Swap this handler
 * for S3/R2 later if you need CDN-backed storage.)
 *
 * The file's magic bytes are the source of truth — a spoofed Content-Type
 * cannot turn an executable into an "image".
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
    const maxBytes = kind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (file.size > maxBytes) {
      const mb = Math.round(maxBytes / (1024 * 1024));
      return NextResponse.json({ error: `File too large. Max ${mb} MB for ${kind}s.` }, { status: 413 });
    }

    const ext = sniffed.ext;
    const filename = `${randomUUID()}.${ext}`;

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadsDir, { recursive: true });
    await writeFile(path.join(uploadsDir, filename), buffer);

    return NextResponse.json({
      url: `/uploads/${filename}`,
      kind,
      type: sniffed.mime,
      size: file.size,
      name: file.name,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
