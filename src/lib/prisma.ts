import type { PoolClient } from "pg";
import { types as pgTypes } from "pg";
import { databaseConnection } from "../prisma/connection";
import { db, pool } from "../prisma/db";
import { describeTls, resolveDatabaseUrl } from "../prisma/tls";

export { db };

// Force offline / demo mode via env (useful in sandboxes with restricted DB access)
const FORCE_OFFLINE =
  process.env.FORCE_OFFLINE_MODE === "true" || process.env.DB_MODE === "offline";

// A database is configured when Prisma Composer wired one to this service
// (`prisma deploy` / `prisma dev`) or DATABASE_URL is set; see
// src/prisma/connection.ts.
const rawHasDatabase = databaseConnection.source !== "none" && !FORCE_OFFLINE;

if (FORCE_OFFLINE) {
  console.log("[db] FORCE_OFFLINE_MODE enabled — running in demo mode (no DB queries)");
} else if (databaseConnection.source === "composer") {
  console.log("[db] Database provided by Prisma Composer — will attempt Postgres connection (may fall back)");
} else if (databaseConnection.source === "env") {
  console.log(
    `[db] DATABASE_URL detected — will attempt Postgres connection (may fall back); ${describeTls(resolveDatabaseUrl(databaseConnection.url).tls)}`,
  );
} else {
  console.log("[db] No database configured — running in demo/offline mode");
}

/**
 * Mutable flag (live ESM binding) — downgraded to false when the connection
 * probe or a query fails, so the app can serve demo/offline content instead
 * of crashing.
 */
export let hasDatabase = rawHasDatabase;

/* ── Hand-written SQL ─────────────────────────────────────────────────────
 *
 * Typed queries go through `db.orm.public.<Model>`. The helpers below are for
 * the SQL this app writes by hand with positional `$1` parameters: the boot
 * DDL, and the tables that live outside the Prisma contract (group-call
 * relay, highlights index, sports picks). They run on the same pool as `db`.
 */

const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_TIMESTAMP = 1114;

function parseUtc(value: string, fallback: (value: string) => unknown): unknown {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback(value) : parsed;
}

/**
 * Result decoding for hand-written SQL, applied per query so the typed client's
 * own codecs are untouched:
 *  - `bigint` (e.g. COUNT(*)) is a JS BigInt rather than a string;
 *  - `timestamp` / `date` columns are read as UTC, never the server's local
 *    zone — every DateTime in the schema is a UTC `timestamp(6)`.
 */
const rawTypes = {
  getTypeParser(oid: number, format?: "text" | "binary") {
    const fallback = pgTypes.getTypeParser(oid, format as "text") as (value: string) => unknown;
    if (format === "binary") return fallback;
    if (oid === OID_INT8) return (value: string) => BigInt(value);
    if (oid === OID_TIMESTAMP) return (value: string) => parseUtc(`${value.replace(" ", "T")}Z`, () => fallback(value));
    if (oid === OID_DATE) return (value: string) => parseUtc(`${value}T00:00:00Z`, () => fallback(value));
    return fallback;
  },
};

type Queryable = Pick<PoolClient, "query">;

async function run(target: Queryable, text: string, values: unknown[]) {
  // No values → simple protocol, which also accepts multi-statement DDL.
  return target.query({ text, values: values.length ? values : undefined, types: rawTypes as never });
}

/** Run a SELECT (or anything with RETURNING) and get its rows. */
export async function rawQuery<T = Record<string, unknown>>(text: string, ...values: unknown[]): Promise<T[]> {
  const result = await run(pool, text, values);
  return (result.rows ?? []) as T[];
}

/** Run a statement and get the number of rows it affected. */
export async function rawExecute(text: string, ...values: unknown[]): Promise<number> {
  const result = await run(pool, text, values);
  return result.rowCount ?? 0;
}

export type RawTransaction = {
  query<T = Record<string, unknown>>(text: string, ...values: unknown[]): Promise<T[]>;
  execute(text: string, ...values: unknown[]): Promise<number>;
};

/**
 * Run hand-written SQL statements in one transaction on one connection.
 * Commits when `fn` resolves, rolls back when it throws.
 */
export async function rawTransaction<T>(fn: (tx: RawTransaction) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken: Error | undefined;
  try {
    await client.query("BEGIN");
    const tx: RawTransaction = {
      async query<R>(text: string, ...values: unknown[]) {
        return ((await run(client, text, values)).rows ?? []) as R[];
      },
      async execute(text: string, ...values: unknown[]) {
        return (await run(client, text, values)).rowCount ?? 0;
      },
    };
    const result = await fn(tx);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      // The connection is unusable; destroy it instead of returning it.
      broken = rollbackError as Error;
    }
    throw error;
  } finally {
    client.release(broken);
  }
}

/** Close the client and its pool. For scripts; a server keeps them open. */
export async function closeDb(): Promise<void> {
  await db.close();
  if (!pool.ended) await pool.end();
}

/**
 * Lightweight connection probe, run once per process. On failure we
 * permanently downgrade to demo mode for this process.
 */
let connectionTested = false;

/** Node's codes for a server certificate that failed verification. */
const CERTIFICATE_ERRORS = new Set([
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

export async function ensureDbConnection(): Promise<boolean> {
  if (!hasDatabase || connectionTested) return hasDatabase;
  connectionTested = true;

  try {
    await rawQuery("SELECT 1");
    console.log("[db] Postgres connection verified");
    return true;
  } catch (err: any) {
    console.warn(
      "[db] Postgres connection failed — switching to demo/offline mode:",
      err?.message || err,
    );
    if (CERTIFICATE_ERRORS.has(err?.code)) {
      console.warn(
        "[db] The server's TLS certificate was not accepted. For Supabase, set DATABASE_CA_CERT to the " +
          "certificate from the project's database settings (see DATABASE.md).",
      );
    }
    hasDatabase = false;
    return false;
  }
}

export function markDatabaseDown() {
  hasDatabase = false;
}
