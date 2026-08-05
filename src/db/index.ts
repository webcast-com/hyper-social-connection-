import { drizzle } from "drizzle-orm/node-postgres";
import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";
import * as schema from "./schema";

const supabaseUrl = process.env.SUPABASE_URL || "https://xyz.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const connectionString = process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export const db = drizzle(pool, { schema });
