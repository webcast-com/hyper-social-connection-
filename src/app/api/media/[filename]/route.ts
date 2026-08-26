import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { NextRequest, NextResponse } from 'next/server';
import { isSafeMediaFilename } from '@/lib/media-limits';
import { getSignedDownloadUrl, getStorageDriver, statLocalMedia } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ filename: string }> };

function parseRange(header: string | null, size: number) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
}

function streamFile(filePath: string, start?: number, end?: number) {
  const nodeStream =
    start !== undefined && end !== undefined
      ? createReadStream(filePath, { start, end })
      : createReadStream(filePath);
  return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
}

/**
 * Stable public URL for uploaded media.
 *
 * Local files (legacy or no-bucket mode) are streamed from disk with Range
 * support so video seeking works. Bucket objects 302 to a short-lived
 * presigned GET — the browser then talks to the object store directly.
 *
 * `/uploads/:filename` is rewritten here (see next.config.ts). Existing
 * rows that store `/uploads/…` keep working after a switch to a Prisma
 * bucket; we never put an expiring URL in Postgres.
 */
async function serve(req: NextRequest, filename: string, method: 'GET' | 'HEAD') {
  if (!isSafeMediaFilename(filename)) {
    return NextResponse.json({ error: 'Invalid media path' }, { status: 400 });
  }

  const local = await statLocalMedia(filename);
  if (local) {
    const range = parseRange(req.headers.get('range'), local.size);
    const headers = new Headers({
      'Content-Type': local.mime,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Disposition': 'inline',
    });

    if (range) {
      const length = range.end - range.start + 1;
      headers.set('Content-Range', `bytes ${range.start}-${range.end}/${local.size}`);
      headers.set('Content-Length', String(length));
      if (method === 'HEAD') return new NextResponse(null, { status: 206, headers });
      return new NextResponse(streamFile(local.path, range.start, range.end), { status: 206, headers });
    }

    headers.set('Content-Length', String(local.size));
    if (method === 'HEAD') return new NextResponse(null, { status: 200, headers });
    return new NextResponse(streamFile(local.path), { status: 200, headers });
  }

  if (getStorageDriver() === 's3') {
    const signed = await getSignedDownloadUrl(filename);
    if (!signed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    // Do not cache the redirect: the Location expires with the signature.
    return NextResponse.redirect(signed, {
      status: 302,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { filename } = await ctx.params;
  return serve(req, filename, 'GET');
}

export async function HEAD(req: NextRequest, ctx: RouteCtx) {
  const { filename } = await ctx.params;
  return serve(req, filename, 'HEAD');
}
