/**
 * Where the database connection comes from.
 *
 * The app runs in two kinds of place, and each hands over the database
 * differently:
 *
 *  1. **Under Prisma Composer** (`prisma deploy`, `prisma dev`): the service
 *     declaration in `service.ts` receives the database it was wired to, and
 *     `service.load().db` returns it. There is no usable `DATABASE_URL` there:
 *     on a Composer project that variable holds the placeholder "-".
 *  2. **Everywhere else** (`next dev`, `next start`, Vercel, Netlify, the
 *     scripts): `DATABASE_URL`, or failing that the variables the Supabase ↔
 *     Vercel integration sets (`POSTGRES_URL`, …). A value that points at
 *     Prisma's hosted database is skipped while it is paused. The order and
 *     the pause are in ./database-url.ts.
 *
 * Composer is tried first, so a Composer deploy never falls through to the
 * placeholder. During `next build` neither is present and the app builds in
 * offline mode.
 */
import type { Pool } from "pg";
import service from "../../service";
import { chooseDatabaseUrl, type DatabaseUrlVariable } from "./database-url";

export type DatabaseConnection =
  | { source: "composer"; url: string; pool?: Pool }
  | { source: "env"; url: string; variable: DatabaseUrlVariable; skipped: DatabaseUrlVariable[] }
  /** `skipped` names variables that were set but point at the paused Prisma database. */
  | { source: "none"; skipped: DatabaseUrlVariable[] };

/** Composer hands its values to the process under names with this prefix. */
const COMPOSER_PREFIX = "COMPOSER_";

function underComposer(): boolean {
  return Object.keys(process.env).some((key) => key.startsWith(COMPOSER_PREFIX));
}

function resolveConnection(): DatabaseConnection {
  if (underComposer()) {
    try {
      const { db } = service.load();
      // Composer's pool waits out a database that is still waking up and
      // drops idle connections before the server does, so the app runs on it
      // rather than opening a second pool.
      const connection = db.connection;
      return connection.kind === "pgPool"
        ? { source: "composer", url: db.url, pool: connection.pool }
        : { source: "composer", url: db.url };
    } catch (error) {
      // Composer variables are present but the database is not among them.
      // Say so, then fall back: a silent fallback here would hide a deploy
      // whose wiring is broken.
      console.error(
        "[db] Prisma Composer did not provide a database for this service:",
        (error as Error)?.message || error,
      );
    }
  }

  const choice = chooseDatabaseUrl();
  if (choice.url) return { source: "env", url: choice.url, variable: choice.variable, skipped: choice.skipped };
  return { source: "none", skipped: choice.skipped };
}

export const databaseConnection: DatabaseConnection = resolveConnection();
