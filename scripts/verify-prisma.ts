import "dotenv/config";
import { closeDb, db } from "../src/lib/prisma";

/**
 * Connectivity check: performs one real read against the database.
 *   npx tsx scripts/verify-prisma.ts
 */
async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Add it to .env (see DATABASE.md).");
  }

  // One read through the typed client rather than a raw query, so it exercises
  // the emitted contract, the pg pool, and the migrated schema together.
  const users = await db.orm.public.User
    .include('posts', (rel) => rel.select('id', 'likesCount'))
    .orderBy((o) => o.id.asc())
    .all();

  console.log("✅ Connected");
  console.log(`   ${users.length} user(s) found:`);
  for (const u of users) {
    console.log(`   • ${u.name} <${u.email}> — ${u.posts.length} post(s)`);
  }
}

main()
  .then(async () => {
    await closeDb();
  })
  .catch(async (e) => {
    console.error("❌ Verification failed. Exact error:\n");
    console.error(e);
    await closeDb();
    process.exit(1);
  });
