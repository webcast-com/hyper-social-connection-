/**
 * Reports, without changing anything, how the site's databases are wired:
 *
 *   1. what the live site says about its own database (`/api/health`);
 *   2. the previous database (`SOURCE_DATABASE_URL`, or the `DATABASE_URL` in
 *      the repository's `.env.local` / `.env`): does it answer, and how many
 *      accounts and posts does it hold;
 *   3. the Supabase database (`SUPABASE_DATABASE_URL`): is the string set, does
 *      it look like a Supabase pooler string, does it answer, are the tables
 *      there, how many accounts and posts, and is the Data API closed.
 *
 *   npm run db:status
 *
 * Every query is a SELECT inside a read-only transaction. Passwords are never
 * printed: a database is named by host, port and database name only.
 */
import { existsSync, readFileSync } from "node:fs";
import { parse as parseEnvFile } from "dotenv";
import { Pool } from "pg";
import { describeTls, poolConfig, resolveDatabaseUrl } from "../src/prisma/tls";

const SITE_URL = (process.env.STATUS_SITE_URL || "https://hyper.co.ke").replace(/\/+$/, "");
const CONNECT_TIMEOUT_MS = 20_000;

type Probe = {
  answered: boolean;
  error?: string;
  version?: string;
  user?: string;
  tables?: number;
  users?: number | null;
  posts?: number | null;
  apiRoleTables?: number | null;
};

function where(url: string): string {
  try {
    const parsed = new URL(url);
    // Anything else is not a connection URL, and its "path" could be the password.
    if (!/^postgres(ql)?:$/.test(parsed.protocol)) return "(not a postgres:// URL)";
    return `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
  } catch {
    return "(not a URL)";
  }
}

function previousDatabase(): { url: string; from: string } | null {
  const explicit = process.env.SOURCE_DATABASE_URL?.trim();
  if (explicit) return { url: explicit, from: "the SOURCE_DATABASE_URL secret" };
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    const url = parseEnvFile(readFileSync(file))["DATABASE_URL"]?.trim();
    if (url && url !== "-") return { url, from: `DATABASE_URL in ${file}` };
  }
  return null;
}

const NOT_A_URL = "It is not a connection URL. Copy the whole string from the Supabase \"Connect\" button, starting with postgresql://.";

/** Things about a Supabase string that are known to stop it working. */
function supabaseStringNotes(url: string): string[] {
  const notes: string[] = [];
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [NOT_A_URL];
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) return [NOT_A_URL];
  const host = parsed.hostname;
  const port = parsed.port || "5432";
  if (/\[|\]/.test(decodeURIComponent(parsed.password)) || /YOUR-PASSWORD/i.test(url)) {
    notes.push("The password still looks like the placeholder ([YOUR-PASSWORD]). Replace it, brackets included, with the database password.");
  }
  if (!parsed.password) notes.push("It has no password.");
  if (host.endsWith(".pooler.supabase.com")) {
    if (!parsed.username.includes(".")) notes.push("On a pooler host the user must be postgres.<project ref>, not plain postgres.");
    if (port === "6543") notes.push("Port 6543 is the transaction pooler. That is right for Vercel; the workflows need the session pooler, port 5432.");
  } else if (/^db\..+\.supabase\.co$/.test(host)) {
    notes.push("This is the direct host, which answers on IPv6 only. GitHub Actions and Vercel need the pooler host (…pooler.supabase.com).");
  } else {
    notes.push(`The host ${host} is not a Supabase host.`);
  }
  if (parsed.searchParams.has("sslmode")) {
    notes.push("It carries sslmode=…; remove that parameter (the certificate check it asks for fails on Supabase without DATABASE_CA_CERT).");
  }
  return notes;
}

async function probe(url: string, env: Record<string, string | undefined>): Promise<Probe> {
  const pool = new Pool({ ...poolConfig(url, env), max: 1, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
  pool.on("error", () => {});
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN TRANSACTION READ ONLY");
      const who = await client.query("SELECT current_user AS u, current_setting('server_version') AS v");
      const tables = await client.query(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'prisma_contract'",
      );
      const names = new Set(tables.rows.map((row) => row.tablename as string));
      const count = async (table: string) =>
        names.has(table) ? Number((await client.query(`SELECT count(*) AS n FROM public."${table}"`)).rows[0].n) : null;
      const users = await count("users");
      const posts = await count("posts");
      // Tables the Supabase Data API roles may read or write. Null where those
      // roles do not exist (any database that is not Supabase).
      const api = await client.query(`
        SELECT CASE WHEN count(r.oid) = 0 THEN NULL ELSE count(DISTINCT c.oid) FILTER (
                 WHERE has_table_privilege(r.oid, c.oid, 'SELECT, INSERT, UPDATE, DELETE')) END AS n
          FROM pg_roles r
          LEFT JOIN pg_class c ON c.relkind IN ('r', 'p') AND c.relnamespace = 'public'::regnamespace
         WHERE r.rolname IN ('anon', 'authenticated')`);
      await client.query("ROLLBACK");
      return {
        answered: true,
        user: who.rows[0].u,
        version: who.rows[0].v,
        tables: names.size,
        users,
        posts,
        apiRoleTables: api.rows[0].n === null ? null : Number(api.rows[0].n),
      };
    } finally {
      client.release();
    }
  } catch (error) {
    const err = error as { code?: string; message?: string };
    return { answered: false, error: [err.code, err.message].filter(Boolean).join(": ") || String(error) };
  } finally {
    await pool.end().catch(() => {});
  }
}

/** A string that is not a connection URL is not handed to the driver at all. */
async function probeIfUrl(url: string, env: Record<string, string | undefined>): Promise<Probe> {
  if (where(url).startsWith("(")) return { answered: false, error: "not a postgres:// connection URL" };
  return probe(url, env);
}

function explain(error: string): string {
  if (/planLimitReached|account has restrictions/i.test(error)) {
    return "Prisma has restricted the account that owns this database because it reached its plan's limit. Nothing can read or write its data until the restriction is lifted in the Prisma Console (upgrade the plan or contact Prisma support).";
  }
  if (/28P01|password authentication failed/i.test(error)) return "The password in the string is wrong.";
  if (/tenant or user not found|XX000/i.test(error)) return "The pooler does not know this project: check the user (postgres.<project ref>) and the pooler host and region.";
  if (/ENOTFOUND|EAI_AGAIN/i.test(error)) return "The host name does not exist.";
  if (/ENETUNREACH/i.test(error)) return "The host only answers on IPv6; use the pooler host.";
  if (/ECONNREFUSED/i.test(error)) return "Nothing is listening at that host and port.";
  if (/terminated unexpectedly|ECONNRESET/i.test(error)) return "The server accepted the connection and then dropped it: the database is gone, suspended, or refusing this address.";
  if (/timeout/i.test(error)) return "No answer within 20 seconds.";
  if (/SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME/i.test(error)) return "The server's certificate was not accepted: remove sslmode from the string.";
  return "";
}

function describeProbe(result: Probe): string[] {
  if (!result.answered) {
    const hint = explain(result.error ?? "");
    return [`- Answers: **no** — \`${result.error}\`${hint ? `\n- Meaning: ${hint}` : ""}`];
  }
  const lines = [`- Answers: **yes** (PostgreSQL ${result.version}, signed in as \`${result.user}\`)`];
  lines.push(`- App tables: **${result.tables}**${result.tables === 0 ? " — the tables have not been created" : ""}`);
  if (result.users !== null && result.users !== undefined) lines.push(`- Accounts: **${result.users}**, posts: **${result.posts ?? "no posts table"}**`);
  return lines;
}

async function siteHealth(): Promise<{ line: string; db: boolean | null }> {
  try {
    const response = await fetch(`${SITE_URL}/api/health`, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
    const body = (await response.json()) as {
      db?: boolean;
      mode?: string;
      warning?: string;
      error?: string;
      storage?: string;
      storageOk?: boolean;
      storageDetail?: string;
      database?: { provider?: string | null; variable?: string | null; prismaPaused?: boolean };
    };
    const detail = body.warning || body.error;
    // Sites built before the health report named the host say nothing here.
    const host = body.database?.provider
      ? `It is hosted by **${body.database.provider}** (from \`${body.database.variable ?? "the deploy"}\`).`
      : "The site does not say which one: that is whatever DATABASE_URL holds in Vercel.";
    const files =
      body.storage === undefined
        ? ""
        : `\n- Uploaded photos and videos go to: **${body.storage}**${body.storageOk === false ? ` — **not answering** (${body.storageDetail ?? "no detail"})` : body.storageOk === true ? " (answering)" : ""}`;
    const paused = body.database?.prismaPaused ? "\n- A variable still points at Prisma Postgres; it is paused and is not used." : "";
    return {
      db: body.db === true,
      line:
        body.db === true
          ? `- ${SITE_URL}/api/health: **connected to a database** (mode \`${body.mode}\`). ${host}${files}${paused}`
          : `- ${SITE_URL}/api/health: **not connected to any database** (mode \`${body.mode}\`${detail ? `; "${detail}"` : ""}). The site is showing demo content and nothing people post is saved.${files}${paused}`,
    };
  } catch (error) {
    return { db: null, line: `- ${SITE_URL}/api/health: could not be read (${(error as Error).message})` };
  }
}

async function main() {
  const out: string[] = ["# Database status", ""];

  out.push("## The live site", "");
  const site = await siteHealth();
  out.push(site.line, "");

  out.push("## Previous database", "");
  const previous = previousDatabase();
  let previousResult: Probe | null = null;
  if (!previous) {
    out.push("- No connection string: SOURCE_DATABASE_URL is not set and the .env files have no DATABASE_URL.", "");
  } else {
    const env = { DATABASE_SSL: process.env.SOURCE_DATABASE_SSL, DATABASE_CA_CERT: process.env.SOURCE_DATABASE_CA_CERT };
    out.push(`- Taken from ${previous.from}: \`${where(previous.url)}\` (${describeTls(resolveDatabaseUrl(previous.url, env).tls)})`);
    previousResult = await probeIfUrl(previous.url, env);
    out.push(...describeProbe(previousResult), "");
  }

  out.push("## Supabase database", "");
  const supabase = process.env.SUPABASE_DATABASE_URL?.trim();
  let supabaseResult: Probe | null = null;
  if (!supabase) {
    out.push("- The repository secret **SUPABASE_DATABASE_URL is not set**. Nothing in GitHub can reach Supabase until it is.", "");
  } else {
    const env = { DATABASE_SSL: undefined, DATABASE_CA_CERT: process.env.SUPABASE_CA_CERT };
    out.push(`- SUPABASE_DATABASE_URL is set: \`${where(supabase)}\` (${describeTls(resolveDatabaseUrl(supabase, env).tls)})`);
    for (const note of supabaseStringNotes(supabase)) out.push(`- Note: ${note}`);
    supabaseResult = await probeIfUrl(supabase, env);
    out.push(...describeProbe(supabaseResult));
    if (supabaseResult.answered && supabaseResult.tables && supabaseResult.apiRoleTables !== null && supabaseResult.apiRoleTables !== undefined) {
      out.push(
        supabaseResult.apiRoleTables === 0
          ? "- Data API: closed (no table is granted to `anon` or `authenticated`)"
          : `- Data API: **${supabaseResult.apiRoleTables} table(s) are open** to \`anon\` / \`authenticated\`. Run the database-migrate workflow to close them.`,
      );
    }
    out.push("");
  }

  out.push("## What is left", "");
  const steps: string[] = [];
  if (!supabase) {
    steps.push("Add the repository secret SUPABASE_DATABASE_URL (the Supabase \"Session pooler\" string, port 5432).");
  } else if (!supabaseResult?.answered) {
    steps.push("Correct the SUPABASE_DATABASE_URL secret: the string is set but Supabase does not accept it (see above).");
  } else if (supabaseResult.tables === 0) {
    steps.push(
      previousResult?.answered
        ? "Run the database-copy workflow (check, then copy): it creates the tables and brings the accounts and posts over."
        : "Run the database-migrate workflow to create the tables.",
    );
  } else if (previousResult?.answered && (previousResult.users ?? 0) > (supabaseResult.users ?? 0)) {
    steps.push(`Run the database-copy workflow: the previous database holds ${previousResult.users} accounts, Supabase ${supabaseResult.users ?? 0}.`);
  }
  if (previous && previousResult && !previousResult.answered && /planLimitReached|account has restrictions/i.test(previousResult.error ?? "")) {
    steps.push(
      "To bring the existing accounts and posts over, first get the restriction on the Prisma account lifted (Prisma Console). After that, run the database-copy workflow: check, then copy.",
    );
  } else if (previous && previousResult && !previousResult.answered) {
    steps.push(
      "The previous database does not answer, so there is nothing to copy from it as things stand. If the site's accounts and posts live in a different database, put its connection string in the SOURCE_DATABASE_URL secret.",
    );
  }
  if (site.db !== true) {
    steps.push(
      "In Vercel, set DATABASE_URL (Production) to the Supabase \"Transaction pooler\" string (port 6543) and redeploy. Until then the site runs without a database.",
    );
  }
  if (steps.length === 0) {
    steps.push(
      "Nothing that can be seen from here: the site is connected to a database and Supabase holds the tables and the data. Confirm in Vercel that DATABASE_URL is the Supabase string.",
    );
  }
  steps.forEach((step, index) => out.push(`${index + 1}. ${step}`));

  console.log(out.join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
