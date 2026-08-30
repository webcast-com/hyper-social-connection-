#!/usr/bin/env node
/**
 * s3-cors.mjs — allow browsers to upload directly to the object store.
 *
 * `/api/upload/presign` returns a presigned PUT that the browser sends
 * straight to the bucket. Cross-origin PUTs are blocked unless the bucket
 * allows the site's origin, so run this once per bucket (and again whenever
 * you add a domain):
 *
 *   npm run storage:cors
 *   npm run storage:cors -- https://my-domain.com https://staging.my-domain.com
 *
 * Reads S3_* / PRISMA_BUCKET_* from .env.local and .env.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';

// Load .env.local / .env manually — `dotenv/config` only reads `.env`.
for (const file of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    /* file is optional */
  }
}

const env = (...keys) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
};

const bucket = env('S3_BUCKET', 'PRISMA_BUCKET_NAME');
const accessKeyId = env('S3_ACCESS_KEY_ID', 'PRISMA_BUCKET_ACCESS_KEY_ID');
const secretAccessKey = env('S3_SECRET_ACCESS_KEY', 'PRISMA_BUCKET_SECRET_ACCESS_KEY');
const endpoint = env('S3_ENDPOINT', 'PRISMA_BUCKET_ENDPOINT');
const region = env('S3_REGION', 'PRISMA_BUCKET_REGION') || (endpoint ? 'auto' : 'us-east-1');

if (!bucket || !accessKeyId || !secretAccessKey) {
  console.error('✘ No object store configured (S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY).');
  console.error('  Nothing to do — uploads will use /api/upload instead.');
  process.exit(0);
}

const origins = process.argv.slice(2);
if (!origins.length) {
  const site = env('NEXT_PUBLIC_SITE_URL');
  if (site) origins.push(site);
  origins.push('http://localhost:3000');
}
// Preview deployments get a new host each time; wildcard keeps them working.
origins.push('https://*.vercel.app');

const client = new S3Client({
  endpoint: endpoint || undefined,
  region,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: env('S3_FORCE_PATH_STYLE') !== 'false',
});

try {
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [...new Set(origins)],
            AllowedMethods: ['PUT', 'GET', 'HEAD'],
            // Content-Type / Cache-Control / Content-Disposition are signed by
            // /api/upload/presign, so they must be allowed here too.
            AllowedHeaders: ['content-type', 'cache-control', 'content-disposition', 'x-amz-*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
  console.log(`✔ CORS updated on "${bucket}"`);
  console.log(`  allowed origins: ${[...new Set(origins)].join(', ')}`);
} catch (error) {
  console.error(`✘ Could not set CORS on "${bucket}":`, error?.message || error);
  console.error('  Set it in your provider console instead, or uploads will fall back to /api/upload.');
  process.exit(1);
}
