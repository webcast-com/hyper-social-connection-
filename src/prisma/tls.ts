/**
 * TLS for the `DATABASE_URL` connection.
 *
 * `node-postgres` only encrypts a connection when the connection string asks
 * for it (`sslmode=…`). The strings Supabase hands out carry no `sslmode`, so
 * used as they are the app would talk to the database in plain text. And with
 * `sslmode=require` added, `node-postgres` checks the server certificate
 * against the public certificate authorities, which Supabase's own authority
 * is not among, so the connection is refused.
 *
 * This module decides, in order:
 *
 *  1. `DATABASE_SSL=false`     → no TLS (a local database without TLS).
 *  2. `DATABASE_CA_CERT` set   → TLS, and the server certificate must be
 *                                signed by that authority and match the host.
 *                                This is the setting to use with Supabase.
 *  3. The URL says how         → left to `node-postgres` (`sslmode`, `ssl`,
 *                                `sslrootcert`, …), unchanged.
 *  4. Local or private host    → no TLS.
 *  5. Anything else            → TLS, encrypted but without checking the
 *                                certificate.
 *
 * The app (`src/prisma/db.ts`) and the `prisma db …` commands
 * (`prisma.config.ts`) both go through here, so they connect the same way.
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type DatabaseTls =
  /** Plain connection. */
  | { mode: "off"; reason: "DATABASE_SSL" | "local" }
  /** Encrypted, certificate checked against `ca`. */
  | { mode: "verify"; ca: string }
  /** Encrypted, certificate not checked. */
  | { mode: "encrypt" }
  /** Whatever the connection string asks for. */
  | { mode: "url" };

export type ResolvedDatabaseUrl = {
  /** The connection string, without its TLS parameters unless `mode` is "url". */
  url: string;
  tls: DatabaseTls;
};

type Env = Record<string, string | undefined>;

/** Connection-string parameters that set up TLS in `node-postgres`. */
const TLS_PARAMS = ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"];

const DISABLED = new Set(["false", "0", "off", "no", "disable", "disabled"]);

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** A database on this machine or on a private network, where TLS is usually off. */
export function isLocalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) return true; // Unix socket
  if (host === "localhost" || host === "::1" || host.endsWith(".localhost")) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  // A bare name ("db", "postgres") is a container or LAN host.
  return !host.includes(".") && !host.includes(":");
}

/**
 * Read `DATABASE_CA_CERT`: the certificate itself (PEM text, with real line
 * breaks or `\n` escapes) or the path of a file that holds it.
 */
export function readCaCertificate(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes("-----BEGIN")) return trimmed.replace(/\\n/g, "\n");
  if (existsSync(trimmed)) return readFileSync(trimmed, "utf8");
  throw new Error(
    "DATABASE_CA_CERT is neither a PEM certificate nor the path of an existing file. " +
      "Paste the certificate text (it starts with -----BEGIN CERTIFICATE-----) or point it at the downloaded file.",
  );
}

function withoutTlsParams(parsed: URL): string {
  const copy = new URL(parsed.href);
  for (const name of TLS_PARAMS) copy.searchParams.delete(name);
  return copy.href;
}

export function resolveDatabaseUrl(url: string, env: Env = process.env): ResolvedDatabaseUrl {
  const parsed = parse(url);
  // Not a URL this module can read (a libpq "key=value" string, say): leave
  // every decision to node-postgres.
  if (!parsed) return { url, tls: { mode: "url" } };

  const setting = env["DATABASE_SSL"]?.trim().toLowerCase();
  if (setting && DISABLED.has(setting)) {
    return { url: withoutTlsParams(parsed), tls: { mode: "off", reason: "DATABASE_SSL" } };
  }

  const ca = readCaCertificate(env["DATABASE_CA_CERT"]);
  if (ca) return { url: withoutTlsParams(parsed), tls: { mode: "verify", ca } };

  if (TLS_PARAMS.some((name) => parsed.searchParams.has(name))) return { url, tls: { mode: "url" } };

  // `?host=/var/run/postgresql` is a Unix socket whatever the URL host says.
  const host = parsed.searchParams.get("host")?.startsWith("/") ? "" : parsed.hostname;
  if (isLocalHost(host)) return { url, tls: { mode: "off", reason: "local" } };

  return { url, tls: { mode: "encrypt" } };
}

/** Options for `new Pool(…)` in the app. */
export function poolConfig(url: string, env: Env = process.env) {
  const resolved = resolveDatabaseUrl(url, env);
  switch (resolved.tls.mode) {
    case "off":
      return { connectionString: resolved.url, ssl: false as const };
    case "verify":
      return { connectionString: resolved.url, ssl: { ca: resolved.tls.ca, rejectUnauthorized: true } };
    case "encrypt":
      return { connectionString: resolved.url, ssl: { rejectUnauthorized: false } };
    case "url":
      return { connectionString: resolved.url };
  }
}

/**
 * The same decision written into the connection string, for the `prisma db …`
 * commands: they take a URL and nothing else. A certificate given as text is
 * written to a temporary file, because a URL can only name a file.
 */
export function cliConnectionString(url: string | undefined, env: Env = process.env): string | undefined {
  if (!url) return url;
  const resolved = resolveDatabaseUrl(url, env);
  if (resolved.tls.mode === "url") return resolved.url;

  const next = new URL(resolved.url);
  switch (resolved.tls.mode) {
    case "off":
      // Only say so when a TLS parameter was removed; a local URL stays as typed.
      if (resolved.tls.reason === "local") return resolved.url;
      next.searchParams.set("sslmode", "disable");
      break;
    case "verify": {
      const file = join(mkdtempSync(join(tmpdir(), "db-ca-")), "ca.crt");
      writeFileSync(file, resolved.tls.ca, { mode: 0o600 });
      next.searchParams.set("sslmode", "verify-full");
      next.searchParams.set("sslrootcert", file);
      break;
    }
    case "encrypt":
      next.searchParams.set("sslmode", "no-verify");
      break;
  }
  return next.href;
}

/** One line for the server log; never includes the connection string. */
export function describeTls(tls: DatabaseTls): string {
  switch (tls.mode) {
    case "off":
      return tls.reason === "local" ? "no TLS (local database)" : "no TLS (DATABASE_SSL=false)";
    case "verify":
      return "TLS, certificate verified against DATABASE_CA_CERT";
    case "encrypt":
      return "TLS, certificate not verified (set DATABASE_CA_CERT to verify it)";
    case "url":
      return "TLS as set in the connection string";
  }
}
