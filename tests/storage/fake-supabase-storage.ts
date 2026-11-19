/**
 * A stand-in for Supabase Storage's REST API, for tests.
 *
 * Every answer here was copied from a real project (status codes, body shapes
 * and the quirks: errors come back as HTTP 400 with the real status inside the
 * body; an upload link works once; the bucket refuses types it does not list).
 * It implements only the calls src/lib/supabase-storage.ts makes.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';

export type FakeStorage = {
  url: string;
  key: string;
  bucket: string;
  objects: Map<string, { body: Buffer; type: string; cacheControl: string | null }>;
  /** Every request seen: "METHOD path" and whether it carried the secret key. */
  requests: { line: string; withKey: boolean; contentType: string | null }[];
  /** Answer ranged reads with the whole object, as a store without Range support would. */
  ignoreRange: boolean;
  close(): Promise<void>;
};

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/ogg',
];

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function startFakeStorage(
  opts: { bucket?: string; fileSizeLimit?: number; port?: number; key?: string; host?: string } = {},
): Promise<FakeStorage> {
  const bucket = opts.bucket ?? 'media';
  const fileSizeLimit = opts.fileSizeLimit ?? 50 * 1024 * 1024;
  const key = opts.key ?? `sb_secret_${randomUUID().replace(/-/g, '')}`;
  const objects: FakeStorage['objects'] = new Map();
  const requests: FakeStorage['requests'] = [];
  const uploadTokens = new Map<string, string>(); // token → object path
  const downloadTokens = new Map<string, string>();
  const state = { ignoreRange: false };

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify(body));
  };
  // The real service answers 400 on the wire and puts the real status here.
  const fail = (res: ServerResponse, statusCode: string, error: string, message: string, code: string) =>
    json(res, 400, { statusCode, error, message, code });
  const notFound = (res: ServerResponse) => fail(res, '404', 'not_found', 'Object not found', 'NoSuchKey');

  const store = (res: ServerResponse, path: string, body: Buffer, type: string | null, cacheControl: string | null, upsert: boolean) => {
    const mime = (type || 'application/octet-stream').split(';')[0].trim();
    if (!ALLOWED_TYPES.includes(mime)) {
      return fail(res, '415', 'invalid_mime_type', `mime type ${mime} is not supported`, 'InvalidMimeType');
    }
    if (body.length > fileSizeLimit) {
      return fail(res, '413', 'Payload too large', 'The object exceeded the maximum allowed size', 'EntityTooLarge');
    }
    if (objects.has(path) && !upsert) {
      return fail(res, '409', 'Duplicate', 'The resource already exists', 'KeyAlreadyExists');
    }
    objects.set(path, { body, type: mime, cacheControl });
    return json(res, 200, { Key: `${bucket}/${path}`, Id: randomUUID() });
  };

  const send = (req: IncomingMessage, res: ServerResponse, path: string) => {
    const object = objects.get(path);
    if (!object) return notFound(res);
    const size = object.body.length;
    const range = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range ?? ''));
    if (range && !state.ignoreRange) {
      const start = Number(range[1]);
      const end = Math.min(range[2] ? Number(range[2]) : size - 1, size - 1);
      res.writeHead(206, {
        'content-type': object.type,
        'content-range': `bytes ${start}-${end}/${size}`,
        'content-length': String(end - start + 1),
        'access-control-allow-origin': '*',
      });
      return res.end(object.body.subarray(start, end + 1));
    }
    res.writeHead(200, { 'content-type': object.type, 'content-length': String(size), 'access-control-allow-origin': '*' });
    return res.end(object.body);
  };

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake');
    const withKey = req.headers.apikey === key && req.headers.authorization === `Bearer ${key}`;
    requests.push({ line: `${req.method} ${url.pathname}`, withKey, contentType: req.headers['content-type'] ?? null });
    const body = await readBody(req);

    if (!url.pathname.startsWith('/storage/v1/')) return json(res, 404, { message: 'no Route matched with those values' });
    const path = url.pathname.slice('/storage/v1'.length);
    const prefix = (p: string) => (path.startsWith(`${p}/${bucket}/`) ? decodeURIComponent(path.slice(`${p}/${bucket}/`.length)) : null);

    // Links that carry their own token need no key.
    const uploadTo = prefix('/object/upload/sign');
    if (uploadTo !== null && req.method === 'PUT') {
      const token = url.searchParams.get('token') ?? '';
      if (uploadTokens.get(token) !== uploadTo) return fail(res, '400', 'InvalidJWT', 'Invalid Compact JWS', 'InvalidJWT');
      return store(res, uploadTo, body, req.headers['content-type'] ?? null, null, false);
    }
    const readFrom = prefix('/object/sign');
    if (readFrom !== null && req.method === 'GET') {
      const token = url.searchParams.get('token') ?? '';
      if (downloadTokens.get(token) !== readFrom) return fail(res, '400', 'InvalidJWT', 'Invalid Compact JWS', 'InvalidJWT');
      return send(req, res, readFrom);
    }

    // Everything else needs the secret key.
    if (!req.headers.authorization) {
      return fail(res, '400', 'Error', "headers must have required property 'authorization'", 'InvalidRequest');
    }
    if (!withKey) return fail(res, '403', 'Unauthorized', 'Invalid Compact JWS', 'AccessDenied');

    if (req.method === 'GET' && path.startsWith('/bucket/')) {
      if (path !== `/bucket/${bucket}`) return fail(res, '404', 'Bucket not found', 'Bucket not found', 'NoSuchBucket');
      return json(res, 200, { id: bucket, name: bucket, public: false, file_size_limit: fileSizeLimit, allowed_mime_types: ALLOWED_TYPES });
    }
    if (uploadTo !== null && req.method === 'POST') {
      const token = randomUUID();
      uploadTokens.set(token, uploadTo);
      return json(res, 200, { url: `/object/upload/sign/${bucket}/${uploadTo}?token=${token}` });
    }
    if (readFrom !== null && req.method === 'POST') {
      if (!objects.has(readFrom)) return notFound(res);
      const token = randomUUID();
      downloadTokens.set(token, readFrom);
      return json(res, 200, { signedURL: `/object/sign/${bucket}/${readFrom}?token=${token}` });
    }
    const object = prefix('/object');
    if (object !== null && req.method === 'POST') {
      return store(res, object, body, req.headers['content-type'] ?? null, String(req.headers['cache-control'] ?? '') || null, req.headers['x-upsert'] === 'true');
    }
    if (object !== null && req.method === 'GET') return send(req, res, object);
    if (object !== null && req.method === 'DELETE') {
      if (!objects.delete(object)) return notFound(res);
      return json(res, 200, { message: 'Successfully deleted' });
    }
    return json(res, 404, { statusCode: '404', error: 'Not Found', message: `Route ${req.method}:${path} not found` });
  });

  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, opts.host ?? '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    key,
    bucket,
    objects,
    requests,
    get ignoreRange() {
      return state.ignoreRange;
    },
    set ignoreRange(value: boolean) {
      state.ignoreRange = value;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
