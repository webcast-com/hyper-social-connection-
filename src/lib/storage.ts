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
import { MEDIA_MIME_BY_EXT, maxBytesForKind, type MediaExtension } from '@/lib/media-limits';
import {
  readSupabaseStorageConfig,
  supabaseCheckBucket,
  supabaseDeleteObject,
  supabaseMaxBytes,
  supabasePutObject,
  supabaseReadHead,
  supabaseSignedDownloadUrl,
  supabaseSignedUploadUrl,
  type SupabaseStorageConfig,
} from '@/lib/supabase-storage';

/**
 * Media storage adapter.
 *
 * Three places a file can live; Postgres only ever stores the stable app URL
 * `/uploads/<uuid>.<ext>`:
 *
 *   supabase  Supabase Storage, when `SUPABASE_URL` and a secret key are set
 *             (the Supabase ↔ Vercel integration sets both). The first choice.
 *   s3        Any S3-compatible bucket (Prisma Object Store, R2, MinIO, AWS S3),
 *             when `S3_BUCKET` and its keys are set.
 *   local     The same URL, file on disk under `public/uploads`.
 *
 * `STORAGE_DRIVER=supabase|s3|local` picks one by name instead.
 *
 * When Supabase is the driver and an S3 bucket is also configured, a file that
 * is not in Supabase is still looked for in the S3 bucket, so media uploaded
 * before the switch keeps loading. New files only go to Supabase.
 *
 * Never persist a presigned URL in the database — those expire. The media
 * route mints a fresh one on each request.
 */

export type StorageDriver = 'supabase' | 's3' | 'local';

export type StoredObject = {
  filename: string;
  url: string;
  key: string;
  driver: StorageDriver;
};

// `turbopackIgnore`: without it the build cannot tell which files under the
// working directory this reaches, so it copies the whole repository into the
// standalone server (.next/standalone). `public/` is shipped separately.
const LOCAL_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), 'public', 'uploads');
const OBJECT_PREFIX = 'media/';
const SIGNED_GET_TTL_SECONDS = 60 * 60; // 1 hour — enough for a video session
const SIGNED_PUT_TTL_SECONDS = 10 * 60; // 10 minutes to start the upload
/** How long Supabase keeps an upload link valid. It is fixed on their side. */
const SUPABASE_PUT_TTL_SECONDS = 2 * 60 * 60;
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

function getSupabase(): SupabaseStorageConfig | null {
  return readSupabaseStorageConfig();
}

export function getStorageDriver(): StorageDriver {
  const forced = env('STORAGE_DRIVER').toLowerCase();
  if (forced === 'local') return 'local';
  if (forced === 'supabase' && getSupabase()) return 'supabase';
  if (forced === 's3' && readS3Config()) return 's3';
  if (getSupabase()) return 'supabase';
  return readS3Config() ? 's3' : 'local';
}

/** The stores to use, already narrowed to the active driver. */
function active(): { driver: 'supabase'; supabase: SupabaseStorageConfig } | { driver: 's3'; s3: NonNullable<ReturnType<typeof getS3>> } | { driver: 'local' } {
  const driver = getStorageDriver();
  if (driver === 'supabase') return { driver, supabase: getSupabase()! };
  if (driver === 's3') return { driver, s3: getS3()! };
  return { driver: 'local' };
}

/**
 * Largest upload the active store takes. Supabase's free plan stops at 50 MB a
 * file, well under this app's own 250 MB video limit, so the smaller wins.
 */
export function maxUploadBytes(kind: 'image' | 'video'): number {
  const own = maxBytesForKind(kind);
  return getStorageDriver() === 'supabase' ? Math.min(own, supabaseMaxBytes()) : own;
}

/** Supabase is half configured: say what is missing, in words for the health report. */
function supabaseNotUsedBecause(): string | null {
  if (env('STORAGE_DRIVER')) return null; // chosen by name
  const url = env('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
  const key = env('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url && !key) return null;
  if (!url) return 'Supabase Storage is not used: a Supabase key is set but SUPABASE_URL is not';
  if (!key) return 'Supabase Storage is not used: SUPABASE_URL is set but SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY is not';
  return 'Supabase Storage is not used: the key that is set is a public (anon / publishable) key; it needs the secret one';
}

export type StorageCheck = { driver: StorageDriver; ok: boolean; detail?: string };

/** Whether the active store answers. One small request; nothing is written. */
export async function checkStorage(): Promise<StorageCheck> {
  const store = active();
  if (store.driver === 'supabase') {
    const result = await supabaseCheckBucket(store.supabase);
    return result.ok ? { driver: 'supabase', ok: true } : { driver: 'supabase', ok: false, detail: result.detail };
  }
  // The S3 and local drivers are not probed here: S3 has no free "does it
  // answer" call that every provider allows, and the disk is always there.
  // What can be said is why Supabase is not the driver when it was meant to be.
  const detail = supabaseNotUsedBecause();
  return detail ? { driver: store.driver, ok: true, detail } : { driver: store.driver, ok: true };
}

export function objectKeyFor(filename: string) {
  return `${OBJECT_PREFIX}${filename}`;
}

export function publicMediaUrl(filename: string) {
  return `/uploads/${filename}`;
}

export function localMediaPath(filename: string) {
  return path.join(/* turbopackIgnore: true */ LOCAL_DIR, filename);
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
  const store = active();

  if (store.driver === 'supabase') {
    await supabasePutObject(store.supabase, { key, body: opts.body, mime: opts.mime });
    return { filename: opts.filename, url, key, driver: 'supabase' };
  }

  if (store.driver === 's3') {
    const s3 = store.s3;
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
  await pipeline(Readable.from(opts.body), createWriteStream(/* turbopackIgnore: true */ dest));
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
  const store = active();
  if (store.driver === 'local') return null;

  if (store.driver === 'supabase') {
    // Nothing is signed into the link but the object key. The type is held to
    // the bucket's list of allowed types, and /api/upload/verify reads the
    // stored bytes back and deletes anything that is not what its name says.
    const uploadUrl = await supabaseSignedUploadUrl(store.supabase, objectKeyFor(opts.filename));
    return { uploadUrl, headers: { 'Content-Type': opts.mime }, expiresIn: SUPABASE_PUT_TTL_SECONDS };
  }

  const s3 = store.s3;

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
  const store = active();

  if (store.driver === 'supabase') {
    return supabaseReadHead(store.supabase, objectKeyFor(filename), SNIFF_BYTES).catch(() => null);
  }

  const s3 = store.driver === 's3' ? store.s3 : null;

  if (!s3) {
    const info = await statLocalMedia(filename);
    if (!info) return null;
    const { open } = await import('node:fs/promises');
    const handle = await open(/* turbopackIgnore: true */ info.path, 'r');
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
  const store = active();
  if (store.driver === 'local') return null;
  const key = objectKeyFor(filename);

  if (store.driver === 'supabase') {
    const signed = await supabaseSignedDownloadUrl(store.supabase, key, SIGNED_GET_TTL_SECONDS).catch((error) => {
      console.warn('[storage] Supabase could not sign a media link:', (error as Error)?.message);
      return null;
    });
    if (signed) return signed;
  }

  // Either S3 is the driver, or Supabase is and did not have the file: a file
  // uploaded before the switch may still be in the S3 bucket.
  const s3 = store.driver === 's3' ? store.s3 : getS3();
  if (!s3) return null;
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
  const store = active();
  if (store.driver === 'supabase') {
    await supabaseDeleteObject(store.supabase, objectKeyFor(filename));
    return;
  }
  const s3 = store.driver === 's3' ? store.s3 : null;
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
