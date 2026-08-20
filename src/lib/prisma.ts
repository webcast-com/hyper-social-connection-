import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

// Force offline / demo mode via env (useful in sandboxes with restricted DB access)
const FORCE_OFFLINE =
  process.env.FORCE_OFFLINE_MODE === "true" || process.env.DB_MODE === "offline";

const rawHasDatabase = !!process.env.DATABASE_URL && !FORCE_OFFLINE;

if (FORCE_OFFLINE) {
  console.log("[db] FORCE_OFFLINE_MODE enabled — running in demo mode (no DB queries)");
} else if (!rawHasDatabase) {
  console.log("[db] No DATABASE_URL — running in demo/offline mode");
} else {
  console.log("[db] DATABASE_URL detected — will attempt Postgres connection (may fall back)");
}

/**
 * Mutable flag (live ESM binding) — downgraded to false when the connection
 * probe or a query fails, so the app can serve demo/offline content instead
 * of crashing.
 */
export let hasDatabase = rawHasDatabase;

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter, log: [{ emit: "event", level: "error" }] });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Prisma Client singleton (server-side only). The guard prevents Next.js dev
 * hot-reload from creating a new client (and a new connection pool) on every
 * reload.
 */
export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Lightweight connection probe, run once per process. On failure we
 * permanently downgrade to demo mode for this process.
 */
let connectionTested = false;

export async function ensureDbConnection(): Promise<boolean> {
  if (!hasDatabase || connectionTested) return hasDatabase;
  connectionTested = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("[db] Postgres connection verified");
    return true;
  } catch (err: any) {
    console.warn(
      "[db] Postgres connection failed — switching to demo/offline mode:",
      err?.message || err,
    );
    hasDatabase = false;
    return false;
  }
}

export function markDatabaseDown() {
  hasDatabase = false;
}
