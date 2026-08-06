import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export { supabase } from "./supabase";

// Postgres connection used by drizzle and raw SQL. Set DATABASE_URL in
// .env.local to your Supabase connection string (see .env.example).
export const hasDatabase = !!process.env.DATABASE_URL;

export const pool: Pool = hasDatabase
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : (null as unknown as Pool);

// drizzle still needs a Pool instance at import time. When DATABASE_URL is
// missing we create a dummy pool that will never be queried — every DB
// call site handles the failure and falls back to empty/mock data so pages
// still render instead of 500-ing.
const drizzlePool = hasDatabase
  ? pool
  : new Pool({ connectionString: "postgres://user:pass@localhost:5432/postgres", connectionTimeoutMillis: 1000, idleTimeoutMillis: 1000 });

export const db = drizzle(drizzlePool, { schema });
