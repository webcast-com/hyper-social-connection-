import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { getViewer } from '@/lib/viewer';

export const runtime = 'nodejs';

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

const VIDEO_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
  'video/quicktime': 'mov',
};

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_VIDEO_BYTES = 250 * 1024 * 1024; // 250 MB

function sanitizeExt(ext: string) {
  return ext.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
}

/**
 * Media uploads are stored on local disk under public/uploads and served as
 * static files. No external storage service is required. (Swap this handler
 * for S3/R2 later if you need CDN-backed storage.)
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

    const kind = IMAGE_TYPES[file.type] ? 'image' : VIDEO_TYPES[file.type] ? 'video' : null;
    if (!kind) {
      return NextResponse.json(
        { error: `Unsupported file type "${file.type}". Upload an image or a video.` },
        { status: 415 },
      );
    }

    const maxBytes = kind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (file.size === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }
    if (file.size > maxBytes) {
      const mb = Math.round(maxBytes / (1024 * 1024));
      return NextResponse.json({ error: `File too large. Max ${mb} MB for ${kind}s.` }, { status: 413 });
    }

    const knownExt = kind === 'image' ? IMAGE_TYPES[file.type] : VIDEO_TYPES[file.type];
    const originalExt = file.name.includes('.') ? sanitizeExt(file.name.split('.').pop() || '') : '';
    const ext = knownExt || originalExt || 'bin';
    const filename = `${randomUUID()}.${ext}`;

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadsDir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadsDir, filename), buffer);

    return NextResponse.json({
      url: `/uploads/${filename}`,
      kind,
      type: file.type,
      size: file.size,
      name: file.name,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
