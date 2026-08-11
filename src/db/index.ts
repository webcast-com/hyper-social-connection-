import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Force offline / demo mode via env (useful in sandboxes with restricted DB access)
const FORCE_OFFLINE = process.env.FORCE_OFFLINE_MODE === "true" || 
                      process.env.DB_MODE === "offline";

// Postgres connection used by drizzle and raw SQL. Works with ANY PostgreSQL
// database — Neon, AWS RDS, Railway, DigitalOcean, a local install, etc.
// Set DATABASE_URL in .env.local (see .env.example).
const rawHasDatabase = !!process.env.DATABASE_URL && !FORCE_OFFLINE;

// We expose a mutable hasDatabase so connection failures can downgrade gracefully
export let hasDatabase = rawHasDatabase;

if (FORCE_OFFLINE) {
  console.log("[db] FORCE_OFFLINE_MODE enabled — running in demo mode (no DB queries)");
} else if (!rawHasDatabase) {
  console.log("[db] No DATABASE_URL — running in demo/offline mode");
} else {
  console.log("[db] DATABASE_URL detected — will attempt Postgres connection (may fall back)");
}

// Managed providers (Neon, RDS, Railway, …) require TLS; a local or
// self-hosted Postgres often has none. Default to TLS with relaxed cert
// validation, and allow `DATABASE_SSL=false` in .env.local for plain-TCP
// local databases.
const sslOption =
  process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: false };

export const pool: Pool = hasDatabase
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslOption,
      max: 3,
      connectionTimeoutMillis: 4000,
      idleTimeoutMillis: 10000,
      query_timeout: 6000,
    })
  : (null as unknown as Pool);

// drizzle still needs a Pool instance at import time. When DATABASE_URL is
// missing we create a dummy pool that will never be queried.
const drizzlePool = hasDatabase
  ? pool
  : new Pool({ 
      connectionString: "postgres://user:pass@localhost:5432/postgres", 
      connectionTimeoutMillis: 500, 
      idleTimeoutMillis: 500,
      max: 1
    });

export const db = drizzle(drizzlePool, { schema });

// Attempt a lightweight connection probe on first use.
// If it fails, we permanently downgrade to demo mode for this process.
let connectionTested = false;

export async function ensureDbConnection(): Promise<boolean> {
  if (!hasDatabase || connectionTested) return hasDatabase;
  connectionTested = true;

  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    console.log("[db] Postgres connection verified");
    return true;
  } catch (err: any) {
    console.warn("[db] Postgres connection failed — switching to demo/offline mode:", err?.message || err);
    hasDatabase = false;
    return false;
  }
}

// Patch db.execute and other calls to downgrade on first failure
const originalExecute = (db as any).execute?.bind(db);
if (originalExecute) {
  (db as any).execute = async (...args: any[]) => {
    if (!hasDatabase) {
      throw new Error("DB not available (demo mode)");
    }
    try {
      return await originalExecute(...args);
    } catch (e: any) {
      if (e?.message?.includes("ECONNRESET") || e?.message?.includes("terminated")) {
        console.warn("[db] Connection lost — downgrading to demo mode");
        hasDatabase = false;
      }
      throw e;
    }
  };
}
