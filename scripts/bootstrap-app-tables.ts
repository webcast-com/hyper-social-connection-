/**
 * Create the tables, indexes and triggers the app normally creates on its
 * first request (src/lib/migrate.ts): the ones outside the Prisma schema, such
 * as sports picks and the group-call relay, and the counters' triggers.
 *
 * Run it after `npm run db:migrate` when the database has to be complete
 * before the site connects to it, as before copying data in.
 *
 *   DATABASE_URL=… npm run db:bootstrap
 *
 * DATABASE_URL must be set in the environment: the repository's .env files are
 * deliberately not read, since they name another database.
 */
import { closeDb, ensureDbConnection, rawQuery } from "../src/lib/prisma";
import { ensureMigrated } from "../src/lib/migrate";

async function main() {
  if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is not set.");
  if (!(await ensureDbConnection())) throw new Error("Could not connect to the database (see the line above).");

  await ensureMigrated();

  const [{ tables }] = await rawQuery<{ tables: bigint }>(
    "SELECT count(*) AS tables FROM pg_tables WHERE schemaname = 'public'",
  );
  const [{ triggers }] = await rawQuery<{ triggers: bigint }>(
    "SELECT count(*) AS triggers FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace",
  );
  console.log(`✅ The database has ${tables} table(s) and ${triggers} trigger(s) in "public".`);
}

main()
  .then(() => closeDb())
  .catch(async (error) => {
    console.error("❌ Bootstrap failed:\n");
    console.error(error);
    await closeDb().catch(() => {});
    process.exit(1);
  });
