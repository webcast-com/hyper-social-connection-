import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

/**
 * Prisma Client singleton (server-side only).
 *
 * NEVER import this from a browser/client component — it opens a real database
 * connection and holds credentials. Use it from server components, route
 * handlers, server actions, and scripts only.
 *
 * The singleton guard prevents Next.js dev hot-reload from creating a new
 * client (and a new connection pool) on every reload, which would exhaust the
 * database's connection limit. Prisma Postgres allows only 10 direct
 * connections on the free plan.
 */
const connectionString = `${process.env.DATABASE_URL}`;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
