import { hasDatabase, describeDatabase, ensureDbConnection, rawQuery } from "@/lib/prisma";
import { checkStorage, getStorageDriver, type StorageCheck } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Is the site wired?
 *
 *   db        true when a query against Postgres just succeeded
 *   database  who hosts it (`supabase`, `prisma`, …) and which variable named
 *             it; never the address. `prismaPaused` is true when a variable
 *             points at Prisma Postgres and was skipped (src/prisma/database-url.ts).
 *   storage   where uploads go: `supabase`, `s3` or `local`
 *   storageOk whether that store answered just now (only Supabase is asked)
 *
 * Always 200: the app is designed to work in demo mode, so this reports the
 * state instead of failing.
 */
export async function GET() {
  const storage = getStorageDriver();
  const database = describeDatabase();
  const store: StorageCheck = await checkStorage().catch((error) => ({
    driver: storage,
    ok: false,
    detail: (error as Error)?.message || "storage check failed",
  }));
  const base = {
    ok: true,
    storage,
    storageOk: store.ok,
    ...(store.detail ? { storageDetail: store.detail } : {}),
    database,
  };

  if (!hasDatabase) {
    return Response.json({
      ...base,
      db: false,
      mode: "offline",
      warning:
        database.prismaPaused && !database.provider
          ? "The only database configured is Prisma Postgres, which is paused — running in offline/demo mode until Supabase is connected"
          : "DATABASE_URL not available or connection failed — running in offline/demo mode",
    });
  }

  try {
    // Use the resilient one-shot probe
    const connected = await ensureDbConnection();

    if (connected) {
      // Extra lightweight query to confirm
      await rawQuery("SELECT 1");
      return Response.json({ ...base, db: true, mode: "postgres" });
    }
    return Response.json({
      ...base,
      db: false,
      mode: "offline",
      warning: "Postgres connection probe failed — now in demo mode",
    });
  } catch (err: any) {
    console.warn("[health] DB check failed (downgraded):", err?.message || err);
    return Response.json({
      ...base,
      db: false,
      mode: "offline",
      error: err?.message || "connection failed",
    });
  }
}
