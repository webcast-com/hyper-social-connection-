/**
 * Verification harness for the in-app social patches (src/db/social-ddl.ts).
 *
 * Builds this app's REAL integer-id tables (mirroring src/lib/migrate.ts),
 * seeds them the way src/lib/seed.ts does, then applies the exact same
 * SOCIAL_DDL array the running app applies — imported from the module itself,
 * so this can never drift from what ships.
 *
 *   npm i --no-save @electric-sql/pglite
 *   node --experimental-strip-types sql/__tests__/verify-app-social-ddl.mjs
 */
import { readFileSync } from 'node:fs';

let PGlite;
try {
  ({ PGlite } = await import('@electric-sql/pglite'));
} catch {
  console.error('\nNeeds an in-process Postgres:\n  npm i --no-save @electric-sql/pglite\n');
  process.exit(1);
}

// Import the real DDL the app runs (TypeScript, stripped by Node).
const { SOCIAL_DDL } = await import('../../src/db/social-ddl.ts');

let passed = 0, failed = 0;
const check = (name, ok, extra = '') => {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
};
const fails = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

const db = new PGlite();

// ── The app's real schema (subset), as created by src/lib/migrate.ts ───────
await db.exec(`
  CREATE TABLE users (
    id serial PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
    password text NOT NULL, avatar text, cover_photo text, bio text,
    created_at timestamp DEFAULT now() NOT NULL);
  CREATE TABLE posts (
    id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id),
    content text NOT NULL, image_url text, video_url text,
    privacy text DEFAULT 'public' NOT NULL, updated_at timestamp,
    created_at timestamp DEFAULT now() NOT NULL);
  CREATE TABLE comments (
    id serial PRIMARY KEY,
    post_id integer NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id integer NOT NULL REFERENCES users(id), content text NOT NULL,
    created_at timestamp DEFAULT now() NOT NULL);
  CREATE TABLE likes (
    id serial PRIMARY KEY,
    post_id integer NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id integer NOT NULL REFERENCES users(id),
    created_at timestamp DEFAULT now() NOT NULL);
`);

// Pre-existing data, including the exact corruption this fixes: duplicate
// likes (the select-then-insert race in toggleLike).
await db.exec(`
  INSERT INTO users (name,email,password) VALUES
    ('Alex Rivera','alex@example.com','x'),
    ('Maya Patel','maya@example.com','x'),
    ('Jordan Kim','jordan@other.com','x'),
    ('Collide One','dupe@a.com','x'),
    ('Collide Two','dupe@b.com','x'),
    ('No Email Local','@weird.com','x');
  INSERT INTO posts (user_id,content) VALUES (1,'first'),(2,'second'),(1,'third');
  INSERT INTO likes (post_id,user_id) VALUES
    (1,2),(1,2),(1,2),   -- triple duplicate
    (1,3),
    (2,1),(2,1),         -- double duplicate
    (3,2);
  INSERT INTO comments (post_id,user_id,content) VALUES
    (1,2,'nice'),(1,3,'great'),(2,1,'wow');
`);

const applyDdl = async () => {
  for (const stmt of SOCIAL_DDL) await db.exec(stmt);
};

console.log('\n1. DDL applies to a populated, pre-existing database');
{
  const err = await fails(applyDdl);
  check('all SOCIAL_DDL statements succeed', !err, err);
  check('DDL is a non-empty array', Array.isArray(SOCIAL_DDL) && SOCIAL_DDL.length > 0);
}

console.log('\n2. Idempotency (the app re-runs this on every cold boot)');
{
  const err = await fails(applyDdl);
  check('second full run succeeds', !err, err);
  const err3 = await fails(applyDdl);
  check('third full run succeeds', !err3, err3);
}

console.log('\n3. Duplicate likes removed, uniqueness enforced');
{
  const { rows } = await db.query(
    `SELECT post_id, user_id, count(*)::int AS n FROM likes
      GROUP BY post_id, user_id HAVING count(*) > 1`);
  check('no duplicate (post_id,user_id) pairs remain', rows.length === 0,
    JSON.stringify(rows));

  const { rows: kept } = await db.query(
    `SELECT count(*)::int AS n FROM likes WHERE post_id=1 AND user_id=2`);
  check('the deduplicated like is kept exactly once', kept[0].n === 1);

  const { rows: all } = await db.query(`SELECT count(*)::int AS n FROM likes`);
  check('distinct likes survive dedupe (7 rows -> 4)', all[0].n === 4, `got ${all[0].n}`);

  check('a new duplicate like is now rejected by the database',
    !!(await fails(() => db.exec(`INSERT INTO likes (post_id,user_id) VALUES (1,2)`))));

  const errOk = await fails(() => db.exec(`INSERT INTO likes (post_id,user_id) VALUES (3,1)`));
  check('a genuinely new like is still accepted', !errOk, errOk);
  await db.exec(`DELETE FROM likes WHERE post_id=3 AND user_id=1`);
}

console.log('\n4. users.username backfill');
{
  const { rows } = await db.query(`SELECT id,email,username FROM users ORDER BY id`);
  const byEmail = Object.fromEntries(rows.map(r => [r.email, r.username]));
  check('alex@example.com -> "alex"', byEmail['alex@example.com'] === 'alex', byEmail['alex@example.com']);
  check('maya@example.com -> "maya"', byEmail['maya@example.com'] === 'maya');
  check('colliding local-parts are de-collided',
    byEmail['dupe@a.com'] !== byEmail['dupe@b.com'],
    `${byEmail['dupe@a.com']} vs ${byEmail['dupe@b.com']}`);
  check('empty local-part is left NULL rather than blank',
    byEmail['@weird.com'] === null, String(byEmail['@weird.com']));

  const { rows: dup } = await db.query(
    `SELECT username, count(*)::int n FROM users WHERE username IS NOT NULL
      GROUP BY username HAVING count(*) > 1`);
  check('all backfilled usernames are unique', dup.length === 0, JSON.stringify(dup));

  check('duplicate username is rejected',
    !!(await fails(() => db.exec(`UPDATE users SET username='alex' WHERE id=2`))));

  // Multiple NULL usernames must stay allowed (partial unique index).
  const errNull = await fails(() => db.exec(
    `INSERT INTO users (name,email,password) VALUES ('N1','n1@x.com','x'),('N2','n2@x.com','x')`));
  check('multiple NULL usernames allowed (signup path unaffected)', !errNull, errNull);
  await db.exec(`DELETE FROM users WHERE email IN ('n1@x.com','n2@x.com')`);
}

console.log('\n5. Counters backfilled correctly from existing rows');
{
  const { rows } = await db.query(
    `SELECT id, likes_count, comments_count FROM posts ORDER BY id`);
  // post1: likes {2,3} = 2 after dedupe; comments 2
  // post2: likes {1}   = 1;              comments 1
  // post3: likes {2}   = 1;              comments 0
  check('post 1 counts = (2 likes, 2 comments)',
    rows[0].likes_count === 2 && rows[0].comments_count === 2,
    JSON.stringify(rows[0]));
  check('post 2 counts = (1 like, 1 comment)',
    rows[1].likes_count === 1 && rows[1].comments_count === 1,
    JSON.stringify(rows[1]));
  check('post 3 counts = (1 like, 0 comments)',
    rows[2].likes_count === 1 && rows[2].comments_count === 0,
    JSON.stringify(rows[2]));

  const { rows: agree } = await db.query(`
    SELECT count(*)::int AS n FROM posts p
     WHERE p.likes_count <> (SELECT count(*) FROM likes l WHERE l.post_id=p.id)
        OR p.comments_count <> (SELECT count(*) FROM comments c WHERE c.post_id=p.id)`);
  check('every cached count agrees with its source table', agree[0].n === 0);
}

console.log('\n6. Triggers keep counters live');
{
  const counts = async (id) => (await db.query(
    `SELECT likes_count l, comments_count c FROM posts WHERE id=${id}`)).rows[0];

  await db.exec(`INSERT INTO likes (post_id,user_id) VALUES (3,1)`);
  check('like insert increments', (await counts(3)).l === 2);
  await db.exec(`DELETE FROM likes WHERE post_id=3 AND user_id=1`);
  check('unlike decrements', (await counts(3)).l === 1);

  await db.exec(`INSERT INTO comments (post_id,user_id,content) VALUES (3,1,'hi')`);
  check('comment insert increments', (await counts(3)).c === 1);
  await db.exec(`DELETE FROM comments WHERE post_id=3 AND user_id=1`);
  check('comment delete decrements', (await counts(3)).c === 0);

  // The rejected duplicate must NOT bump the counter.
  const before = (await counts(1)).l;
  await fails(() => db.exec(`INSERT INTO likes (post_id,user_id) VALUES (1,2)`));
  check('a rejected duplicate like does not inflate the counter',
    (await counts(1)).l === before);

  // Cascade delete of a post removes children without underflow elsewhere.
  await db.exec(`INSERT INTO posts (user_id,content) VALUES (1,'temp')`);
  const { rows: [tmp] } = await db.query(`SELECT id FROM posts WHERE content='temp'`);
  await db.exec(`INSERT INTO likes (post_id,user_id) VALUES (${tmp.id},2)`);
  await db.exec(`DELETE FROM posts WHERE id=${tmp.id}`);
  const { rows: neg } = await db.query(
    `SELECT count(*)::int n FROM posts WHERE likes_count < 0 OR comments_count < 0`);
  check('no counter ever goes negative', neg[0].n === 0);
}

console.log('\n7. Reconciliation self-heals drift');
{
  await db.exec(`UPDATE posts SET likes_count = 999, comments_count = 42 WHERE id = 1`);
  await applyDdl();
  const { rows } = await db.query(`SELECT likes_count l, comments_count c FROM posts WHERE id=1`);
  check('a drifted row is repaired on next boot', rows[0].l === 2 && rows[0].c === 2,
    JSON.stringify(rows[0]));
}

console.log('\n8. Existing app behaviour preserved');
{
  // The feed reads post.likes as an ARRAY (liker faces + isLiked), so the
  // per-like rows must still be queryable, not replaced by a bare number.
  const { rows } = await db.query(
    `SELECT l.post_id, l.user_id, u.name FROM likes l JOIN users u ON u.id=l.user_id
      WHERE l.post_id=1 ORDER BY l.user_id`);
  check('per-like rows still exist for "Liked by …" avatars', rows.length === 2);
  check('liker identity still resolvable', rows[0].name === 'Maya Patel', rows[0].name);

  // Signup inserts without a username must keep working.
  const errSignup = await fails(() => db.exec(
    `INSERT INTO users (name,email,password) VALUES ('New Signup','new@example.com','hash')`));
  check('signup insert (no username column supplied) still works', !errSignup, errSignup);

  // A post insert that supplies no counters must default to 0, not fail.
  const errPost = await fails(() => db.exec(
    `INSERT INTO posts (user_id,content) VALUES (1,'no counters supplied')`));
  check('post insert without counters still works', !errPost, errPost);
  const { rows: np } = await db.query(
    `SELECT likes_count l, comments_count c FROM posts WHERE content='no counters supplied'`);
  check('new post counters default to 0', np[0].l === 0 && np[0].c === 0);

  // Columns the app selects must all still be present.
  const { rows: cols } = await db.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='posts'`);
  const names = new Set(cols.map(c => c.column_name));
  for (const c of ['id','user_id','content','image_url','video_url','privacy','updated_at','created_at'])
    check(`posts.${c} still present`, names.has(c));
}

await db.close();
console.log(`\n${failed === 0 ? '✅ ALL CHECKS PASSED' : '❌ FAILURES'} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
