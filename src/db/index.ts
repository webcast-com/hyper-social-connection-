import { drizzle } from "drizzle-orm/node-postgres";
import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";
import * as schema from "./schema";

const supabaseUrl = process.env.SUPABASE_URL || "https://xyz.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const connectionString =
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  (process.env.POSTGRES_HOST && process.env.POSTGRES_USER && process.env.POSTGRES_PASSWORD
    ? `postgresql://${encodeURIComponent(process.env.POSTGRES_USER)}:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DATABASE || 'postgres'}`
    : undefined);

const isRemoteDatabase = Boolean(connectionString && !/(localhost|127\\.0\\.1)/i.test(connectionString));

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ...(isRemoteDatabase ? { ssl: { rejectUnauthorized: false } } : {}),
});

export const db = drizzle(pool, { schema });
