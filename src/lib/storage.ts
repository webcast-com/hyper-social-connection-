import { createWriteStream } from 'node:fs';
import { access, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MEDIA_MIME_BY_EXT, type MediaExtension } from '@/lib/media-limits';

/**
 * Media storage adapter.
 *
 * Production: Prisma Object Store (or any S3-compatible bucket — R2, MinIO,
 * AWS S3). The file lives in the bucket; Postgres only stores the stable
 * app URL `/uploads/<uuid>.<ext>`.
 *
 * Local / demo: the same URL, file on disk under `public/uploads`.
 *
 * Never persist a presigned URL in the database — those expire. The media
 * route mints a fresh one on each request.
 */

export type StorageDriver = 's3' | 'local';

export type StoredObject = {
  filename: string;
  url: string;
  key: string;
  driver: StorageDriver;
};

const LOCAL_DIR = path.join(process.cwd(), 'public', 'uploads');
const OBJECT_PREFIX = 'media/';
const SIGNED_GET_TTL_SECONDS = 60 * 60; // 1 hour — enough for a video session
const SIGNED_PUT_TTL_SECONDS = 10 * 60; // 10 minutes to start the upload
/** Bytes read back from a stored object to sniff its real type. */
const SNIFF_BYTES = 8192;

function env(name: string, ...aliases: string[]) {
  for (const key of [name, ...aliases]) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
}

function readS3Config() {
  const bucket = env('S3_BUCKET', 'PRISMA_BUCKET_NAME');
  const accessKeyId = env('S3_ACCESS_KEY_ID', 'PRISMA_BUCKET_ACCESS_KEY_ID');
  const secretAccessKey = env('S3_SECRET_ACCESS_KEY', 'PRISMA_BUCKET_SECRET_ACCESS_KEY');
  const endpoint = env('S3_ENDPOINT', 'PRISMA_BUCKET_ENDPOINT');
  const region = env('S3_REGION', 'PRISMA_BUCKET_REGION') || (endpoint ? 'auto' : 'us-east-1');
  const forcePathStyleEnv = env('S3_FORCE_PATH_STYLE');
  const forcePathStyle = forcePathStyleEnv ? forcePathStyleEnv !== 'false' : Boolean(endpoint);

  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  return { bucket, accessKeyId, secretAccessKey, endpoint: endpoint || undefined, region, forcePathStyle };
}

let cachedClient: S3Client | null = null;
let cachedClientKey = '';

function getS3(): { client: S3Client; bucket: string } | null {
  const cfg = readS3Config();
  if (!cfg) return null;
  const key = `${cfg.bucket}|${cfg.endpoint || ''}|${cfg.region}|${cfg.accessKeyId}`;
  if (!cachedClient || cachedClientKey !== key) {
    cachedClient = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
      // Default ("WHEN_SUPPORTED") makes presigned PUTs carry
      // x-amz-checksum-crc32 / x-amz-sdk-checksum-algorithm, which the
      // browser never sends — S3 then rejects the upload. Only calculate
      // checksums when the operation genuinely requires them.
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
    cachedClientKey = key;
  }
  return { client: cachedClient, bucket: cfg.bucket };
}

export function getStorageDriver(): StorageDriver {
  return readS3Config() ? 's3' : 'local';
}

export function objectKeyFor(filename: string) {
  return `${OBJECT_PREFIX}${filename}`;
}

export function publicMediaUrl(filename: string) {
  return `/uploads/${filename}`;
}

export function localMediaPath(filename: string) {
  return path.join(LOCAL_DIR, filename);
}

export async function localMediaExists(filename: string) {
  try {
    await access(localMediaPath(filename));
    return true;
  } catch {
    return false;
  }
}

function extOf(filename: string): MediaExtension {
  return filename.split('.').pop()!.toLowerCase() as MediaExtension;
}

/**
 * Persist a sniffed media buffer. Writes to the object store when configured,
 * otherwise to `public/uploads`. Does not silently fall back — a configured
 * but failing bucket surfaces as an error so files are not "saved" onto an
 * ephemeral serverless disk.
 */
export async function putMediaObject(opts: {
  filename: string;
  body: Buffer;
  mime: string;
}): Promise<StoredObject> {
  const key = objectKeyFor(opts.filename);
  const url = publicMediaUrl(opts.filename);
  const s3 = getS3();

  if (s3) {
    await s3.client.send(
      new PutObjectCommand({
        Bucket: s3.bucket,
        Key: key,
        Body: opts.body,
        ContentType: opts.mime,
        CacheControl: 'public, max-age=31536000, immutable',
        ContentDisposition: 'inline',
      }),
    );
    return { filename: opts.filename, url, key, driver: 's3' };
  }

  await mkdir(LOCAL_DIR, { recursive: true });
  const dest = localMediaPath(opts.filename);
  await pipeline(Readable.from(opts.body), createWriteStream(dest));
  return { filename: opts.filename, url, key, driver: 'local' };
}

export async function statLocalMedia(filename: string) {
  try {
    const info = await stat(localMediaPath(filename));
    if (!info.isFile()) return null;
    return {
      path: localMediaPath(filename),
      size: info.size,
      mime: MEDIA_MIME_BY_EXT[extOf(filename)] || 'application/octet-stream',
    };
  } catch {
    return null;
  }
}

export type SignedUpload = {
  uploadUrl: string;
  /** Headers that were signed and MUST be sent verbatim by the client. */
  headers: Record<string, string>;
  expiresIn: number;
};

/**
 * Mint a presigned PUT so the browser can upload straight to the bucket.
 *
 * Serverless platforms cap request bodies (Vercel: 4.5 MB), which makes the
 * proxy-through-`/api/upload` path unusable for photos and video. With this
 * URL the bytes never touch a function — only the signature does.
 *
 * Returns `null` when no object store is configured (local disk driver), in
 * which case callers should fall back to posting the file to `/api/upload`.
 */
export async function getSignedUploadUrl(opts: {
  filename: string;
  mime: string;
}): Promise<SignedUpload | null> {
  const s3 = getS3();
  if (!s3) return null;

  // Only Content-Type is signed (and therefore enforced by storage), which
  // stops a client from pushing video bytes into an `.png` key. Cache-Control
  // and Content-Disposition are applied to the presigned GET in
  // getSignedDownloadUrl instead, so they do not need to be signed here.
  const headers = { 'Content-Type': opts.mime };

  const uploadUrl = await getSignedUrl(
    s3.client,
    new PutObjectCommand({
      Bucket: s3.bucket,
      Key: objectKeyFor(opts.filename),
      ContentType: opts.mime,
    }),
    { expiresIn: SIGNED_PUT_TTL_SECONDS, signableHeaders: new Set(['content-type']) },
  );

  return { uploadUrl, headers, expiresIn: SIGNED_PUT_TTL_SECONDS };
}

/**
 * Read back the head of a stored object (S3 or local) so its real type can be
 * sniffed *after* a direct-to-storage upload. Returns the object size too, so
 * oversized uploads can be rejected once they have landed.
 */
export async function inspectMediaObject(
  filename: string,
): Promise<{ size: number; head: Buffer } | null> {
  const s3 = getS3();

  if (!s3) {
    const info = await statLocalMedia(filename);
    if (!info) return null;
    const { open } = await import('node:fs/promises');
    const handle = await open(info.path, 'r');
    try {
      const head = Buffer.alloc(Math.min(SNIFF_BYTES, info.size));
      await handle.read(head, 0, head.length, 0);
      return { size: info.size, head };
    } finally {
      await handle.close();
    }
  }

  try {
    const result = await s3.client.send(
      new GetObjectCommand({
        Bucket: s3.bucket,
        Key: objectKeyFor(filename),
        Range: `bytes=0-${SNIFF_BYTES - 1}`,
      }),
    );
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) return null;
    const total = Number(result.ContentRange?.split('/')[1]) || bytes.length;
    return { size: total, head: Buffer.from(bytes) };
  } catch {
    return null;
  }
}

export async function getSignedDownloadUrl(filename: string): Promise<string | null> {
  const s3 = getS3();
  if (!s3) return null;
  const key = objectKeyFor(filename);
  try {
    await s3.client.send(new HeadObjectCommand({ Bucket: s3.bucket, Key: key }));
  } catch {
    return null;
  }
  return getSignedUrl(
    s3.client,
    new GetObjectCommand({
      Bucket: s3.bucket,
      Key: key,
      ResponseContentDisposition: 'inline',
      ResponseContentType: MEDIA_MIME_BY_EXT[extOf(filename)],
    }),
    { expiresIn: SIGNED_GET_TTL_SECONDS },
  );
}

export async function deleteMediaObject(filename: string) {
  const s3 = getS3();
  if (s3) {
    await s3.client.send(new DeleteObjectCommand({ Bucket: s3.bucket, Key: objectKeyFor(filename) }));
    return;
  }
  // Local deletes are best-effort; missing files are fine.
  try {
    const { unlink } = await import('node:fs/promises');
    await unlink(localMediaPath(filename));
  } catch {
    /* ignore */
  }
}
