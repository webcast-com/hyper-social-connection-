/**
 * Supabase Storage, spoken to over its REST API with the project's secret key.
 *
 * Only the server uses this, and only for media files (photos and videos
 * people upload). The browser never sees the key: it gets a signed URL that
 * lets it put one file, or read one file, and nothing else.
 *
 * No Supabase client library is involved. The calls are the handful below,
 * and each was tried against a real project:
 *
 *   POST   /object/{bucket}/{key}              store bytes
 *   POST   /object/upload/sign/{bucket}/{key}  → { url }       one-file upload link
 *   POST   /object/sign/{bucket}/{key}         → { signedURL } time-limited read link
 *   GET    /object/{bucket}/{key}  (Range)     read the first bytes back
 *   DELETE /object/{bucket}/{key}
 *   GET    /bucket/{bucket}                    does the bucket exist
 *
 * A missing object answers HTTP 400 with `"statusCode":"404"` in the body, so
 * "not found" is read from the body, not the status line.
 */

export type SupabaseStorageConfig = {
  /** `https://<project-ref>.supabase.co`, no trailing slash. */
  url: string;
  /** Secret (`sb_secret_…`) or legacy `service_role` key. Server-only. */
  key: string;
  bucket: string;
};

type Env = Record<string, string | undefined>;

export const DEFAULT_SUPABASE_BUCKET = 'media';
/** The per-file ceiling of Supabase's free plan. */
export const DEFAULT_SUPABASE_MAX_BYTES = 50 * 1024 * 1024;

const CONTROL_TIMEOUT_MS = 15_000;

function first(env: Env, ...names: string[]): string {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return '';
}

/**
 * Which role a key carries. Legacy keys are JWTs whose payload names the role;
 * the newer ones say it in their prefix.
 */
export function supabaseKeyRole(key: string): 'secret' | 'public' | 'unknown' {
  if (key.startsWith('sb_secret_')) return 'secret';
  if (key.startsWith('sb_publishable_')) return 'public';
  const payload = key.split('.')[1];
  if (!payload) return 'unknown';
  try {
    const role = (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { role?: unknown }).role;
    if (role === 'service_role') return 'secret';
    if (role === 'anon' || role === 'authenticated') return 'public';
  } catch {
    /* not a JWT */
  }
  return 'unknown';
}

/**
 * The variables the Supabase ↔ Vercel integration sets are read as they are:
 * `SUPABASE_URL` and `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`.
 *
 * A public key (anon / publishable) is refused: it cannot write to a private
 * bucket, and a setup that made it able to would open the bucket to everyone.
 */
export function readSupabaseStorageConfig(env: Env = process.env): SupabaseStorageConfig | null {
  const url = first(env, 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL').replace(/\/+$/, '');
  const key = first(env, 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  if (supabaseKeyRole(key) === 'public') return null;
  return { url, key, bucket: first(env, 'SUPABASE_STORAGE_BUCKET') || DEFAULT_SUPABASE_BUCKET };
}

/** Largest file the bucket takes; `SUPABASE_STORAGE_MAX_BYTES` raises it on a paid plan. */
export function supabaseMaxBytes(env: Env = process.env): number {
  const configured = Number(first(env, 'SUPABASE_STORAGE_MAX_BYTES'));
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_SUPABASE_MAX_BYTES;
}

function api(cfg: SupabaseStorageConfig, path: string): string {
  return `${cfg.url}/storage/v1${path}`;
}

function objectPath(cfg: SupabaseStorageConfig, key: string): string {
  return `${encodeURIComponent(cfg.bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function authHeaders(cfg: SupabaseStorageConfig): Record<string, string> {
  // Both, as Supabase's own client sends them: the gateway reads `apikey`,
  // the storage service reads the bearer token.
  return { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` };
}

type ApiError = { statusCode?: string; error?: string; message?: string; code?: string };

async function readError(response: Response): Promise<ApiError> {
  try {
    return (await response.json()) as ApiError;
  } catch {
    return {};
  }
}

function isNotFound(response: Response, body: ApiError): boolean {
  return response.status === 404 || body.statusCode === '404' || body.code === 'NoSuchKey' || body.error === 'not_found';
}

export class SupabaseStorageError extends Error {
  constructor(
    action: string,
    readonly status: number,
    readonly detail: ApiError,
  ) {
    super(`Supabase Storage could not ${action}: ${detail.message || detail.error || `HTTP ${status}`}`);
    this.name = 'SupabaseStorageError';
  }
}

/** Store bytes under `key`, replacing what is there. */
export async function supabasePutObject(
  cfg: SupabaseStorageConfig,
  opts: { key: string; body: Buffer; mime: string },
): Promise<void> {
  const response = await fetch(api(cfg, `/object/${objectPath(cfg, opts.key)}`), {
    method: 'POST',
    headers: {
      ...authHeaders(cfg),
      'Content-Type': opts.mime,
      'Cache-Control': 'max-age=31536000',
      'x-upsert': 'true',
    },
    body: new Uint8Array(opts.body),
  });
  if (!response.ok) throw new SupabaseStorageError('store the file', response.status, await readError(response));
}

/**
 * A link the browser can PUT one file to, with no key. It works once: a second
 * PUT to the same link is refused, so an upload cannot be swapped afterwards.
 * The bucket's list of allowed types decides which `Content-Type` it takes.
 */
export async function supabaseSignedUploadUrl(cfg: SupabaseStorageConfig, key: string): Promise<string> {
  const response = await fetch(api(cfg, `/object/upload/sign/${objectPath(cfg, key)}`), {
    method: 'POST',
    headers: { ...authHeaders(cfg), 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
  });
  if (!response.ok) throw new SupabaseStorageError('prepare the upload', response.status, await readError(response));
  const { url } = (await response.json()) as { url?: string };
  if (!url) throw new SupabaseStorageError('prepare the upload', response.status, { message: 'no upload URL in the answer' });
  return api(cfg, url);
}

/** A time-limited link to read `key`, or `null` when there is no such object. */
export async function supabaseSignedDownloadUrl(
  cfg: SupabaseStorageConfig,
  key: string,
  expiresInSeconds: number,
): Promise<string | null> {
  const response = await fetch(api(cfg, `/object/sign/${objectPath(cfg, key)}`), {
    method: 'POST',
    headers: { ...authHeaders(cfg), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
    signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = await readError(response);
    if (isNotFound(response, detail)) return null;
    throw new SupabaseStorageError('sign the file link', response.status, detail);
  }
  const { signedURL } = (await response.json()) as { signedURL?: string };
  return signedURL ? api(cfg, signedURL) : null;
}

/** The first `bytes` of an object and its full size, or `null` when it is missing. */
export async function supabaseReadHead(
  cfg: SupabaseStorageConfig,
  key: string,
  bytes: number,
): Promise<{ size: number; head: Buffer } | null> {
  const response = await fetch(api(cfg, `/object/${objectPath(cfg, key)}`), {
    headers: { ...authHeaders(cfg), Range: `bytes=0-${bytes - 1}` },
    signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = await readError(response);
    if (isNotFound(response, detail)) return null;
    throw new SupabaseStorageError('read the file back', response.status, detail);
  }

  // 206 carries "bytes 0-8191/123456". A 200 means the range was ignored and
  // the whole object is coming: take what is needed and drop the rest.
  const total = Number(response.headers.get('content-range')?.split('/')[1]);
  const length = Number(response.headers.get('content-length'));
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Buffer[] = [];
  let read = 0;
  while (read < bytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    read += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const head = Buffer.concat(chunks).subarray(0, bytes);
  const size = Number.isFinite(total) && total > 0 ? total : Number.isFinite(length) && length > 0 ? length : head.length;
  return { size, head };
}

/** Delete `key`. A missing object is not an error. */
export async function supabaseDeleteObject(cfg: SupabaseStorageConfig, key: string): Promise<void> {
  const response = await fetch(api(cfg, `/object/${objectPath(cfg, key)}`), {
    method: 'DELETE',
    headers: authHeaders(cfg),
    signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
  });
  if (response.ok) return;
  const detail = await readError(response);
  if (isNotFound(response, detail)) return;
  throw new SupabaseStorageError('delete the file', response.status, detail);
}

export type SupabaseBucketCheck =
  | { ok: true; public: boolean; fileSizeLimit: number | null }
  | { ok: false; reason: 'no-bucket' | 'key-rejected' | 'unreachable'; detail: string };

/** Asks Supabase for the bucket: proves the URL, the key and the bucket in one call. */
export async function supabaseCheckBucket(cfg: SupabaseStorageConfig): Promise<SupabaseBucketCheck> {
  let response: Response;
  try {
    response = await fetch(api(cfg, `/bucket/${encodeURIComponent(cfg.bucket)}`), {
      headers: authHeaders(cfg),
      signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    return { ok: false, reason: 'unreachable', detail: (error as Error)?.message || 'request failed' };
  }
  if (response.ok) {
    const bucket = (await response.json().catch(() => ({}))) as { public?: boolean; file_size_limit?: number | null };
    return { ok: true, public: bucket.public === true, fileSizeLimit: bucket.file_size_limit ?? null };
  }
  const detail = await readError(response);
  if (isNotFound(response, detail)) {
    return { ok: false, reason: 'no-bucket', detail: `there is no bucket named "${cfg.bucket}"` };
  }
  if (response.status === 401 || response.status === 403 || detail.statusCode === '401' || detail.statusCode === '403') {
    return { ok: false, reason: 'key-rejected', detail: detail.message || 'the key was not accepted' };
  }
  return { ok: false, reason: 'unreachable', detail: detail.message || `HTTP ${response.status}` };
}
