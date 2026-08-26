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
