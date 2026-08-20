/**
 * Verification harness for sql/001_social_connection_schema.sql
 *
 * Runs the migration against a real in-process Postgres (PGlite) with a
 * minimal stand-in for the Supabase `auth` schema, then exercises the tables,
 * constraints, indexes, RLS policies and counter triggers.
 *
 *   node sql/__tests__/verify-schema.mjs
 *
 * Requires @electric-sql/pglite (dev-only, install with:
 *   npm i -D @electric-sql/pglite
 * ). This file is not imported by the app.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// PGlite is an on-demand dev dependency, not part of the app's package.json —
// nothing in the running application needs it.
let PGlite;
try {
  ({ PGlite } = await import('@electric-sql/pglite'));
} catch {
  console.error(
    '\nThis harness needs an in-process Postgres. Install it first:\n' +
    '  npm i --no-save @electric-sql/pglite\n');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = join(here, '..', '001_social_connection_schema.sql');
const sql = readFileSync(SQL_FILE, 'utf8');

let passed = 0;
let failed = 0;
const check = (name, ok, extra = '') => {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`);
  }
};

const fails = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e.message;
  }
};

// The migration wraps itself in BEGIN/COMMIT. When it aborts, the connection
// is left in a failed transaction — psql/supabase discard it, but PGlite keeps
// the session, so roll back explicitly before inspecting the database.
const failsScript = async (instance) => {
  const err = await fails(() => instance.exec(sql));
  await fails(() => instance.exec('ROLLBACK'));
  return err;
};

const db = new PGlite();

// --- Supabase auth stand-in ------------------------------------------------
// Real Supabase provides auth.users, auth.uid() and the `authenticated` role.
await db.exec(`
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  DO $$ BEGIN
    CREATE ROLE authenticated;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  GRANT USAGE ON SCHEMA public, auth TO authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
`);

console.log('\n1. Migration applies cleanly');
await db.exec(sql);
check('script runs without error', true);

console.log('\n2. Re-running is idempotent');
{
  const err = await fails(() => db.exec(sql));
  check('second run succeeds (IF NOT EXISTS / DROP POLICY IF EXISTS)', !err, err);
}

console.log('\n3. Tables and columns');
{
  const { rows } = await db.query(`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position`);
  const byTable = {};
  for (const r of rows) (byTable[r.table_name] ??= {})[r.column_name] = r;

  const expected = {
    profiles: { id: 'uuid', username: 'text', full_name: 'text', bio: 'text', avatar_url: 'text', created_at: 'timestamp with time zone', updated_at: 'timestamp with time zone' },
    posts: { id: 'uuid', user_id: 'uuid', content: 'text', image_url: 'text', likes_count: 'integer', comments_count: 'integer', created_at: 'timestamp with time zone' },
    connections: { id: 'uuid', follower_id: 'uuid', following_id: 'uuid', created_at: 'timestamp with time zone' },
    likes: { id: 'uuid', user_id: 'uuid', post_id: 'uuid', created_at: 'timestamp with time zone' },
    comments: { id: 'uuid', user_id: 'uuid', post_id: 'uuid', content: 'text', created_at: 'timestamp with time zone' },
  };
  for (const [table, cols] of Object.entries(expected)) {
    const actual = byTable[table];
    check(`table ${table} exists`, !!actual);
    if (!actual) continue;
    for (const [col, type] of Object.entries(cols)) {
      check(`  ${table}.${col} is ${type}`, actual[col]?.data_type === type, actual[col]?.data_type);
    }
  }
}

console.log('\n4. Indexes');
{
  const { rows } = await db.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`);
  const names = new Set(rows.map((r) => r.indexname));
  for (const idx of [
    'idx_profiles_username', 'idx_posts_user_id', 'idx_posts_created_at',
    'idx_connections_follower', 'idx_connections_following',
    'idx_likes_post_id', 'idx_likes_user_id', 'idx_comments_post_id',
  ]) check(idx, names.has(idx));
}

console.log('\n5. RLS enabled + policy count');
{
  const { rows } = await db.query(`
    SELECT c.relname, c.relrowsecurity,
           (SELECT count(*) FROM pg_policies p
             WHERE p.schemaname='public' AND p.tablename=c.relname) AS policies
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
      AND c.relname IN ('profiles','posts','connections','likes','comments')
    ORDER BY c.relname`);
  const expectedPolicies = { profiles: 3, posts: 4, connections: 3, likes: 3, comments: 4 };
  for (const r of rows) {
    check(`${r.relname}: RLS enabled`, r.relrowsecurity === true);
    check(`${r.relname}: ${expectedPolicies[r.relname]} policies`,
      Number(r.policies) === expectedPolicies[r.relname], `got ${r.policies}`);
  }
  check('profiles has no DELETE policy',
    !(await db.query(`SELECT 1 FROM pg_policies WHERE tablename='profiles' AND cmd='DELETE'`)).rows.length);
}

// --- seed two users --------------------------------------------------------
const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';
await db.exec(`INSERT INTO auth.users (id) VALUES ('${ALICE}'), ('${BOB}');`);

// Run `fn` as the given Supabase user: session-level SET ROLE (so RLS is
// enforced — the default PGlite user is a superuser that bypasses it) plus the
// JWT claim auth.uid() reads. Both must be session-level, not SET LOCAL:
// each exec() is its own implicit transaction.
const as = async (uid, fn) => {
  await db.exec(
    `SELECT set_config('request.jwt.claim.sub', '${uid}', false); SET ROLE authenticated;`);
  try { return await fn(); } finally { await db.exec(`RESET ROLE;`); }
};

// Sanity-check the harness itself: if RLS is not actually being enforced,
// every "user cannot …" assertion below would pass for the wrong reason.
{
  const who = await as(ALICE, () => db.query(
    `SELECT current_user AS role, auth.uid()::text AS uid`));
  check('[harness] queries run as the authenticated role',
    who.rows[0].role === 'authenticated', who.rows[0].role);
  check('[harness] auth.uid() resolves to the acting user',
    who.rows[0].uid === ALICE, who.rows[0].uid);
}

console.log('\n6. Constraints');
{
  await db.exec(`
    INSERT INTO profiles (id, username, full_name) VALUES
      ('${ALICE}', 'alice', 'Alice A'),
      ('${BOB}',   'bob',   'Bob B');`);
  check('profiles insert works', true);

  check('username is unique',
    !!(await fails(() => db.exec(`INSERT INTO auth.users (id) VALUES ('33333333-3333-3333-3333-333333333333');
      INSERT INTO profiles (id, username) VALUES ('33333333-3333-3333-3333-333333333333','alice');`))));

  check('profiles.id must reference auth.users',
    !!(await fails(() => db.exec(
      `INSERT INTO profiles (id, username) VALUES ('44444444-4444-4444-4444-444444444444','ghost')`))));

  check('connections rejects self-follow',
    !!(await fails(() => db.exec(
      `INSERT INTO connections (follower_id, following_id) VALUES ('${ALICE}','${ALICE}')`))));

  await db.exec(`INSERT INTO connections (follower_id, following_id) VALUES ('${ALICE}','${BOB}')`);
  check('connections unique(follower_id, following_id)',
    !!(await fails(() => db.exec(
      `INSERT INTO connections (follower_id, following_id) VALUES ('${ALICE}','${BOB}')`))));

  const { rows: [post] } = await db.query(
    `INSERT INTO posts (user_id, content) VALUES ('${BOB}','hello world') RETURNING id, likes_count, comments_count`);
  check('posts defaults: likes_count/comments_count = 0',
    post.likes_count === 0 && post.comments_count === 0);
  globalThis.POST = post.id;

  await db.exec(`INSERT INTO likes (user_id, post_id) VALUES ('${ALICE}','${POST}')`);
  check('likes unique(user_id, post_id)',
    !!(await fails(() => db.exec(
      `INSERT INTO likes (user_id, post_id) VALUES ('${ALICE}','${POST}')`))));
}

console.log('\n7. Counter triggers');
{
  const count = async () => (await db.query(
    `SELECT likes_count, comments_count FROM posts WHERE id='${POST}'`)).rows[0];

  check('likes_count = 1 after like', (await count()).likes_count === 1);

  await db.exec(`INSERT INTO comments (user_id, post_id, content) VALUES ('${ALICE}','${POST}','nice!')`);
  check('comments_count = 1 after comment', (await count()).comments_count === 1);

  await db.exec(`DELETE FROM likes WHERE user_id='${ALICE}' AND post_id='${POST}'`);
  check('likes_count = 0 after unlike', (await count()).likes_count === 0);

  await db.exec(`DELETE FROM comments WHERE post_id='${POST}'`);
  check('comments_count = 0 after comment delete', (await count()).comments_count === 0);

  // The important one: counters must work when RLS is active and the liker is
  // NOT the post author (needs SECURITY DEFINER on the trigger function).
  await as(ALICE, () => db.exec(
    `INSERT INTO likes (user_id, post_id) VALUES ('${ALICE}','${POST}')`));
  check('likes_count increments across RLS for a foreign post',
    (await count()).likes_count === 1);
  await as(ALICE, () => db.exec(
    `DELETE FROM likes WHERE user_id='${ALICE}' AND post_id='${POST}'`));
  check('likes_count decrements across RLS for a foreign post',
    (await count()).likes_count === 0);

  await db.exec(`UPDATE posts SET likes_count = 0 WHERE id='${POST}'`);
  await db.exec(`INSERT INTO likes (user_id, post_id) VALUES ('${BOB}','${POST}')`);
  await db.exec(`DELETE FROM likes WHERE user_id='${BOB}'`);
  await db.exec(`DELETE FROM likes WHERE post_id='${POST}'`);
  check('likes_count never goes negative (GREATEST guard)',
    (await count()).likes_count >= 0);
}

console.log('\n8. RLS behaviour');
{
  const { rows: [bobPost] } = await db.query(
    `SELECT id FROM posts WHERE user_id='${BOB}' LIMIT 1`);

  const totalProfiles = Number((await db.query('SELECT count(*)::int AS n FROM profiles')).rows[0].n);
  check('authenticated user can read all profiles',
    (await as(ALICE, () => db.query('SELECT id FROM profiles'))).rows.length === totalProfiles,
    `saw ${(await as(ALICE, () => db.query('SELECT id FROM profiles'))).rows.length} of ${totalProfiles}`);

  check('user cannot insert a profile for someone else',
    !!(await fails(() => as(ALICE, () => db.exec(
      `INSERT INTO profiles (id, username) VALUES ('${BOB}','impostor')`)))));

  await as(ALICE, () => db.exec(`UPDATE profiles SET bio='mine' WHERE id='${ALICE}'`));
  check('user can update own profile',
    (await db.query(`SELECT bio FROM profiles WHERE id='${ALICE}'`)).rows[0].bio === 'mine');

  await as(ALICE, () => db.exec(`UPDATE profiles SET bio='hacked' WHERE id='${BOB}'`));
  check("user cannot update someone else's profile",
    (await db.query(`SELECT bio FROM profiles WHERE id='${BOB}'`)).rows[0].bio !== 'hacked');

  await as(ALICE, () => db.exec(`DELETE FROM posts WHERE id='${bobPost.id}'`));
  check("user cannot delete someone else's post",
    (await db.query(`SELECT 1 FROM posts WHERE id='${bobPost.id}'`)).rows.length === 1);

  check('user cannot post as another user',
    !!(await fails(() => as(ALICE, () => db.exec(
      `INSERT INTO posts (user_id, content) VALUES ('${BOB}','forged')`)))));

  check('user cannot forge a connection from another user',
    !!(await fails(() => as(BOB, () => db.exec(
      `INSERT INTO connections (follower_id, following_id) VALUES ('${ALICE}','${BOB}')`)))));

  check('user cannot like as another user',
    !!(await fails(() => as(BOB, () => db.exec(
      `INSERT INTO likes (user_id, post_id) VALUES ('${ALICE}','${bobPost.id}')`)))));

  await as(BOB, () => db.exec(
    `INSERT INTO comments (user_id, post_id, content) VALUES ('${BOB}','${bobPost.id}','mine')`));
  await as(ALICE, () => db.exec(`DELETE FROM comments WHERE user_id='${BOB}'`));
  check("user cannot delete someone else's comment",
    (await db.query(`SELECT 1 FROM comments WHERE user_id='${BOB}'`)).rows.length === 1);

  await as(ALICE, () => db.exec(`DELETE FROM profiles WHERE id='${ALICE}'`));
  check('nobody can delete profiles (no DELETE policy)',
    (await db.query(`SELECT 1 FROM profiles WHERE id='${ALICE}'`)).rows.length === 1);
}

console.log('\n9. profiles.updated_at touch trigger');
{
  const before = (await db.query(`SELECT updated_at FROM profiles WHERE id='${BOB}'`)).rows[0].updated_at;
  await new Promise((r) => setTimeout(r, 10));
  await db.exec(`UPDATE profiles SET bio='touched' WHERE id='${BOB}'`);
  const after = (await db.query(`SELECT updated_at FROM profiles WHERE id='${BOB}'`)).rows[0].updated_at;
  check('updated_at advances on update', new Date(after) > new Date(before));
}

console.log('\n10. Cascades');
{
  const { rows: [p] } = await db.query(
    `INSERT INTO posts (user_id, content) VALUES ('${ALICE}','to be cascaded') RETURNING id`);
  await db.exec(`INSERT INTO likes (user_id, post_id) VALUES ('${BOB}','${p.id}')`);
  await db.exec(`INSERT INTO comments (user_id, post_id, content) VALUES ('${BOB}','${p.id}','bye')`);
  await db.exec(`DELETE FROM posts WHERE id='${p.id}'`);
  check('deleting a post cascades to its likes',
    (await db.query(`SELECT 1 FROM likes WHERE post_id='${p.id}'`)).rows.length === 0);
  check('deleting a post cascades to its comments',
    (await db.query(`SELECT 1 FROM comments WHERE post_id='${p.id}'`)).rows.length === 0);

  await db.exec(`DELETE FROM auth.users WHERE id='${ALICE}'`);
  check('deleting an auth user cascades to their profile',
    (await db.query(`SELECT 1 FROM profiles WHERE id='${ALICE}'`)).rows.length === 0);
  check('deleting an auth user cascades to their connections',
    (await db.query(`SELECT 1 FROM connections WHERE follower_id='${ALICE}'`)).rows.length === 0);
}

console.log('\n11. Preflight guards');
{
  // (a) no auth schema → refuse
  const bare = new PGlite();
  const errA = await failsScript(bare);
  check('aborts when auth.users is missing',
    !!errA && /Supabase auth schema/.test(errA), errA);
  await bare.close();

  // (b) app's Drizzle schema present (integer posts.id) → refuse
  const drizzleLike = new PGlite();
  await drizzleLike.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE TABLE users (id serial PRIMARY KEY, email text);
    CREATE TABLE posts (id serial PRIMARY KEY, user_id integer NOT NULL, content text NOT NULL);`);
  const errB = await failsScript(drizzleLike);
  check('aborts when the app\'s integer-id posts table exists',
    !!errB && /non-uuid primary key/.test(errB), errB);
  const survived = await drizzleLike.query(
    `SELECT data_type FROM information_schema.columns WHERE table_name='posts' AND column_name='id'`);
  check('app tables are left untouched after the abort',
    survived.rows[0].data_type === 'integer');
  const leftovers = await drizzleLike.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('profiles','connections')`);
  check('no partial objects created after the abort (transaction rolled back)',
    leftovers.rows.length === 0);
  await drizzleLike.close();
}

await db.close();

console.log(`\n${failed === 0 ? '✅ ALL CHECKS PASSED' : '❌ FAILURES'} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 1 * 0 : 1);
