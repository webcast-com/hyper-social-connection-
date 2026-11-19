import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chooseDatabaseUrl,
  databaseProvider,
  isPrismaPostgresUrl,
  isSupabaseUrl,
  prismaPostgresPaused,
} from '../../src/prisma/database-url';

const PRISMA = 'postgres://user:secret@pooled.db.prisma.io:5432/postgres?sslmode=require';
const PRISMA_DIRECT = 'postgres://user:secret@db.prisma.io:5432/postgres?sslmode=require';
const SUPABASE = 'postgresql://postgres.abcdefgh:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
const SUPABASE_SESSION = 'postgresql://postgres.abcdefgh:secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const LOCAL = 'postgres://postgres@127.0.0.1:55432/postgres';

test('DATABASE_URL is used when it is set', () => {
  assert.deepEqual(chooseDatabaseUrl({ DATABASE_URL: SUPABASE, POSTGRES_URL: SUPABASE_SESSION }), {
    url: SUPABASE,
    variable: 'DATABASE_URL',
    skipped: [],
  });
  assert.equal(chooseDatabaseUrl({ DATABASE_URL: `  ${LOCAL}  ` }).url, LOCAL);
});

test("the Supabase integration's variables are enough on their own", () => {
  assert.deepEqual(chooseDatabaseUrl({ POSTGRES_URL: SUPABASE, POSTGRES_URL_NON_POOLING: SUPABASE_SESSION }), {
    url: SUPABASE,
    variable: 'POSTGRES_URL',
    skipped: [],
  });
  assert.equal(chooseDatabaseUrl({ POSTGRES_PRISMA_URL: SUPABASE }).variable, 'POSTGRES_PRISMA_URL');
  assert.equal(chooseDatabaseUrl({ POSTGRES_URL_NON_POOLING: SUPABASE_SESSION }).variable, 'POSTGRES_URL_NON_POOLING');
  // The pooled string is for the site; the session one only when nothing else is set.
  assert.equal(chooseDatabaseUrl({ POSTGRES_URL_NON_POOLING: SUPABASE_SESSION, POSTGRES_URL: SUPABASE }).variable, 'POSTGRES_URL');
});

test('Prisma Postgres is paused: its address is passed over for Supabase', () => {
  // The repository's .env still says DATABASE_URL = Prisma, and the Supabase
  // integration adds POSTGRES_URL next to it.
  assert.deepEqual(chooseDatabaseUrl({ DATABASE_URL: PRISMA, POSTGRES_URL: SUPABASE }), {
    url: SUPABASE,
    variable: 'POSTGRES_URL',
    skipped: ['DATABASE_URL'],
  });
});

test('with only Prisma configured there is no database, and the reason is kept', () => {
  assert.deepEqual(chooseDatabaseUrl({ DATABASE_URL: PRISMA }), { url: null, variable: null, skipped: ['DATABASE_URL'] });
  assert.deepEqual(chooseDatabaseUrl({ DATABASE_URL: PRISMA_DIRECT, POSTGRES_URL: PRISMA }).skipped, ['DATABASE_URL', 'POSTGRES_URL']);
});

test('PRISMA_POSTGRES=on lifts the pause', () => {
  assert.equal(prismaPostgresPaused({}), true);
  assert.equal(prismaPostgresPaused({ PRISMA_POSTGRES: 'off' }), true);
  for (const value of ['on', 'ON', 'true', '1', 'yes']) {
    assert.equal(prismaPostgresPaused({ PRISMA_POSTGRES: value }), false, value);
  }
  assert.deepEqual(chooseDatabaseUrl({ DATABASE_URL: PRISMA, POSTGRES_URL: SUPABASE, PRISMA_POSTGRES: 'on' }), {
    url: PRISMA,
    variable: 'DATABASE_URL',
    skipped: [],
  });
});

test('nothing set, or only the Composer placeholder, is no database', () => {
  assert.deepEqual(chooseDatabaseUrl({}), { url: null, variable: null, skipped: [] });
  assert.deepEqual(chooseDatabaseUrl({ DATABASE_URL: '-', POSTGRES_URL: '   ' }), { url: null, variable: null, skipped: [] });
});

test('only real Prisma and Supabase hosts are recognised', () => {
  assert.equal(isPrismaPostgresUrl(PRISMA), true);
  assert.equal(isPrismaPostgresUrl(PRISMA_DIRECT), true);
  assert.equal(isPrismaPostgresUrl('postgres://u:p@db.prisma.io.example.com/postgres'), false);
  assert.equal(isPrismaPostgresUrl('postgres://u:p@notdb.prisma.io/postgres'), false);
  assert.equal(isPrismaPostgresUrl('postgres://db.prisma.io:p@example.com/postgres'), false, 'the user name is not the host');
  assert.equal(isPrismaPostgresUrl('not a url'), false);
  assert.equal(isSupabaseUrl(SUPABASE), true);
  assert.equal(isSupabaseUrl('postgresql://postgres:p@db.abcdefgh.supabase.co:5432/postgres'), true);
  assert.equal(isSupabaseUrl('postgres://u:p@supabase.com.example.org/postgres'), false);
});

test('the health report names the host, never the address', () => {
  assert.equal(databaseProvider(SUPABASE), 'supabase');
  assert.equal(databaseProvider(PRISMA), 'prisma');
  assert.equal(databaseProvider(LOCAL), 'local');
  assert.equal(databaseProvider('postgres://postgres@db:5432/postgres'), 'local');
  assert.equal(databaseProvider('postgres://u:p@ep-cool.eu-west-2.aws.neon.tech/neondb'), 'other');
});
