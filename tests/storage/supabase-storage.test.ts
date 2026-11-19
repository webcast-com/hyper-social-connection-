import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import {
  readSupabaseStorageConfig,
  supabaseCheckBucket,
  supabaseDeleteObject,
  supabaseKeyRole,
  supabaseMaxBytes,
  supabasePutObject,
  supabaseReadHead,
  supabaseSignedDownloadUrl,
  supabaseSignedUploadUrl,
  SupabaseStorageError,
  type SupabaseStorageConfig,
} from '../../src/lib/supabase-storage';
import {
  checkStorage,
  deleteMediaObject,
  getSignedDownloadUrl,
  getSignedUploadUrl,
  getStorageDriver,
  inspectMediaObject,
  maxUploadBytes,
  putMediaObject,
} from '../../src/lib/storage';
import { startFakeStorage, type FakeStorage } from './fake-supabase-storage';

const NAME = '3f2b8c1e-9d4a-4e6b-8a7c-1b2c3d4e5f60.png';
const KEY = `media/${NAME}`;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20000, 7)]);

// Signed with nothing: only the payload is read. Shapes of the two legacy keys.
const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.sig`;

let fake: FakeStorage;
let cfg: SupabaseStorageConfig;
const STORAGE_ENV = ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_STORAGE_BUCKET', 'SUPABASE_STORAGE_MAX_BYTES', 'STORAGE_DRIVER', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_ENDPOINT'];

before(async () => {
  fake = await startFakeStorage();
  cfg = { url: fake.url, key: fake.key, bucket: fake.bucket };
});
after(() => fake.close());
beforeEach(() => {
  fake.objects.clear();
  fake.requests.length = 0;
  fake.ignoreRange = false;
  for (const name of STORAGE_ENV) delete process.env[name];
});

function useSupabase() {
  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = fake.key;
}

test('the integration variables are enough, and either key name works', () => {
  assert.equal(readSupabaseStorageConfig({}), null);
  assert.equal(readSupabaseStorageConfig({ SUPABASE_URL: 'https://abc.supabase.co' }), null, 'a URL alone is not a configuration');
  assert.deepEqual(readSupabaseStorageConfig({ SUPABASE_URL: 'https://abc.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: jwt('service_role') }), {
    url: 'https://abc.supabase.co',
    key: jwt('service_role'),
    bucket: 'media',
  });
  const modern = readSupabaseStorageConfig({
    NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_abc',
    SUPABASE_SERVICE_ROLE_KEY: jwt('service_role'),
    SUPABASE_STORAGE_BUCKET: 'uploads',
  });
  assert.equal(modern?.key, 'sb_secret_abc', 'the newer secret key is preferred');
  assert.equal(modern?.bucket, 'uploads');
});

test('a public key is never used for storage', () => {
  assert.equal(supabaseKeyRole(jwt('anon')), 'public');
  assert.equal(supabaseKeyRole('sb_publishable_abc'), 'public');
  assert.equal(supabaseKeyRole(jwt('service_role')), 'secret');
  assert.equal(supabaseKeyRole('sb_secret_abc'), 'secret');
  assert.equal(readSupabaseStorageConfig({ SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SERVICE_ROLE_KEY: jwt('anon') }), null);
  assert.equal(readSupabaseStorageConfig({ SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_publishable_abc' }), null);
});

test('store, read back, link, delete', async () => {
  await supabasePutObject(cfg, { key: KEY, body: PNG, mime: 'image/png' });
  assert.deepEqual(fake.objects.get(KEY)?.body, PNG);
  assert.equal(fake.objects.get(KEY)?.type, 'image/png');
  assert.equal(fake.objects.get(KEY)?.cacheControl, 'max-age=31536000');

  const head = await supabaseReadHead(cfg, KEY, 8192);
  assert.equal(head?.size, PNG.length, 'the full size, not the size of the part read');
  assert.deepEqual(head?.head, PNG.subarray(0, 8192));

  const link = await supabaseSignedDownloadUrl(cfg, KEY, 3600);
  assert.ok(link?.startsWith(`${fake.url}/storage/v1/object/sign/media/${KEY}?token=`));
  // The link is all a browser has: no key goes with it.
  const got = await fetch(link!, { headers: { Range: 'bytes=0-7' } });
  assert.equal(got.status, 206);
  assert.deepEqual(Buffer.from(await got.arrayBuffer()), PNG.subarray(0, 8));

  await supabaseDeleteObject(cfg, KEY);
  assert.equal(fake.objects.has(KEY), false);
  await supabaseDeleteObject(cfg, KEY); // already gone: not an error
});

test('a missing object is "not there", not a failure', async () => {
  assert.equal(await supabaseSignedDownloadUrl(cfg, KEY, 3600), null);
  assert.equal(await supabaseReadHead(cfg, KEY, 8192), null);
});

test('the browser uploads through a link that carries no key and works once', async () => {
  const link = await supabaseSignedUploadUrl(cfg, KEY);
  assert.ok(link.startsWith(`${fake.url}/storage/v1/object/upload/sign/media/${KEY}?token=`));

  const put = await fetch(link, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: PNG });
  assert.equal(put.status, 200);
  assert.deepEqual(fake.objects.get(KEY)?.body, PNG);
  assert.equal(fake.requests.at(-1)?.withKey, false);

  const again = await fetch(link, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: Buffer.from('replaced') });
  assert.equal(again.ok, false, 'the same link cannot overwrite the file');
  assert.deepEqual(fake.objects.get(KEY)?.body, PNG);
});

test('the bucket refuses a type it does not list', async () => {
  const link = await supabaseSignedUploadUrl(cfg, KEY);
  const put = await fetch(link, { method: 'PUT', headers: { 'Content-Type': 'text/html' }, body: '<script>alert(1)</script>' });
  assert.equal(put.ok, false);
  assert.equal(fake.objects.has(KEY), false);
  await assert.rejects(supabasePutObject(cfg, { key: KEY, body: Buffer.from('x'), mime: 'text/html' }), SupabaseStorageError);
});

test('a store that ignores Range still yields only the head and the right size', async () => {
  await supabasePutObject(cfg, { key: KEY, body: PNG, mime: 'image/png' });
  fake.ignoreRange = true;
  const head = await supabaseReadHead(cfg, KEY, 8192);
  assert.equal(head?.head.length, 8192);
  assert.equal(head?.size, PNG.length);
});

test('the bucket check tells a wrong key from a missing bucket from an unreachable host', async () => {
  assert.deepEqual(await supabaseCheckBucket(cfg), { ok: true, public: false, fileSizeLimit: 50 * 1024 * 1024 });
  const wrongKey = await supabaseCheckBucket({ ...cfg, key: 'sb_secret_wrong' });
  assert.equal(wrongKey.ok === false && wrongKey.reason, 'key-rejected');
  const noBucket = await supabaseCheckBucket({ ...cfg, bucket: 'nope' });
  assert.equal(noBucket.ok === false && noBucket.reason, 'no-bucket');
  const down = await supabaseCheckBucket({ ...cfg, url: 'http://127.0.0.1:9' });
  assert.equal(down.ok === false && down.reason, 'unreachable');
});

test('Supabase is the driver as soon as it is configured, and STORAGE_DRIVER can say otherwise', () => {
  assert.equal(getStorageDriver(), 'local');
  process.env.S3_BUCKET = 'b';
  process.env.S3_ACCESS_KEY_ID = 'k';
  process.env.S3_SECRET_ACCESS_KEY = 's';
  assert.equal(getStorageDriver(), 's3');
  useSupabase();
  assert.equal(getStorageDriver(), 'supabase', 'Supabase comes before an S3 bucket');
  process.env.STORAGE_DRIVER = 's3';
  assert.equal(getStorageDriver(), 's3');
  process.env.STORAGE_DRIVER = 'local';
  assert.equal(getStorageDriver(), 'local');
  process.env.STORAGE_DRIVER = 'supabase';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.equal(getStorageDriver(), 's3', 'a driver that is not configured cannot be forced');
});

test('uploads are capped at what Supabase takes', () => {
  assert.equal(maxUploadBytes('video'), 250 * 1024 * 1024);
  useSupabase();
  assert.equal(maxUploadBytes('video'), 50 * 1024 * 1024);
  assert.equal(maxUploadBytes('image'), 15 * 1024 * 1024, 'already under the cap');
  process.env.SUPABASE_STORAGE_MAX_BYTES = String(500 * 1024 * 1024);
  assert.equal(supabaseMaxBytes(), 500 * 1024 * 1024);
  assert.equal(maxUploadBytes('video'), 250 * 1024 * 1024, "never above the app's own limit");
});

test('the storage adapter routes every operation to Supabase', async () => {
  useSupabase();

  const stored = await putMediaObject({ filename: NAME, body: PNG, mime: 'image/png' });
  assert.deepEqual(stored, { filename: NAME, url: `/uploads/${NAME}`, key: KEY, driver: 'supabase' });
  assert.deepEqual(fake.objects.get(KEY)?.body, PNG);

  const inspected = await inspectMediaObject(NAME);
  assert.equal(inspected?.size, PNG.length);
  assert.deepEqual(inspected?.head.subarray(0, 8), PNG.subarray(0, 8));

  const link = await getSignedDownloadUrl(NAME);
  assert.equal((await fetch(link!)).status, 200);

  const other = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.mp4';
  const upload = await getSignedUploadUrl({ filename: other, mime: 'video/mp4' });
  assert.deepEqual(upload?.headers, { 'Content-Type': 'video/mp4' });
  const put = await fetch(upload!.uploadUrl, { method: 'PUT', headers: upload!.headers, body: Buffer.from('....ftypisom') });
  assert.equal(put.status, 200);
  assert.equal(fake.objects.get(`media/${other}`)?.type, 'video/mp4');

  await deleteMediaObject(NAME);
  assert.equal(fake.objects.has(KEY), false);
  assert.equal(await getSignedDownloadUrl(NAME), null);
  assert.equal(await inspectMediaObject(NAME), null);

  assert.deepEqual(await checkStorage(), { driver: 'supabase', ok: true });
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_wrong';
  const broken = await checkStorage();
  assert.equal(broken.ok, false);
  assert.equal(broken.driver, 'supabase');
});
