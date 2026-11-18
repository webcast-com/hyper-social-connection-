/**
 * Prisma ORM 8 client.
 *
 * The contract is emitted from `prisma/schema.prisma` by `prisma contract emit`
 * (see `prisma.config.ts`), so `contract.json` / `contract.d.ts` next to this
 * file are generated and must never be edited by hand.
 *
 * One `pg` pool backs everything: the typed client below runs on it, and the
 * hand-written SQL in `src/lib/prisma.ts` (`rawQuery` / `rawExecute`) borrows
 * connections from the same pool, so the app never holds two sets of
 * connections to one database.
 *
 * Which database that is comes from `./connection`: the one Prisma Composer
 * wired to this service when the app is deployed with `prisma deploy`, or
 * `DATABASE_URL` everywhere else.
 */
import postgres from "@prisma/orm-postgres/runtime";
import { contractFromJson } from "@prisma/orm-postgres/static";
import { Pool } from "pg";
import { databaseConnection } from "./connection";
import { poolConfig } from "./tls";
import type { Contract } from "./contract.d";
import contractJson from "./contract.json" with { type: "json" };

export const contract = contractFromJson<Contract>(contractJson);

function createPool(): Pool {
  // Under Prisma Composer, run on the pool it built for this service.
  if (databaseConnection.source === "composer" && databaseConnection.pool) {
    return databaseConnection.pool;
  }

  // With no database configured the pool is never used: `hasDatabase` in
  // src/lib/prisma.ts is false and every caller checks it first.
  //
  // A `DATABASE_URL` connection gets its TLS settings from ./tls (Supabase and
  // other hosts whose connection string does not ask for TLS). The URL
  // Composer provides is used as it is.
  const created = new Pool(
    databaseConnection.source === "env"
      ? poolConfig(databaseConnection.url)
      : { connectionString: databaseConnection.source === "none" ? undefined : databaseConnection.url },
  );
  // An idle connection dropped by the server must not take the process down.
  created.on("error", (err) => {
    console.warn("[db] idle Postgres connection error:", err?.message || err);
  });
  return created;
}

function createClient(pg: Pool) {
  // The explicit binding form, not `pg: pool`: that form recognises the pool
  // with `instanceof`, which fails when the pool was created by another copy
  // of `pg` (Composer's, once bundled).
  return postgres({ contract, binding: { kind: "pgPool", pool: pg } });
}

type Db = ReturnType<typeof createClient>;

const globalForDb = globalThis as unknown as { __hyperPgPool?: Pool; __hyperDb?: Db };

/**
 * Module-level singletons (server-side only). The guard keeps Next.js dev
 * hot-reload from opening a new connection pool on every reload.
 */
export const pool: Pool = globalForDb.__hyperPgPool ?? createPool();
export const db: Db = globalForDb.__hyperDb ?? createClient(pool);

if (process.env.NODE_ENV !== "production") {
  globalForDb.__hyperPgPool = pool;
  globalForDb.__hyperDb = db;
}
