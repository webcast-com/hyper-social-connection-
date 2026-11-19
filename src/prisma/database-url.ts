/**
 * Which environment variable names the database, and whether it may be used.
 *
 * Read in this order:
 *
 *   DATABASE_URL               set by hand (Vercel, a shell, the .env files)
 *   POSTGRES_URL               set by the Supabase ↔ Vercel integration: the
 *                              transaction pooler, the right one for the site
 *   POSTGRES_PRISMA_URL        the same pooler, as some integrations name it
 *   POSTGRES_URL_NON_POOLING   the session connection, as a last resort
 *
 * So connecting the Supabase project to the Vercel project is enough: no
 * connection string has to be copied anywhere.
 *
 * **Prisma Postgres is paused.** A value that points at Prisma's hosted
 * database (`db.prisma.io`) is skipped, and the next variable is tried. The
 * repository's `.env` still carries that address, and the database behind it
 * refuses connections ("planLimitReached"), so reading it would only delay
 * every cold start and hide the Supabase database behind it. Nothing is
 * deleted: set `PRISMA_POSTGRES=on` and the address is used again.
 *
 * This file has no imports, so the scripts and the tests can use it without
 * loading the app.
 */

type Env = Record<string, string | undefined>;

/** Placeholder Prisma Composer writes into `DATABASE_URL` on its projects. */
const DATABASE_URL_PLACEHOLDER = "-";

export const DATABASE_URL_VARIABLES = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
] as const;

export type DatabaseUrlVariable = (typeof DATABASE_URL_VARIABLES)[number];

export type DatabaseProvider = "supabase" | "prisma" | "local" | "other";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Prisma's hosted Postgres: `db.prisma.io`, `pooled.db.prisma.io`, … */
export function isPrismaPostgresUrl(url: string): boolean {
  const host = hostOf(url);
  return host === "db.prisma.io" || host.endsWith(".db.prisma.io");
}

/** A Supabase pooler (`….pooler.supabase.com`) or direct host (`db.….supabase.co`). */
export function isSupabaseUrl(url: string): boolean {
  const host = hostOf(url);
  return host.endsWith(".supabase.com") || host.endsWith(".supabase.co");
}

/** Who hosts the database, for the health report. Never includes the address. */
export function databaseProvider(url: string): DatabaseProvider {
  if (isSupabaseUrl(url)) return "supabase";
  if (isPrismaPostgresUrl(url)) return "prisma";
  const host = hostOf(url);
  if (!host || host === "localhost" || host === "::1" || /^127\./.test(host) || !host.includes(".")) return "local";
  return "other";
}

export function prismaPostgresPaused(env: Env = process.env): boolean {
  const setting = env["PRISMA_POSTGRES"]?.trim().toLowerCase();
  return !(setting === "on" || setting === "true" || setting === "1" || setting === "yes");
}

export type DatabaseUrlChoice =
  | { url: string; variable: DatabaseUrlVariable; skipped: DatabaseUrlVariable[] }
  | { url: null; variable: null; skipped: DatabaseUrlVariable[] };

/**
 * The connection string to use, the variable it came from, and the variables
 * that were passed over because they point at the paused Prisma database.
 */
export function chooseDatabaseUrl(env: Env = process.env): DatabaseUrlChoice {
  const paused = prismaPostgresPaused(env);
  const skipped: DatabaseUrlVariable[] = [];
  for (const variable of DATABASE_URL_VARIABLES) {
    const url = env[variable]?.trim();
    if (!url || url === DATABASE_URL_PLACEHOLDER) continue;
    if (paused && isPrismaPostgresUrl(url)) {
      skipped.push(variable);
      continue;
    }
    return { url, variable, skipped };
  }
  return { url: null, variable: null, skipped };
}
