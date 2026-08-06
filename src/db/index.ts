import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export { supabase } from "./supabase";

// Postgres connection used by drizzle and raw SQL. Set DATABASE_URL in
// .env.local to your Supabase connection string (see .env.example).
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });
