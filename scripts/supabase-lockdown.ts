import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { poolConfig } from "../src/prisma/tls";

/**
 * Runs prisma/supabase-lockdown.sql against DATABASE_URL, then fails if any
 * table in `public` is still granted to a Supabase Data API role.
 *   npm run db:lockdown
 */
async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set. See DATABASE.md.");

  const pool = new Pool(poolConfig(url));
  try {
    await pool.query(readFileSync(join(process.cwd(), "prisma", "supabase-lockdown.sql"), "utf8"));

    const { rows } = await pool.query<{ table: string; role: string }>(`
      SELECT c.relname AS "table", r.rolname AS role
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_roles r ON r.rolname IN ('anon', 'authenticated')
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p', 'v', 'm')
        AND has_table_privilege(r.oid, c.oid, 'SELECT, INSERT, UPDATE, DELETE')
      ORDER BY c.relname, r.rolname`);

    if (rows.length) {
      for (const row of rows) console.error(`  ✘ ${row.table} is still granted to ${row.role}`);
      throw new Error(`${rows.length} grant(s) to the Data API roles remain.`);
    }
    console.log("✅ No table in \"public\" is granted to the Data API roles (anon, authenticated).");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("❌ Lockdown failed:\n");
  console.error(error);
  process.exit(1);
});
