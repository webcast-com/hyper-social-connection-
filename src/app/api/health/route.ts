import { db, hasDatabase, ensureDbConnection } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  // Always return 200 — the app is designed to work in demo mode.
  // We just report the DB status accurately.
  if (!hasDatabase) {
    return Response.json({ 
      ok: true, 
      db: false, 
      mode: "offline",
      warning: "DATABASE_URL not available or connection failed — running in offline/demo mode" 
    });
  }

  try {
    // Use the new resilient probe
    const connected = await ensureDbConnection();
    
    if (connected) {
      // Extra lightweight query to confirm
      await db.execute(sql`select 1`);
      return Response.json({ ok: true, db: true, mode: "supabase" });
    } else {
      return Response.json({ 
        ok: true, 
        db: false, 
        mode: "offline",
        warning: "Supabase Postgres connection probe failed — now in demo mode" 
      });
    }
  } catch (err: any) {
    console.warn('[health] DB check failed (downgraded):', err?.message || err);
    return Response.json({ 
      ok: true, 
      db: false, 
      mode: "offline",
      error: err?.message || "connection failed" 
    });
  }
}
